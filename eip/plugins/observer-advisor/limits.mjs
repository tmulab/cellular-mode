// PURE (given a clock). The session budget: how many times a model may be asked, and how
// often.
//
// The limits exist for three different reasons and it is worth keeping them apart:
//   maxCallsPerSession — a model call is not free, in money or in attention. A session that
//     can ask twenty times is a session a human is still steering.
//   minIntervalMs — the only defence against a loop. A UI bug, a held-down key or an agent
//     retrying a failure cannot turn into a stream of calls.
//   timeoutMs — an adapter that never answers must end as a refusal, not as a hang.
//
// A call is COUNTED BEFORE the adapter runs. That is deliberate: if failures were free, a
// failing adapter could be retried without limit, which is exactly the shape of the loop the
// interval is there to prevent.
//
// There is no timer here and no background work anywhere in this plugin: `due` is asked at
// the moment of a call and answers about THAT moment.

/** @typedef {import('./types.mjs').Limits} Limits */

/** The defaults. Every one of them is the composition's to change, and none of them is
 * generous: an advisor is an optional second opinion, not a service. */
export const DEFAULT_LIMITS = Object.freeze({
  maxCallsPerSession: 20,
  minIntervalMs: 2000,
  timeoutMs: 20000,
  maxQuestionChars: 500,
  maxContextBytes: 8192,
  logEntries: 5,
  maxOutputChars: 4000,
});

/** Upper bounds on the limits themselves, so a composition cannot accidentally remove one.
 * `minIntervalMs` has no lower bound: a test needs 0, and a test is a composition too. */
export const LIMIT_CEILINGS = Object.freeze({
  maxCallsPerSession: 200,
  minIntervalMs: 600000,
  timeoutMs: 120000,
  maxQuestionChars: 500,
  maxContextBytes: 65536,
  logEntries: 50,
  maxOutputChars: 16384,
});

/** @type {(value: unknown, fallback: number, ceiling: number) => number} */
const bounded = (value, fallback, ceiling) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`a limit must be a non-negative integer, got ${JSON.stringify(value)}`);
  }
  if (value > ceiling) throw new TypeError(`a limit of ${value} is above the ceiling ${ceiling}`);
  return value;
};

/** PURE. The limits of this session, validated and frozen.
 * @param {Partial<Limits>} [partial] @returns {Limits} */
export function normaliseLimits(partial = {}) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [name, fallback] of Object.entries(DEFAULT_LIMITS)) {
    const ceiling = /** @type {Record<string, number>} */ (LIMIT_CEILINGS)[name] ?? fallback;
    out[name] = bounded(/** @type {Record<string, unknown>} */ (partial)[name], fallback, ceiling);
  }
  if (out['maxQuestionChars'] === 0) throw new TypeError('maxQuestionChars must be above zero');
  return Object.freeze(/** @type {Limits} */ (/** @type {unknown} */ (out)));
}

/** Why a call is refused. `path` is the limit that refused it, so the error names the rule
 * rather than a mood.
 * @typedef {{ path: string, message: string }} Refusal */

/**
 * The session budget. In memory, reversible by `reset`, and asked at the moment of a call.
 * @param {Limits} limits
 * @param {() => number} [now] the clock, injectable so the interval rule is testable
 * @returns {{ used: () => number, remaining: () => number, due: () => Refusal | null,
 *   spend: () => void, reset: () => void }}
 */
export function createBudget(limits, now = () => Date.now()) {
  let used = 0;
  /** @type {number | null} */
  let last = null;
  return {
    used: () => used,
    remaining: () => Math.max(0, limits.maxCallsPerSession - used),
    /** `null` means the call may proceed. */
    due() {
      if (used >= limits.maxCallsPerSession) {
        return {
          path: 'limits.maxCallsPerSession',
          message: `this session has used its ${limits.maxCallsPerSession} advisor call(s);`
            + ' restart the observer to start a new session',
        };
      }
      if (last !== null) {
        const waited = now() - last;
        if (waited < limits.minIntervalMs) {
          return {
            path: 'limits.minIntervalMs',
            message: `the advisor accepts one call every ${limits.minIntervalMs} ms;`
              + ` ${Math.max(0, limits.minIntervalMs - waited)} ms left to wait`,
          };
        }
      }
      return null;
    },
    spend() {
      used += 1;
      last = now();
    },
    reset() {
      used = 0;
      last = null;
    },
  };
}
