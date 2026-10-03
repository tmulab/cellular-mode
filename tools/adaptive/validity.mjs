// validity.mjs — how long a declaration still applies. PURE: `now` is a parameter.
//
// The module answers one question — what is the effective mode right now — and it answers it
// in five distinguishable ways, because collapsing any two of them would report something
// untrue. `none` is an absence (nobody declared anything). `active` is a declaration inside
// its window. `expired` is a declaration whose window has closed: it is NOT honoured, and the
// human is told, because silence here is indistinguishable from "nothing happened".
// `invalid` is a file that cannot be read as a declaration — never rendered as `none`, never
// repaired, never deleted. `disabled` is the human having turned the module off.
//
// Two deliberate restraints. The clock is injected, so every case is exact and testable; a
// module that called `Date.now()` could not be tested at the boundary at all. And the
// validity window is DECLARED, never estimated: it is read from the record and from the
// preferences, and this file computes nothing about how long anyone should feel anything.
import { DEFAULT_MODE } from './modes.mjs';
import { DEFAULT_TTL_HOURS, instantMs, validateSession } from './schema.mjs';

/** @typedef {import('./types.mjs').EffectiveMode} EffectiveMode */
/** @typedef {import('./types.mjs').Preferences} Preferences */
/** @typedef {import('./types.mjs').Standing} Standing */

const SESSION_FILE = '.cellular/adaptive/session.json';

/** @type {(now: unknown) => number} */
function nowMsOf(now) {
  const ms = instantMs(now);
  if (ms === null) throw new TypeError(`now must be a full ISO 8601 instant, got: ${String(now)}`);
  return ms;
}

/** Minute precision, for a human-readable line. String slicing only — no clock, no locale.
 * @type {(iso: string) => string} */
const atMinute = (iso) => iso.slice(0, 16).replace('T', ' ');

/** The module is ON until the human turns it off. An absent preference file is not a
 * decision to disable anything.
 * @param {Preferences | null | undefined} preferences @returns {boolean} */
export function isEnabled(preferences) {
  if (preferences === null || preferences === undefined) return true;
  return preferences.enabled !== false;
}

/** The declared window, in hours: the preference when there is one, otherwise the documented
 * default. Never derived from behaviour.
 * @param {Preferences | null | undefined} preferences @returns {number} */
export function ttlHoursOf(preferences) {
  if (preferences === null || preferences === undefined) return DEFAULT_TTL_HOURS;
  return typeof preferences.ttlHours === 'number' ? preferences.ttlHours : DEFAULT_TTL_HOURS;
}

/**
 * PURE. Which of the five situations the reader is in.
 *
 * The window is HALF-OPEN: `now === expiresAt` is already expired, so a declaration never
 * outlives the instant it declared. `readError` is how the caller reports a file it could not
 * even parse — passing it is what keeps a broken file from being read as an absence.
 * @param {unknown} session the parsed session file, or `null` when there is none
 * @param {string} now ISO 8601 instant
 * @param {Preferences | null | undefined} preferences
 * @param {string | null} [readError]
 * @returns {Standing}
 */
export function standing(session, now, preferences, readError = null) {
  const nowMs = nowMsOf(now);
  if (!isEnabled(preferences)) return 'disabled';
  if (typeof readError === 'string' && readError !== '') return 'invalid';
  if (session === null || session === undefined) return 'none';
  const parsed = validateSession(session);
  if (!parsed.ok) return 'invalid';
  const expires = instantMs(parsed.value.expiresAt);
  if (expires === null) return 'invalid';
  return nowMs >= expires ? 'expired' : 'active';
}

/** @type {(session: unknown, readError: string | null) => string} */
function invalidNotice(session, readError) {
  if (typeof readError === 'string' && readError !== '') return `${readError} — back to ready`;
  const parsed = validateSession(session);
  const first = parsed.ok ? null : parsed.errors[0];
  const where = first ? ` (${first.path === '' ? 'file' : first.path}: ${first.message})` : '';
  return `${SESSION_FILE} could not be read as a declaration — back to ready${where}`;
}

/**
 * PURE. The whole read-only answer: the mode to honour, why, and the one line a human must
 * see when something changed without them doing anything.
 *
 * `ready` is the answer in four of the five situations; only `active` returns a declared
 * mode. `notice` is `null` whenever there is nothing to report — an absence is not an event.
 * @param {unknown} session @param {string} now
 * @param {Preferences | null | undefined} preferences @param {string | null} [readError]
 * @returns {EffectiveMode}
 */
export function effectiveMode(session, now, preferences, readError = null) {
  const state = standing(session, now, preferences, readError);
  const parsed = state === 'active' || state === 'expired' ? validateSession(session) : null;
  if (parsed?.ok && state === 'active') {
    return {
      enabled: true,
      mode: parsed.value.mode,
      standing: 'active',
      declaredBy: 'user',
      source: parsed.value.source,
      activatedAt: parsed.value.activatedAt,
      expiresAt: parsed.value.expiresAt,
      notice: null,
    };
  }
  if (parsed?.ok && state === 'expired') {
    return {
      enabled: true,
      mode: DEFAULT_MODE,
      standing: 'expired',
      declaredBy: 'user',
      source: parsed.value.source,
      activatedAt: parsed.value.activatedAt,
      expiresAt: parsed.value.expiresAt,
      notice: `your earlier declaration (${parsed.value.mode}, ${atMinute(parsed.value.activatedAt)})`
        + ' expired — back to ready',
    };
  }
  return {
    enabled: state !== 'disabled',
    mode: DEFAULT_MODE,
    standing: state,
    declaredBy: null,
    source: null,
    activatedAt: null,
    expiresAt: null,
    notice: state === 'invalid' ? invalidNotice(session, readError) : null,
  };
}
