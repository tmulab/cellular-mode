// One NDJSON conversation with one child process: the PIPE, and nothing above it.
//
// Correlation is next door in `correlate.mjs`; manifests, capability authorisation, health
// policy and restarts are a layer up in `process-transport.mjs`. That split is what makes the
// hard parts testable without a manifest or a kernel in sight.
//
// Three rules it enforces without asking anyone. stdout is PROTOCOL ONLY: a line that is not
// a frame is `-32700` and the conversation is over, because a stream that has lost alignment
// cannot be realigned by reading more of it. stderr is DIAGNOSTICS ONLY: captured, truncated,
// handed over as text and never parsed, so a plugin cannot answer a request by printing. An
// oversized OUTBOUND frame is refused with NOTHING written, because a partial write is how a
// peer's stream gets desynchronised by its own host.
import { spawn } from 'node:child_process';
import {
  JSONRPC_CODES, MAX_MESSAGE_BYTES, UPP_CODES, createIdSequence, deserialize, notification,
  request, serialize, uppError,
} from '../upp/index.mjs';
import { createCorrelator } from './correlate.mjs';
import { createLineReader } from './lines.mjs';

/** @typedef {import('../upp/errors.mjs').UppError} UppError @typedef {Record<string, unknown>} Raw */
/** @typedef {{ ok: true, value: Raw } | { ok: false, error: UppError }} Answer */

export const MAX_STDERR_LINE = 2048;

/** @type {(code: number, message: string, path?: string, detail?: string) => Answer} */
const fail = (code, message, path = '', detail = 'the request was not answered') => Object.freeze({
  ok: false, error: uppError(code, message, [{ path, message: detail }]),
});

/**
 * @param {{ command: ReadonlyArray<string>, cwd: string, env: Record<string, string>,
 *   limit?: number, onStderr?: (line: string) => void,
 *   onBreach?: (error: UppError) => void, onMessage?: (message: unknown) => void,
 *   onExit?: (code: number | null, signal: string | null) => void }} wiring
 */
