// A plugin that runs as a separate SERVICE: JSON-RPC over `POST <baseUrl>/upp`.
//
// The host does not start it, does not stop it and cannot kill it. So the three guarantees
// a process plugin gets from the operating system have to be bought differently here:
//   · isolation — it was never ours to begin with; the service's own boundary is the seam.
//   · identity — the same manifest PIN as everywhere else. A service that answers a
//     different manifest than the reviewed one is refused at `initialize`, like a child.
//   · reachability — LOOPBACK by default. A non-loopback `baseUrl` requires `allowRemote`
//     and a bearer token read from an environment variable NAME; the token's VALUE is never
//     logged, never put in an error and never written to disk by this module.
//
// Redirects are NOT followed (`redirect: 'error'`): a 302 is an endpoint telling the host to
// talk to someone else, and "someone else" is exactly what the pin and the loopback rule
// exist to prevent. The body is read under a cap, with the same 1 MiB bound as a frame.
import {
  JSONRPC_CODES, MAX_MESSAGE_BYTES, UPP_CODES, createIdSequence, deserialize, remoteToResult,
  request, serialize, uppError, validateResponse,
} from '../upp/index.mjs';
import { KernelError } from '../sdk/index.mjs';
import { isLoopbackUrl } from './config.mjs';
import { admit, authorizedCapabilities, initializeParams } from './handshake.mjs';
import { HOST_IDENTITY } from './process-transport.mjs';

/** @typedef {import('../sdk/types.mjs').Result} Result */
/** @typedef {import('../upp/errors.mjs').UppError} UppError */
/** @typedef {Record<string, unknown>} Raw */
/** @typedef {import('./types.mjs').Authorization} Authorization */
/** @typedef {import('./types.mjs').Transport} Transport */
/** @typedef {{ ok: true, value: Raw } | { ok: false, error: UppError }} Answer */

export const UPP_PATH = '/upp';
export const ACCEPTED_STATUSES = Object.freeze([200, 204]);

/** @type {(code: number, message: string, detail?: string) => { ok: false, error: UppError }} */
const fail = (code, message, detail = 'no answer was received') => Object.freeze({
  ok: false, error: uppError(code, message, [{ path: '', message: detail }]),
});

/** The endpoint, with the authorisation header the operator configured — by NAME.
 * @param {Raw} entry @param {NodeJS.ProcessEnv} env
 * @returns {{ ok: true, url: string, headers: Record<string, string> } | { ok: false, error: UppError }} */
export function endpointOf(entry, env = process.env) {
  const baseUrl = String(entry.baseUrl ?? '');
  if (!isLoopbackUrl(baseUrl) && entry.allowRemote !== true) {
    return fail(UPP_CODES.CAPABILITY_NOT_AUTHORIZED,
      `"${String(entry.id)}" names a non-loopback baseUrl without allowRemote:true — refused`,
      'nothing was contacted');
  }
  /** @type {Record<string, string>} */
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (!isLoopbackUrl(baseUrl)) {
    const name = String(entry.bearerTokenEnv ?? '');
    const token = env[name];
    if (typeof token !== 'string' || token === '') {
      return fail(JSONRPC_CODES.INVALID_PARAMS,
        `the environment variable "${name}" named by bearerTokenEnv holds no token`, 'nothing was contacted');
    }
    headers.authorization = `Bearer ${token}`;
  }
  return Object.freeze({ ok: true, url: new URL(UPP_PATH, baseUrl).toString(), headers });
}

/**
 * @param {{ authorization: Authorization, config?: Raw, host?: { name: string, version: string },
 *   fetchImpl?: typeof fetch, env?: NodeJS.ProcessEnv }} wiring
 * @returns {Promise<{ ok: true, value: Transport } | { ok: false, error: UppError }>}
 */
