// schema.mjs — the two validators of Cellular Adaptive. PURE: no clock, no filesystem.
//
// Both are STRICT and TOTAL. Strict, because an unknown key in a state file is how a
// contract rots: the writer adds a field, the reader ignores it, and six weeks later two
// modules disagree about what the file means. Total, because a state file is read on a hot
// path (a hook that must never block a prompt), so a malformed file has to come back as
// structured errors rather than as an exception somebody forgot to catch.
//
// The asymmetry between the two is the point of the module. A SESSION may hold a mode and
// must hold a window; PREFERENCES may hold neither. A temporary declaration that can be
// persisted is no longer temporary, so the names that would let it happen are listed, by
// hand, in FORBIDDEN_PREFERENCE_KEYS, and rejected with their own message.
import { DEFAULT_MODE, MODES } from './modes.mjs';

/** @typedef {import('./types.mjs').Preferences} Preferences */
/** @typedef {import('./types.mjs').SessionState} SessionState */
/** @typedef {import('./types.mjs').ValidationError} ValidationError */

/** The only schema version these validators accept. */
export const SCHEMA_VERSION = 1;

/** Validity-window bounds, in hours. The default is conservative on purpose: a window is
 * DECLARED, never estimated from anything, so a long one would outlive its own meaning. */
export const TTL_MIN_HOURS = 0.5;
export const TTL_MAX_HOURS = 12;
export const DEFAULT_TTL_HOURS = 4;

export const UNKNOWN_KEY_MESSAGE = 'unknown key: this file holds exactly the declared contract, nothing more';
export const CONDITION_KEY_MESSAGE = 'a declared mode is temporary and must never be stored as a persistent preference';

/** @type {ReadonlyArray<string>} */
export const SESSION_KEYS = Object.freeze([
  'schema', 'mode', 'declaredBy', 'source', 'command', 'activatedAt', 'expiresAt', 'scope',
]);

/** @type {ReadonlyArray<string>} */
export const PREFERENCE_KEYS = Object.freeze(['schema', 'enabled', 'ttlHours', 'communication']);

/**
 * Names a preference file may never carry, each one a way of turning a declaration the
 * human made for an afternoon into a property of the human. The list is hand-kept rather
 * than a pattern, because a pattern makes the next addition invisible.
 * @type {ReadonlyArray<string>}
 */
export const FORBIDDEN_PREFERENCE_KEYS = Object.freeze([
  'mode', 'modes', 'condition', 'conditions', 'tired', 'ready', 'focus', 'explore',
  'declaredBy', 'activatedAt', 'expiresAt', 'command', 'scope', 'source',
]);

/** @type {ReadonlyArray<string>} */
export const SOURCES = Object.freeze(['claude-hook', 'cli', 'skill']);
/** @type {ReadonlyArray<string>} */
export const COMMUNICATION = Object.freeze(['concise', 'default', 'detailed']);
/** @type {ReadonlyArray<string>} */
const STORABLE_MODES = Object.freeze(MODES.filter((m) => m.temporary).map((m) => m.id));

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const HOUR_MS = 3_600_000;

/** @type {(value: unknown) => boolean} */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A full ISO 8601 instant WITH a zone, in milliseconds, or `null`. The regex rejects the
 * shapes `Date.parse` would guess at (a bare date, a local time, a slashed date); the
 * parse rejects the shapes the regex cannot judge (month 13).
 * @type {(value: unknown) => number | null} */
