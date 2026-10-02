// The agent gateway: the only door between an autonomous caller and the kernel.
//
// An agent is not a plugin and not a user. It is a caller with a ROLE, a narrow
// allow-list of `key#cap` entries, and — this is the whole point — no authority to
// consent to anything. Consent belongs to a human approver the HOST supplies to
// this gateway; the agent cannot pass one, and the one it tries to pass is
// discarded before the kernel is reached.
//
// It imports the kernel's PUBLIC entry and the SDK, nothing else. The gateway is a
// client of the kernel, not a part of it.
import { KernelError, messageOf } from '../sdk/index.mjs';

/** @typedef {import('../sdk/types.mjs').Err} Err */
/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */
/** Only the kernel's PUBLIC entry is named, in types as well as at runtime.
 * @typedef {ReturnType<typeof import('../kernel/index.mjs').createKernel>} Kernel */
/** @typedef {{ agentId: string, role: string, key: string, cap: string,
 *   decision: string, code?: string, at: string }} AuditEntry */
/** @typedef {(request: { key: string, cap: string, input: unknown, agentId: string,
 *   role: string, consequential: boolean }) => unknown} Approver */
/** What `consent` answers: either a refusal to return, or provenance to forward.
 * @typedef {{ result: Err, decision: string, approval?: undefined }
 *   | { result?: undefined, decision?: undefined,
 *       approval: { requestedBy: string, role: string, approvedBy: unknown } }} Gate */

const ENTRY = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*#[a-z][a-z0-9-]*$/;

/** PURE. `{key, cap}` of an `allow` entry, or `null` when it is malformed.
 * @param {unknown} entry @returns {{ key: string, cap: string } | null} */
export function parseEntry(entry) {
  if (typeof entry !== 'string' || !ENTRY.test(entry)) return null;
  const [key, cap] = entry.split('#');
  // The pattern already guarantees both halves; saying so beats assuming it.
  if (key === undefined || cap === undefined) return null;
  return { key, cap };
}

/**
 * Every field of `agent` is optional to the TYPE and mandatory to the CODE: the
 * constructor refuses a missing one with a TypeError, which is a better error than a
 * compile-time one for a composition assembled from configuration.
 * Every argument arrives as `unknown` on purpose: this constructor's job is to
 * REFUSE a malformed gateway, and a parameter it could not receive is a guard that
 * can never run. Each cast below records what the guard above it has just proved.
 * @param {unknown} kernel a kernel from `eip/kernel/index.mjs`
 * @param {{ agentId?: unknown, role?: unknown, allow?: unknown,
 *   approver?: unknown, now?: unknown }} [agent] `agentId` is who is calling (it goes
 *   into every audit entry), `role` is what the agent is FOR (roles grant nothing),
 *   `allow` is `['text.stats#count-words', …]` and is the whole authority, `approver`
 *   is the HUMAN decision for consequential calls (absent means every consequential
 *   call ends in APPROVAL_REQUIRED) and `now` is an injectable clock for tests.
 */