export async function startHttpPlugin(wiring) {
  const { authorization, config = {}, host = HOST_IDENTITY } = wiring;
  const call = wiring.fetchImpl ?? fetch;
  const { entry, manifest, digest, timeouts } = authorization;
  const id = String(manifest.id);
  const allowed = authorizedCapabilities(manifest);
  const endpoint = endpointOf({ ...entry, id }, wiring.env ?? process.env);
  if (!endpoint.ok) return endpoint;
  const { url, headers } = endpoint;
  const ids = createIdSequence();
  /** @type {'ready' | 'unhealthy' | 'stopped'} */
  let state = 'stopped';
  let protocolVersion = '';

  /** @param {string} method @param {Raw} params
   * @param {{ signal?: AbortSignal | undefined, timeoutMs?: number }} bounds @returns {Promise<Answer>} */
  async function post(method, params, bounds) {
    const envelope = request(ids.next(), method, params);
    const framed = serialize(envelope, MAX_MESSAGE_BYTES);
    if (!framed.ok) return Object.freeze({ ok: false, error: framed.error });
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    bounds.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = typeof bounds.timeoutMs === 'number' && bounds.timeoutMs > 0
      ? setTimeout(() => controller.abort(), bounds.timeoutMs)
      : null;
    try {
      const response = await call(url, {
        method: 'POST', headers, body: framed.value,
        signal: controller.signal, redirect: 'error',
      });
      if (!ACCEPTED_STATUSES.includes(response.status)) {
        return fail(UPP_CODES.PLUGIN_UNAVAILABLE, `"${id}" answered HTTP ${response.status}`);
      }
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_MESSAGE_BYTES) {
        return fail(UPP_CODES.PAYLOAD_TOO_LARGE, `"${id}" answered more than ${MAX_MESSAGE_BYTES} bytes`);
      }
      const parsed = deserialize(text, MAX_MESSAGE_BYTES);
      if (!parsed.ok) return Object.freeze({ ok: false, error: parsed.error });
      const verdict = validateResponse(parsed.value,
        { id: /** @type {number} */ (envelope.id), method });
      if (!verdict.ok) return Object.freeze({ ok: false, error: verdict.error });
      const { result, error } = verdict.value;
      return error !== undefined
        ? Object.freeze({ ok: false, error })
        : Object.freeze({ ok: true, value: result ?? {} });
    } catch (cause) {
      if (bounds.signal?.aborted) return fail(UPP_CODES.CANCELLED, `${method} was cancelled by the caller`);
      if (controller.signal.aborted) return fail(UPP_CODES.TIMEOUT, `${method} exceeded ${String(bounds.timeoutMs)}ms`);
      return fail(UPP_CODES.PLUGIN_UNAVAILABLE, `"${id}" is unreachable: ${String(cause)}`);
    } finally {
      if (timer !== null) clearTimeout(timer);
      bounds.signal?.removeEventListener('abort', onAbort);
    }
  }

  const hello = await post('upp.initialize', initializeParams(host, config), { timeoutMs: timeouts.startupMs });
  if (!hello.ok) return Object.freeze({ ok: false, error: hello.error });
  const verdict = admit(hello.value, { manifest, digest });
  if (!verdict.ok) return verdict;
  protocolVersion = verdict.protocolVersion;
  state = 'ready';

  /** @param {string} method @param {Raw} params
   * @param {{ signal?: AbortSignal | undefined, timeoutMs?: number }} bounds @returns {Promise<Result>} */
  async function send(method, params, bounds) {
    const answer = await post(method, params, bounds);
    if (answer.ok) return Object.freeze({ ok: true, value: answer.value });
    if (answer.error.code === UPP_CODES.PLUGIN_UNAVAILABLE) state = 'unhealthy';
    return remoteToResult(answer.error);
  }

  /** @type {Transport & { url: string }} */
  const transport = Object.freeze({
    id,
    runtime: /** @type {'http'} */ ('http'),
    manifest,
    digest,
    capabilities: allowed,
    url,
    protocolVersion: () => protocolVersion,
    state: () => state,

    /** @param {string} capability @param {unknown} input
     * @param {{ signal?: AbortSignal | undefined, deadlineMs?: number }} [options] @returns {Promise<Result>} */
    async execute(capability, input, options = {}) {
      if (!allowed.includes(capability)) {
        return new KernelError('PERMISSION_DENIED',
          `"${id}" does not declare "${String(capability)}" in its pinned manifest — nothing was sent`).toResult();
      }
      const deadlineMs = options.deadlineMs ?? timeouts.requestMs;
      const result = await send('upp.execute', { capability, input, deadlineMs },
        { signal: options.signal, timeoutMs: deadlineMs });
      if (!result.ok) return result;
      return Object.freeze({ ok: true, value: /** @type {Raw} */ (result.value).output });
    },

    /** @returns {Promise<Result>} */
    health: () => send('upp.health', {}, { timeoutMs: timeouts.requestMs }),

    /** The host asks; it cannot enforce. A service it did not start is a service it does
     * not stop, and saying so is more useful than pretending. @returns {Promise<void>} */
    async shutdown() {
      state = 'stopped';
      await send('upp.shutdown', {}, { timeoutMs: timeouts.shutdownMs });
    },
  });
  return Object.freeze({ ok: true, value: transport });
}