const instant = (value) => {
  if (typeof value !== 'string' || !ISO.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

/** PURE. The same instant check the validators use, exported so that no second reader of a
 * timestamp invents its own idea of what a valid one looks like.
 * @param {unknown} value @returns {number | null} milliseconds, or `null` */
export function instantMs(value) {
  return instant(value);
}

/** @type {(path: string, message: string) => ValidationError} */
const fail = (path, message) => ({ path, message });

/** @type {(value: unknown) => string} */
const modeMessage = (value) => (value === DEFAULT_MODE
  ? `${DEFAULT_MODE} is the default and is never stored: declaring it deletes the session file`
  : `mode must be one of ${STORABLE_MODES.join(', ')}`);

/**
 * PURE. Validates `.cellular/adaptive/session.json`, schema 1.
 *
 * Exactly the eight declared keys, all required, no optional field. `ready` is rejected by
 * name and with its own message: the default is an absence, so storing it would create the
 * one thing the module promises not to keep. Errors are reported one per key, in key
 * order, so the same input always produces the same list.
 * @param {unknown} value
 * @returns {import('./types.mjs').ValidationResult<SessionState>}
 */
export function validateSession(value) {
  if (!isRecord(value)) return { ok: false, errors: [fail('', 'a session must be a JSON object')] };
  const record = /** @type {Record<string, unknown>} */ (value);
  /** @type {ValidationError[]} */
  const errors = [];
  for (const key of Object.keys(record)) {
    if (!SESSION_KEYS.includes(key)) errors.push(fail(key, UNKNOWN_KEY_MESSAGE));
  }
  for (const key of SESSION_KEYS) {
    if (!(key in record)) errors.push(fail(key, 'required: this contract has no optional field'));
  }
  /** @type {(key: string, ok: boolean, message: string) => void} */
  const field = (key, ok, message) => {
    if (key in record && !ok) errors.push(fail(key, message));
  };
  field('schema', record.schema === SCHEMA_VERSION, `schema must be the number ${SCHEMA_VERSION}`);
  field('mode', typeof record.mode === 'string' && STORABLE_MODES.includes(record.mode), modeMessage(record.mode));
  field('declaredBy', record.declaredBy === 'user', 'declaredBy must be "user": only the human declares a mode');
  field('source', typeof record.source === 'string' && SOURCES.includes(record.source), `source must be one of ${SOURCES.join(', ')}`);
  field('command', typeof record.command === 'string' && record.command.trim() !== '', 'command must be the non-empty text the human typed');
  field('activatedAt', instant(record.activatedAt) !== null, 'activatedAt must be a full ISO 8601 instant with a zone');
  field('expiresAt', instant(record.expiresAt) !== null, 'expiresAt must be a full ISO 8601 instant with a zone');
  field('scope', record.scope === 'session', 'scope must be "session"');
  const from = instant(record.activatedAt);
  const to = instant(record.expiresAt);
  if (from !== null && to !== null) {
    const hours = (to - from) / HOUR_MS;
    if (hours <= 0) errors.push(fail('expiresAt', 'expiresAt must be after activatedAt'));
    else if (hours < TTL_MIN_HOURS || hours > TTL_MAX_HOURS) {
      errors.push(fail('expiresAt', `the declared window must be between ${TTL_MIN_HOURS} and ${TTL_MAX_HOURS} hours, got ${hours}`));
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: /** @type {SessionState} */ (value) };
}

/**
 * PURE. Validates `.cellular/adaptive/preferences.json`, schema 1, and fills the two
 * documented defaults (`enabled: true`, `ttlHours: 4`) so every reader sees one shape.
 *
 * `schema` is the only required key. Anything resembling a condition is rejected before
 * the unknown-key rule runs, so the human reading the error learns WHY it is refused and
 * not merely that it is.
 * @param {unknown} value
 * @returns {import('./types.mjs').ValidationResult<Preferences>}
 */
export function validatePreferences(value) {
  if (!isRecord(value)) return { ok: false, errors: [fail('', 'preferences must be a JSON object')] };
  const record = /** @type {Record<string, unknown>} */ (value);
  /** @type {ValidationError[]} */
  const errors = [];
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_PREFERENCE_KEYS.includes(key)) errors.push(fail(key, CONDITION_KEY_MESSAGE));
    else if (!PREFERENCE_KEYS.includes(key)) errors.push(fail(key, UNKNOWN_KEY_MESSAGE));
  }
  if (!('schema' in record)) errors.push(fail('schema', 'required: this contract has no optional field'));
  else if (record.schema !== SCHEMA_VERSION) errors.push(fail('schema', `schema must be the number ${SCHEMA_VERSION}`));
  if ('enabled' in record && typeof record.enabled !== 'boolean') {
    errors.push(fail('enabled', 'enabled must be a boolean'));
  }
  const ttl = record.ttlHours;
  if ('ttlHours' in record
    && !(typeof ttl === 'number' && Number.isFinite(ttl) && ttl >= TTL_MIN_HOURS && ttl <= TTL_MAX_HOURS)) {
    errors.push(fail('ttlHours', `ttlHours must be a number between ${TTL_MIN_HOURS} and ${TTL_MAX_HOURS}`));
  }
  const communication = record.communication;
  if ('communication' in record && !(typeof communication === 'string' && COMMUNICATION.includes(communication))) {
    errors.push(fail('communication', `communication must be one of ${COMMUNICATION.join(', ')}`));
  }
  if (errors.length > 0) return { ok: false, errors };
  /** @type {Preferences} */
  const out = {
    schema: SCHEMA_VERSION,
    enabled: 'enabled' in record ? record.enabled === true : true,
    ttlHours: typeof ttl === 'number' ? ttl : DEFAULT_TTL_HOURS,
  };
  if (typeof communication === 'string') {
    out.communication = /** @type {'concise' | 'default' | 'detailed'} */ (communication);
  }
  return { ok: true, value: out };
}