export function createChannel(wiring) {
  const { command, cwd, env, limit = MAX_MESSAGE_BYTES } = wiring;
  const ids = createIdSequence();
  const reader = createLineReader({ limit });
  const calls = createCorrelator();
  let closed = false;
  /** The last INBOUND protocol breach, kept so the layer above can tell a peer's fault
   * (a malformed or oversized line it sent) from a caller's (a request too large to send).
   * Both are `-32700`/`-32006` on the wire and they are not the same event.
   * @type {UppError | null} */
  let breached = null;

  // `shell: false` is the whole security posture of this line: the executable and every
  // argument are passed as an argv ARRAY, so a space, a quote or a `&&` inside a
  // configuration value is an ARGUMENT and can never become a second command.
  const child = spawn(command[0] ?? '', [...command].slice(1), {
    shell: false, cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });

  /** @type {(bytes: number) => UppError} */
  const oversize = (bytes) => uppError(UPP_CODES.PAYLOAD_TOO_LARGE,
    `an inbound frame of ${bytes} bytes exceeds the ${limit}-byte cap and was discarded`,
    [{ path: '', message: 'the stream is desynchronised; the plugin is unhealthy' }]);

  /** @param {UppError} error */
  function breach(error) {
    calls.countBreach();
    breached = error;
    closed = true;
    calls.failAll(error);
    wiring.onBreach?.(error);
  }

  /** @param {Buffer} chunk */
  function ingest(chunk) {
    for (const line of reader.push(chunk)) {
      if (!line.ok) return breach(oversize(line.bytes));
      if (line.line.trim() === '') continue;
      const parsed = deserialize(line.line, limit);
      if (!parsed.ok) return breach(parsed.error);
      wiring.onMessage?.(parsed.value);
      calls.receive(parsed.value);
      if (closed) return;
    }
    return undefined;
  }

  child.stdout?.on('data', (/** @type {Buffer} */ chunk) => ingest(chunk));
  child.stdout?.on('end', () => {
    for (const line of reader.end()) if (!line.ok) breach(oversize(line.bytes));
  });
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (/** @type {string} */ text) => {
    for (const line of text.split('\n')) {
      if (line.trim() !== '') wiring.onStderr?.(line.slice(0, MAX_STDERR_LINE));
    }
  });
  child.on('error', (cause) => {
    closed = true;
    calls.failAll(uppError(UPP_CODES.PLUGIN_UNAVAILABLE, `the plugin process could not run: ${cause.message}`));
    wiring.onExit?.(null, null);
  });
  child.on('exit', (code, signal) => {
    closed = true;
    calls.failAll(uppError(UPP_CODES.PLUGIN_UNAVAILABLE,
      `the plugin process exited (code ${String(code)}, signal ${String(signal)}) with the request unanswered`));
    wiring.onExit?.(code, signal);
  });

  /** @param {Raw} message @returns {{ ok: true } | { ok: false, error: UppError }} */
  function write(message) {
    const framed = serialize(message, limit);
    if (!framed.ok) return Object.freeze({ ok: false, error: framed.error });
    if (closed || child.stdin === null || child.stdin.destroyed) {
      return Object.freeze({ ok: false, error: uppError(UPP_CODES.PLUGIN_UNAVAILABLE, 'the plugin stdin is closed') });
    }
    child.stdin.write(`${framed.value}\n`);
    calls.countSent();
    return Object.freeze({ ok: true });
  }

  /** Best-effort notification. A failure is reported, never thrown: cancellation must not
   * become a claim about the peer's behaviour. @param {string} method @param {Raw} [params] */
  const notify = (method, params = {}) => write(notification(method, params));

  /**
   * Send a request and await its answer under a deadline and an optional signal. The id is
   * retired on timeout and on abort, and `upp.cancel` is sent in both cases.
   * @param {string} method @param {Raw} params
   * @param {{ timeoutMs?: number, signal?: AbortSignal | undefined }} [bounds] @returns {Promise<Answer>}
   */
  function send(method, params, { timeoutMs, signal } = {}) {
    if (signal?.aborted) return Promise.resolve(fail(UPP_CODES.CANCELLED, `${method} was cancelled before it was sent`));
    const id = ids.next();
    const key = String(id);
    return new Promise((resolve) => {
      /** @type {ReturnType<typeof setTimeout> | null} */
      let timer = null;
      /** @type {(answer: Answer) => void} */
      const done = (answer) => {
        if (timer !== null) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(answer);
      };
      /** @type {(code: number, message: string) => void} */
      const give = (code, message) => {
        calls.retire(key);
        notify('upp.cancel', { id });
        done(fail(code, message, 'id', `request ${key} was retired by the host`));
      };
      const onAbort = () => give(UPP_CODES.CANCELLED, `${method} was cancelled by the caller`);
      calls.register(key, method, done);
      const written = write(request(id, method, params));
      if (!written.ok) {
        calls.retire(key);
        done(Object.freeze({ ok: false, error: written.error }));
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      if (typeof timeoutMs === 'number' && timeoutMs > 0) {
        timer = setTimeout(() => give(UPP_CODES.TIMEOUT, `${method} exceeded ${timeoutMs}ms`), timeoutMs);
      }
    });
  }

  /** True while the child is neither exited nor signalled. @returns {boolean} */
  const alive = () => child.exitCode === null && child.signalCode === null;
  /** Resolves when the child is gone — at once if it already is. @returns {Promise<void>} */
  const whenExited = () => (alive()
    ? new Promise((resolve) => { child.once('exit', () => resolve()); })
    : Promise.resolve());

  /** @returns {Promise<void>} */
  function kill() {
    if (!alive()) return Promise.resolve();
    const gone = whenExited();
    child.stdin?.end();
    child.kill();
    return gone;
  }

  return Object.freeze({
    pid: child.pid ?? null,
    send,
    notify,
    write,
    kill,
    closeStdin: () => child.stdin?.end(),
    // Raw line output, for the conformance replay only: a corpus must be able to send a
    // message `request()` would refuse to BUILD, and a line that is not JSON at all.
    writeLine: (/** @type {string} */ text) => {
      if (closed || child.stdin === null || child.stdin.destroyed) return false;
      child.stdin.write(`${text}
`);
      return true;
    },
    alive,
    whenExited,
    lastBreach: () => breached,
    pendingCount: calls.pendingCount,
    counters: calls.counters,
    endConversation: () => breach(uppError(JSONRPC_CODES.INTERNAL_ERROR, 'the host ended the conversation')),
  });
}
