// One GET against an application's health endpoint, under a deadline, and nothing more.
//
// An application plugin speaks no UPP: it is an app, so `upp.health` would be a protocol the
// host has no right to require of a Next.js server. What the host CAN require is the thing
// every deployable already has — a path that answers 200 when the app is up. That is the
// whole contract, and keeping it that small is what makes "any stack can be an application
// plugin" true rather than aspirational.
//
// Three refusals before the request is made, each one a hole it would otherwise leave open:
//   · `healthPath` must be a RELATIVE path — `//evil.example/h` starts with a slash and
//     names another origin, so a probe built by joining it would leave the app entirely;
//   · the resolved URL must keep the app's own ORIGIN, checked after resolution rather than
//     trusted before it;
//   · redirects are NOT followed: a 302 is an endpoint asking the host to talk to someone
//     else, and the health of someone else is not the health of this app.
import { JSONRPC_CODES, UPP_CODES, uppError } from '../upp/index.mjs';
import { isRelativePath } from '../upp/sections.mjs';

/** @typedef {import('../upp/errors.mjs').UppError} UppError */

/** A health body is a courtesy, not a contract: enough to log, never enough to parse into
 * authority. Anything past this is dropped. */
export const MAX_HEALTH_BODY_BYTES = 16 * 1024;

export const HEALTHY_STATUS = 200;

/** @type {(code: number, message: string, detail: string) => { ok: false, error: UppError }} */
const fail = (code, message, detail) => Object.freeze({
  ok: false, error: uppError(code, message, [{ path: 'healthPath', message: detail }]),
});

/** The probe URL, or a refusal. PURE — it decides nothing about the network.
 * @param {string} baseUrl @param {string} healthPath
 * @returns {{ ok: true, url: string } | { ok: false, error: UppError }} */
export function healthUrlOf(baseUrl, healthPath) {
  if (!isRelativePath(healthPath)) {
    return fail(JSONRPC_CODES.INVALID_PARAMS,
      `healthPath must be a relative path, got ${JSON.stringify(healthPath)}`, 'nothing was contacted');
  }
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return fail(JSONRPC_CODES.INVALID_PARAMS, `baseUrl is not a URL: ${JSON.stringify(baseUrl)}`,
      'nothing was contacted');
  }
  const url = new URL(healthPath, base);
  if (url.origin !== base.origin) {
    return fail(JSONRPC_CODES.INVALID_PARAMS,
      `the health URL left the application's origin: ${url.origin} is not ${base.origin}`,
      'nothing was contacted');
  }
  return Object.freeze({ ok: true, url: url.toString() });
}

/**
 * Probe `baseUrl + healthPath`. Resolves — never throws: a host supervising several
 * applications must be able to report "two healthy, one unreachable and why".
 * @param {{ baseUrl: string, healthPath: string, timeoutMs?: number,
 *   fetchImpl?: typeof fetch }} probe
 * @returns {Promise<{ ok: true, status: number, body: string } | { ok: false, error: UppError }>}
 */
export async function probeApplication(probe) {
  const resolved = healthUrlOf(probe.baseUrl, probe.healthPath);
  if (!resolved.ok) return resolved;
  const call = probe.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = probe.timeoutMs ?? 2000;
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await call(resolved.url, {
      method: 'GET',
      headers: { accept: 'application/json, text/plain' },
      signal: controller.signal,
      redirect: 'error',
    });
    const text = (await response.text()).slice(0, MAX_HEALTH_BODY_BYTES);
    if (response.status !== HEALTHY_STATUS) {
      return fail(UPP_CODES.PLUGIN_UNAVAILABLE,
        `the application answered HTTP ${response.status} on ${probe.healthPath}`,
        'the application is unhealthy');
    }
    return Object.freeze({ ok: true, status: response.status, body: text });
  } catch (cause) {
    if (controller.signal.aborted) {
      return fail(UPP_CODES.TIMEOUT, `the health probe exceeded ${timeoutMs}ms`, 'no answer');
    }
    return fail(UPP_CODES.PLUGIN_UNAVAILABLE,
      `the application is unreachable: ${String(cause)}`, 'no answer');
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
