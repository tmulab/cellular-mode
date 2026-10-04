// A plugin that runs as a child process: the LIFECYCLE decisions, on top of `channel.mjs`.
//
// Separate process means failure ISOLATION, and that is all it means. It is not a sandbox:
// the child runs with the host user's privileges and can read whatever that user can read.
// What the host controls is narrow and worth stating exactly: WHICH program runs (argv from
// the operator's file, `shell: false`), from WHICH directory, with WHICH environment
// variables, for HOW long, and WHAT it is allowed to be asked. Everything else is trust.
//
// Restart policy: at most ONE automatic restart, then the plugin stays down. A restart loop
// converts a reproducible defect into an intermittent one and hides it from the operator.
import { KernelError } from '../sdk/index.mjs';
import { UPP_CODES, remoteToResult } from '../upp/index.mjs';
import { createChannel } from './channel.mjs';
import { admit, authorizedCapabilities, initializeParams } from './handshake.mjs';
import { minimalEnv } from './operator.mjs';

/** @typedef {import('../sdk/types.mjs').Result} Result */
/** @typedef {import('../upp/errors.mjs').UppError} UppError */
/** @typedef {Record<string, unknown>} Raw */
/** @typedef {import('./types.mjs').ProcessTransport} ProcessTransport */
/** @typedef {import('./types.mjs').Authorization} Authorization */

export const HOST_IDENTITY = Object.freeze({ name: 'eip/upp-host', version: '1.0' });

/**
 * @param {{ authorization: Authorization, config?: Raw,
 *   host?: { name: string, version: string }, spawnChannel?: typeof createChannel,
 *   onEvent?: (event: { type: string, detail: Raw }) => void }} wiring
 * @returns {Promise<{ ok: true, value: ProcessTransport } | { ok: false, error: UppError }>}
 */
