// Calling a capability. The order of the gates is the contract: found -> input valid
// -> approved (if consequential) -> run under a deadline -> output valid. A later gate
// never compensates for an earlier one. `execute` RETURNS a structured result and does
// not throw: a caller at the edge (HTTP, agent gateway) must answer without a catch.
import { KernelError, check, messageOf, passthroughOf, stackOf } from '../sdk/index.mjs';

/** @typedef {import('../sdk/types.mjs').Capability} Capability */
/** @typedef {import('../sdk/types.mjs').Err} Err */
/** @typedef {import('../sdk/types.mjs').Result} Result */
/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */
/** @typedef {import('../sdk/types.mjs').Verdict} Verdict */
/** @typedef {import('./types.mjs').CapabilityFn} CapabilityFn */
/** @typedef {import('./types.mjs').Located} Located */

class Interrupted extends Error {
  /** @param {'CANCELLED' | 'TIMEOUT'} kind */
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

/** @type {(code: string, message: string, details?: ReadonlyArray<SchemaError>) => Err} */
const failure = (code, message, details) => new KernelError(code, message, details).toResult();

/** Pure shape check of an approval verdict. A malformed verdict is not consent.
 * @param {unknown} verdict @returns {Verdict} */
export function readVerdict(verdict) {
  // The cast names the three fields we are about to CHECK; each one is proved below.
  const raw = /** @type {{ approved?: unknown, by?: unknown, reason?: unknown }} */ (verdict);
  if (verdict === null || typeof verdict !== 'object' || typeof raw.approved !== 'boolean') {
    return { approved: false, by: null, reason: 'approver returned a malformed verdict' };
  }
  return {
    approved: raw.approved,
    by: typeof raw.by === 'string' ? raw.by : null,
    reason: typeof raw.reason === 'string' ? raw.reason : null,
  };
}

/** Run `run(signal)` under cancellation and an optional deadline. Rejects with
 * `Interrupted` so the caller can tell CANCELLED from TIMEOUT.
 * @param {(signal: AbortSignal) => unknown} run
 * @param {{ signal?: AbortSignal | undefined, timeoutMs?: number | undefined }} [bounds]
 * @returns {Promise<unknown>} */
export async function runWithDeadline(run, { signal, timeoutMs } = {}) {
  if (signal?.aborted) throw new Interrupted('CANCELLED');
  const controller = new AbortController();
  /** @type {'CANCELLED' | 'TIMEOUT'} */
  let kind = 'CANCELLED';
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** @type {Promise<never>} */
  const guard = new Promise((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Interrupted(kind)), { once: true });
    if (typeof timeoutMs === 'number' && timeoutMs >= 0) {
      timer = setTimeout(() => {
        kind = 'TIMEOUT';
        controller.abort();
      }, timeoutMs);
    }
  });
  guard.catch(() => {}); // the race may settle first; never an unhandled rejection
  const running = Promise.resolve().then(() => run(controller.signal));
  running.catch(() => {});
  try {
    return await Promise.race([running, guard]);
  } finally {
    if (timer !== null) clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** @param {{ registry: import('./types.mjs').Registry,
 *   lifecycle: import('./types.mjs').Lifecycle, events: import('./types.mjs').Events,
 *   approver?: import('./types.mjs').Approver | undefined,
 *   defaultTimeoutMs?: number | undefined }} wiring */
export function createExecutor({ registry, lifecycle, events, approver, defaultTimeoutMs }) {
  // The consequential gate: fail-closed - no approver at all means no. The verdict is
  // AWAITED because a human decision takes time (a prompt, a queue, a chat message),
  // and a gate that only accepts instant answers can never open for a person; a
  // synchronous approver still works unchanged.
  /** @param {string} key @param {string} capId @param {unknown} input @param {unknown} approval @returns {Promise<Err | null>} */
  async function decide(key, capId, input, approval) {
    const started = Date.now();
    if (typeof approver !== 'function') {
      events.emit({ type: 'approval', key, cap: capId, ok: false, code: 'APPROVAL_REQUIRED', ms: 0 });
      return failure('APPROVAL_REQUIRED',
        `"${key}#${capId}" is consequential and this kernel has no approver`);
    }
    let verdict;
    try {
      verdict = readVerdict(await approver({ key, cap: capId, input, consequential: true, approval }));
    } catch (cause) {
      events.emit({ type: 'approval', key, cap: capId, ok: false, code: 'APPROVAL_DENIED', ms: Date.now() - started });
      return failure('APPROVAL_DENIED',
        `approval for "${key}#${capId}" failed: ${messageOf(cause)}`);
    }
    events.emit({
      type: 'approval', key, cap: capId, ok: verdict.approved, by: verdict.by,
      code: verdict.approved ? undefined : 'APPROVAL_DENIED', ms: Date.now() - started,
    });
    if (!verdict.approved) {
      return failure('APPROVAL_DENIED',
        `approval for "${key}#${capId}" was denied${verdict.reason ? `: ${verdict.reason}` : ''}`);
    }
    return null; // approved
  }

  /** @param {string} key @param {string} capId @returns {Err | Located} */
  function locate(key, capId) {
    if (!registry.has(key)) return failure('NOT_FOUND', `no plugin registered for key "${key}"`);
    if (!lifecycle.isLoaded(key)) return failure('NOT_FOUND', `key "${key}" is registered but not loaded`);
    const manifest = registry.get(key);
    const cap = manifest.capabilities[capId];
    if (cap === undefined) return failure('NOT_FOUND', `"${key}" declares no capability "${capId}"`);
    const fn = lifecycle.serviceOf(key)[capId];
    if (typeof fn !== 'function') {
      return failure('CONTRACT_INVALID', `"${key}" declares "${capId}" but the service does not implement it`,
        [{ path: `capabilities.${capId}`, message: 'not implemented by the service' }]);
    }
    // `typeof fn === 'function'` is all a runtime can prove about a signature; the
    // assertion records the contract the manifest declared for this capability.
    return { cap, fn: /** @type {CapabilityFn} */ (fn), service: lifecycle.serviceOf(key) };
  }

  /** @param {string} key @param {string} capId @param {unknown} input
   * @param {{ approval?: unknown, signal?: AbortSignal | undefined,
   *   timeoutMs?: number | undefined }} [options] @returns {Promise<Result>} */
  async function execute(key, capId, input, options = {}) {
    const started = Date.now();
    const found = locate(key, capId);
    // `ok` exists only on a failure: a located capability carries cap/fn/service.
    if ('ok' in found) return finish(key, capId, started, found);
    const { cap, fn, service } = found;

    const inputCheck = check(cap.input, input);
    if (!inputCheck.ok) {
      return finish(key, capId, started, failure('INPUT_INVALID',
        `input for "${key}#${capId}" is invalid (${inputCheck.errors.length} problem(s))`,
        inputCheck.errors));
    }
    if (cap.consequential) {
      const denied = await decide(key, capId, input, options.approval);
      if (denied !== null) return finish(key, capId, started, denied);
    }

    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    let value;
    try {
      value = await runWithDeadline(
        (signal) => fn.call(service, input, { signal, key, cap: capId }),
        { signal: options.signal, timeoutMs },
      );
    } catch (cause) {
      if (cause instanceof Interrupted) {
        return finish(key, capId, started, failure(cause.kind,
          cause.kind === 'TIMEOUT' ? `"${key}#${capId}" exceeded ${timeoutMs}ms` : `"${key}#${capId}" was cancelled`));
      }
      // A CLIENT error is the plugin's own answer to give: the two PASSTHROUGH_CODES
      // keep their code and message, carry no stack, and raise no `error` event -
      // nothing faulted. Every other throw, INCLUDING a KernelError naming any other
      // code, is a contained fault: authority (APPROVAL_*, PERMISSION_DENIED) is the
      // host's to grant and never a plugin's to claim.
      const passed = passthroughOf(cause);
      if (passed !== null) return finish(key, capId, started, passed.toResult());
      // A fault is contained: code + message in the result, stack only in the
      // diagnostic event - a stack in an API response is an information leak.
      events.emit({
        type: 'error', key, cap: capId, ok: false, code: 'PLUGIN_ERROR',
        ms: Date.now() - started, stack: stackOf(cause),
      });
      const named = cause instanceof KernelError ? cause : null;
      return finish(key, capId, started, failure('PLUGIN_ERROR',
        `"${key}#${capId}" threw: ${messageOf(cause)}`,
        named ? [{ path: named.code, message: named.message }] : []));
    }

    const outputCheck = check(cap.output, value);
    if (!outputCheck.ok) {
      return finish(key, capId, started, failure('OUTPUT_INVALID',
        `output of "${key}#${capId}" is invalid (${outputCheck.errors.length} problem(s))`,
        outputCheck.errors));
    }
    return finish(key, capId, started, { ok: true, value });
  }

  /** @param {string} key @param {string} cap @param {number} started @param {Result} result @returns {Result} */
  function finish(key, cap, started, result) {
    events.emit({
      type: 'execute', key, cap, ok: result.ok === true,
      code: result.ok === true ? undefined : result.error.code, ms: Date.now() - started,
    });
    return result;
  }

  return { execute };
}