export function createAgentGateway(kernel, agent = {}) {
  const { allow = [], approver, now } = agent;
  if (kernel === null || typeof /** @type {{ execute?: unknown }} */ (kernel)?.execute !== 'function') {
    throw new TypeError('createAgentGateway needs a kernel with an execute function');
  }
  if (typeof agent.agentId !== 'string' || agent.agentId.trim() === '') throw new TypeError('agentId is required');
  if (typeof agent.role !== 'string' || agent.role.trim() === '') throw new TypeError('role is required');
  if (!Array.isArray(allow)) throw new TypeError('allow must be an array of "key#cap" entries');
  if (approver !== undefined && typeof approver !== 'function') throw new TypeError('approver must be a function');
  // Read into constants once the guards above have proved them: a narrowing on a
  // parameter does not travel into the closures below, and these do.
  const host = /** @type {Kernel} */ (kernel);
  const agentId = agent.agentId;
  const role = agent.role;
  if (approver !== undefined && typeof approver !== 'function') throw new TypeError('approver must be a function');
  const ask = approver === undefined ? undefined : /** @type {Approver} */ (approver);

  // A malformed entry is a TypeError at construction, never a silent no-match: an
  // allow-list with a typo would look like a permission and behave like a wall.
  /** @type {Set<string>} */
  const allowed = new Set();
  for (const entry of /** @type {unknown[]} */ (allow)) {
    if (parseEntry(entry) === null) {
      throw new TypeError(`allow entry must look like "domain.key#capability-id", got ${JSON.stringify(entry)}`);
    }
    allowed.add(String(entry));
  }

  const clock = typeof now === 'function'
    ? /** @type {() => string} */ (now)
    : () => new Date().toISOString();
  /** @type {AuditEntry[]} */
  const trail = [];
  /** @type {(key: string, cap: string, decision: string, code?: string) => AuditEntry} */
  const record = (key, cap, decision, code) => {
    /** @type {AuditEntry} */
    const entry = { agentId, role, key, cap, decision, at: clock() };
    if (code !== undefined) entry.code = code;
    trail.push(Object.freeze(entry));
    return entry;
  };

  /** Public metadata only: whether this capability leaves a trace in the world.
   * @type {(key: string, cap: string) => boolean} */
  const isConsequential = (key, cap) => host.list()
    .find((manifest) => manifest.name === key)?.capabilities?.[cap]?.consequential === true;

  /** @type {(code: string, message: string, details?: ReadonlyArray<SchemaError>) => Err} */
  const fail = (code, message, details) => new KernelError(code, message, details).toResult();

  /** The human gate for an agent's consequential request. Absent means no.
   * @param {string} key @param {string} cap @param {unknown} input @returns {Promise<Gate>} */
  async function consent(key, cap, input) {
    if (ask === undefined) {
      return {
        result: fail('APPROVAL_REQUIRED',
          `"${key}#${cap}" is consequential and this gateway has no human approver`),
        decision: 'approval-required',
      };
    }
    /** @type {unknown} */
    let verdict;
    try {
      verdict = await ask({ key, cap, input, agentId, role, consequential: true });
    } catch (cause) {
      verdict = { approved: false, reason: `approver failed: ${messageOf(cause)}` };
    }
    // An approver is outside code: the cast names the three fields read below, and
    // each one is checked before it is believed.
    const answer = /** @type {{ approved?: unknown, reason?: unknown, by?: unknown }} */ (verdict);
    if (verdict === null || typeof verdict !== 'object' || answer.approved !== true) {
      const because = typeof answer?.reason === 'string' ? `: ${answer.reason}` : '';
      return {
        result: fail('APPROVAL_DENIED',
          `a human refused "${key}#${cap}" for agent "${agentId}"${because}`),
        decision: 'denied',
      };
    }
    // Provenance, not authority: the kernel's own approver still decides, and now
    // it can see WHO asked and WHO consented.
    return { approval: { requestedBy: agentId, role, approvedBy: answer.by ?? null } };
  }

  /** @param {string} key @param {string} cap @param {unknown} input
   * @param {{ signal?: AbortSignal | undefined, timeoutMs?: number | undefined,
   *   approval?: unknown }} [opts] @returns {Promise<import('../sdk/types.mjs').Result>} */
  async function call(key, cap, input, opts = {}) {
    if (!allowed.has(`${key}#${cap}`)) {
      record(key, cap, 'denied', 'PERMISSION_DENIED');
      return fail('PERMISSION_DENIED',
        `agent "${agentId}" (role ${role}) is not allowed to call "${key}#${cap}"`,
        [{ path: 'allow', message: `allowed: ${[...allowed].join(', ') || 'nothing'}` }]);
    }

    // The agent's own `approval` is DROPPED here, never forwarded and never merged:
    // a caller that issues its own consent has produced a request, not consent.
    // Only `signal` and `timeoutMs` survive, because a deadline is not authority.
    /** @type {{ signal?: AbortSignal | undefined, timeoutMs?: number | undefined,
     *   approval?: unknown }} */
    const options = { signal: opts.signal, timeoutMs: opts.timeoutMs };
    if (isConsequential(key, cap)) {
      const gate = await consent(key, cap, input);
      if (gate.result !== undefined) {
        record(key, cap, gate.decision, gate.result.error.code);
        return gate.result;
      }
      options.approval = gate.approval;
    }

    const result = await host.execute(key, cap, input, options);
    if (result.ok) {
      record(key, cap, 'allowed');
      return result;
    }
    const decision = result.error.code === 'APPROVAL_REQUIRED' ? 'approval-required' : 'denied';
    record(key, cap, decision, result.error.code);
    return result;
  }

  return Object.freeze({
    agentId,
    role,
    /** The capabilities this agent may call, as declared. */
    allowed: () => [...allowed].sort(),
    call,
    /** A COPY of the trail: an audit a caller can edit is not an audit. */
    audit: () => trail.map((entry) => ({ ...entry })),
  });
}