export async function startProcessPlugin(wiring) {
  const { authorization, config = {}, host = HOST_IDENTITY } = wiring;
  const open = wiring.spawnChannel ?? createChannel;
  const { entry, manifest, digest, dir, timeouts } = authorization;
  const id = String(manifest.id);
  const allowed = authorizedCapabilities(manifest);
  const command = /** @type {ReadonlyArray<string>} */ (entry.command ?? []);
  const env = minimalEnv(/** @type {ReadonlyArray<string>} */ (entry.env ?? []));
  const mayRestart = entry.restart === true;

  /** @type {'ready' | 'unhealthy' | 'stopped'} */
  let state = 'stopped';
  /** @type {ReturnType<typeof createChannel> | null} */
  let channel = null;
  let restarts = 0;
  let protocolVersion = '';

  // Diagnostics fan out to whoever is listening. The host operator gets `onEvent` at start;
  // the kernel adapter adds `ctx.emit` at load, which is how a captured stderr line becomes a
  // normal `plugin` kernel event carrying this plugin's key — observable, never parsed.
  /** @type {Array<(detail: Raw) => void>} */
  const watchers = [];
  if (wiring.onEvent !== undefined) watchers.push((detail) => wiring.onEvent?.({ type: 'plugin', detail }));
  /** @param {Raw} detail */
  const emit = (detail) => { for (const watcher of watchers) watcher({ plugin: id, ...detail }); };

  /** Spawn and complete the handshake, or leave nothing running.
   * @returns {Promise<{ ok: true } | { ok: false, error: UppError }>} */
  async function connect() {
    const live = open({
      command,
      cwd: dir,
      env,
      onStderr: (line) => emit({ stream: 'stderr', line }),
      onBreach: (error) => {
        state = 'unhealthy';
        emit({ breach: error.code, message: error.message });
        void live.kill();
      },
      onExit: (code, signal) => {
        if (state !== 'stopped') state = 'unhealthy';
        emit({ exit: code, signal });
      },
    });
    channel = live;
    const answer = await live.send('upp.initialize',
      initializeParams(host, config), { timeoutMs: timeouts.startupMs });
    if (!answer.ok) {
      state = 'stopped';
      await live.kill();
      return Object.freeze({ ok: false, error: answer.error });
    }
    const verdict = admit(answer.value, { manifest, digest });
    if (!verdict.ok) {
      state = 'stopped';
      await live.kill();
      return Object.freeze({ ok: false, error: verdict.error });
    }
    protocolVersion = verdict.protocolVersion;
    state = 'ready';
    return Object.freeze({ ok: true });
  }

  const started = await connect();
  if (!started.ok) return started;

  /** One restart, at most, and only when the operator asked for it.
   * @returns {Promise<boolean>} */
  async function revive() {
    if (!mayRestart || restarts >= 1) return false;
    restarts += 1;
    emit({ restart: restarts });
    const again = await connect();
    if (!again.ok) {
      state = 'unhealthy';
      emit({ restartFailed: again.error.code, message: again.error.message });
      return false;
    }
    return true;
  }

  /** @type {(code: string, message: string) => Result} */
  const refuse = (code, message) => new KernelError(code, message).toResult();

  /** @param {string} method @param {Raw} params
   * @param {{ signal?: AbortSignal | undefined, timeoutMs?: number }} bounds @returns {Promise<Result>} */
  async function call(method, params, bounds) {
    if (state === 'unhealthy' && !(await revive())) {
      return refuse('PLUGIN_ERROR', `"${id}" is unhealthy and was not restarted`);
    }
    if (channel === null || !channel.alive()) {
      if (!(await revive())) return refuse('PLUGIN_ERROR', `"${id}" is not running`);
    }
    const live = /** @type {ReturnType<typeof createChannel>} */ (channel);
    const answer = await live.send(method, params, bounds);
    if (answer.ok) return Object.freeze({ ok: true, value: answer.value });
    // A breach on the INBOUND stream is the peer's fault, whatever integer it carries: an
    // oversized or malformed line is `PLUGIN_ERROR`, never the caller's `INPUT_INVALID`.
    // An outbound refusal under the same integer records no breach and keeps its meaning.
    const inbound = live.lastBreach();
    if (inbound !== null) {
      state = 'unhealthy';
      return new KernelError('PLUGIN_ERROR', inbound.message, inbound.data.details ?? []).toResult();
    }
    if (answer.error.code === UPP_CODES.PLUGIN_UNAVAILABLE) state = 'unhealthy';
    return remoteToResult(answer.error);
  }

  /** @type {ProcessTransport} */
  const transport = Object.freeze({
    id,
    runtime: /** @type {'process'} */ ('process'),
    manifest,
    digest,
    capabilities: allowed,
    protocolVersion: () => protocolVersion,
    state: () => state,
    pid: () => channel?.pid ?? null,
    restarts: () => restarts,
    counters: () => channel?.counters() ?? null,
    lastBreach: () => channel?.lastBreach() ?? null,
    onDiagnostic: (/** @type {(detail: Raw) => void} */ fn) => { watchers.push(fn); },

    /** The one way in. The capability is checked against the PINNED manifest first, so an
     * unauthorised id costs zero bytes on the wire.
     * @param {string} capability @param {unknown} input
     * @param {{ signal?: AbortSignal | undefined, deadlineMs?: number }} [options] @returns {Promise<Result>} */
    async execute(capability, input, options = {}) {
      if (!allowed.includes(capability)) {
        return refuse('PERMISSION_DENIED',
          `"${id}" does not declare "${String(capability)}" in its pinned manifest — nothing was sent`);
      }
      const deadlineMs = options.deadlineMs ?? timeouts.requestMs;
      const result = await call('upp.execute', { capability, input, deadlineMs },
        { signal: options.signal, timeoutMs: deadlineMs });
      if (!result.ok) return result;
      return Object.freeze({ ok: true, value: /** @type {Raw} */ (result.value).output });
    },

    /** @returns {Promise<Result>} */
    health: () => call('upp.health', {}, { timeoutMs: timeouts.requestMs }),

    /** Graceful, then firm: `upp.shutdown` under a deadline, `upp.exit` as a notification,
     * then a kill if the process is still there. No orphan survives either branch.
     * @returns {Promise<void>} */
    async shutdown() {
      const live = channel;
      state = 'stopped';
      if (live === null) return;
      if (live.alive()) {
        await live.send('upp.shutdown', {}, { timeoutMs: timeouts.shutdownMs });
        live.notify('upp.exit', {});
        live.closeStdin();
        await Promise.race([
          new Promise((resolve) => { setTimeout(resolve, timeouts.shutdownMs); }),
          live.whenExited(),
        ]);
      }
      await live.kill();
      emit({ shutdown: true });
    },
  });
  return Object.freeze({ ok: true, value: transport });
}
