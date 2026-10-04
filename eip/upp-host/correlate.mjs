// Request correlation: which answer belongs to which question, and what happens to the rest.
//
// It lives apart from the pipe because it is the part with the invariant worth proving: an
// id is settled EXACTLY ONCE and then RETIRED. Resolving a call that already returned is
// worse than losing a reply — the caller has moved on, and a second resolution silently
// overwrites nothing visible while corrupting whatever counted on the first.
//
// So a retired id is remembered, and an answer for it is DISCARDED and counted. The count is
// the point: "we received an answer nobody was waiting for" is a diagnostic, not a non-event.
// Pure apart from the map it keeps: no stream, no timer, no process.
import { validateResponse } from '../upp/index.mjs';

/** @typedef {import('../upp/errors.mjs').UppError} UppError */
/** @typedef {Record<string, unknown>} Raw */
/** @typedef {{ ok: true, value: Raw } | { ok: false, error: UppError }} Answer */

export function createCorrelator() {
  /** @type {Map<string, { method: string, settle: (answer: Answer) => void }>} */
  const pending = new Map();
  /** @type {Set<string>} */
  const retired = new Set();
  const counters = { sent: 0, received: 0, discardedLate: 0, unsolicited: 0, breaches: 0 };

  /** @param {string} key @param {string} method @param {(answer: Answer) => void} settle */
  const register = (key, method, settle) => pending.set(key, { method, settle });

  /** Forget an id without answering it: a timeout or an abort already answered the caller.
   * @param {string} key */
  function retire(key) {
    pending.delete(key);
    retired.add(key);
  }

  /** @param {string} key @param {Answer} answer */
  function resolve(key, answer) {
    const waiting = pending.get(key);
    if (waiting === undefined) return;
    retire(key);
    waiting.settle(answer);
  }

  /**
   * Route one received message. Returns `true` when it settled a pending request.
   * @param {unknown} raw @returns {boolean}
   */
  function receive(raw) {
    counters.received += 1;
    const id = typeof raw === 'object' && raw !== null ? /** @type {Raw} */ (raw).id : undefined;
    const key = String(id);
    const waiting = pending.get(key);
    if (waiting === undefined) {
      if (retired.has(key)) counters.discardedLate += 1;
      else counters.unsolicited += 1;
      return false;
    }
    const verdict = validateResponse(raw, { id: /** @type {number | string} */ (id), method: waiting.method });
    if (!verdict.ok) {
      resolve(key, Object.freeze({ ok: false, error: verdict.error }));
      return true;
    }
    const { result, error } = verdict.value;
    resolve(key, error !== undefined
      ? Object.freeze({ ok: false, error })
      : Object.freeze({ ok: true, value: result ?? {} }));
    return true;
  }

  /** Every pending request fails with the same error, which is the honest report after a
   * crash or a protocol breach: the host cannot know which of them the plugin had started.
   * @param {UppError} error */
  function failAll(error) {
    for (const key of [...pending.keys()]) resolve(key, Object.freeze({ ok: false, error }));
  }

  return Object.freeze({
    register,
    retire,
    receive,
    failAll,
    countSent: () => { counters.sent += 1; },
    countBreach: () => { counters.breaches += 1; },
    pendingCount: () => pending.size,
    counters: () => Object.freeze({ ...counters }),
  });
}
