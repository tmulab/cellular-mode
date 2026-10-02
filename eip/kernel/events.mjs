// Observability bus. In-memory, synchronous, and SILENT by default: a runtime
// that prints is a runtime that decides for its host where logs belong.
//
// Event shape: {type, key, cap?, ok, code?, ms, at} — `at` is an ISO timestamp,
// `ms` a duration in milliseconds. A listener that throws is isolated: broken
// telemetry must not break the operation it was observing.

import { messageOf } from '../sdk/index.mjs';

export const EVENT_TYPES = Object.freeze([
  'register', 'load', 'dispose', 'execute', 'error', 'approval', 'plugin',
]);

const ANY = '*';

/** @typedef {import('../sdk/types.mjs').KernelEvent} KernelEvent */
/** @typedef {(event: KernelEvent) => void} Listener */

export function createEvents() {
  /** @type {Map<string, Set<Listener>>} */
  const listeners = new Map();
  /** @type {Array<{ type: string, message: string }>} */
  const failures = [];

  /**
   * Subscribe to one event type, or to `'*'` for every event. Returns an unsubscribe.
   * @param {string} type @param {Listener} fn @returns {() => void}
   */
  function on(type, fn) {
    if (typeof fn !== 'function') throw new TypeError('listener must be a function');
    if (type !== ANY && !EVENT_TYPES.includes(type)) {
      throw new TypeError(`unknown event type: ${String(type)}`);
    }
    const set = listeners.get(type) ?? new Set();
    listeners.set(type, set);
    set.add(fn);
    return () => {
      listeners.get(type)?.delete(fn);
    };
  }

  /** @param {KernelEvent} event @returns {KernelEvent} */
  function emit(event) {
    const full = { ok: true, ms: 0, at: new Date().toISOString(), ...event };
    for (const type of [full.type, ANY]) {
      for (const fn of listeners.get(type) ?? []) {
        try {
          fn(full);
        } catch (cause) {
          // Recorded, never rethrown and never printed.
          failures.push({ type: full.type, message: messageOf(cause) });
        }
      }
    }
    return full;
  }

  /** Diagnostics for the host: listeners that threw, so silence is not blindness. */
  const listenerFailures = () => [...failures];

  return { on, emit, listenerFailures };
}
