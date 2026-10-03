// transitions.mjs — the two state transitions of Cellular Adaptive. PURE.
//
// There are only two, and the asymmetry between them is the design. Declaring a temporary
// mode BUILDS a record: the mode, who declared it, through which door, the text they typed,
// and the window in which it applies. Declaring `ready` builds NOTHING — it answers "no
// session", and the caller deletes the file. Storing an empty record for `ready` would keep
// the fact that somebody once declared something, which is the one thing this module promises
// not to keep.
//
// The builder does not trust itself: every record it produces is run through the same
// validator a reader uses, so the writer and the reader can never drift apart. The clock is a
// parameter, as everywhere else here, and an unparseable one is reported rather than guessed.
import { DEFAULT_MODE, MODES, resolveMode } from './modes.mjs';
import {
  DEFAULT_TTL_HOURS, SCHEMA_VERSION, SOURCES, TTL_MAX_HOURS, TTL_MIN_HOURS, instantMs,
  validateSession,
} from './schema.mjs';

/** @typedef {import('./types.mjs').SessionState} SessionState */
/** @typedef {import('./types.mjs').ValidationError} ValidationError */

const HOUR_MS = 3_600_000;

/** Every spelling a human may use, canonical ids first. Printed verbatim when a command is
 * refused, because "unknown mode" without the list is a dead end.
 * @type {ReadonlyArray<string>} */
export const VOCABULARY = Object.freeze(MODES.flatMap((m) => [m.id, ...m.aliases]));

/** @type {(value: unknown) => boolean} */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * PURE. Turns what the human typed into the record to store, or into `null` meaning
 * "store nothing, delete what is there".
 *
 * `options` carries the provenance (`source`, `command` as typed), the clock (`now`) and the
 * declared window (`ttlHours`, defaulting to 4). None of the four is inferred: a missing or
 * wrong one is a structured error on its own path, never a silent default — a record whose
 * provenance was guessed would be worse than no record.
 * @param {unknown} modeInput what the human typed, e.g. `/modocansado`
 * @param {unknown} options `{ source, command, now, ttlHours? }`
 * @returns {import('./types.mjs').ValidationResult<SessionState | null>}
 */
export function declare(modeInput, options) {
  const opts = /** @type {Record<string, unknown>} */ (isRecord(options) ? options : {});
  /** @type {ValidationError[]} */
  const errors = [];
  const mode = resolveMode(modeInput);
  if (mode === null) {
    errors.push({
      path: 'mode',
      message: `unknown mode ${JSON.stringify(String(modeInput ?? ''))}; valid: ${VOCABULARY.join(', ')}`,
    });
  }
  const source = opts.source;
  if (!(typeof source === 'string' && SOURCES.includes(source))) {
    errors.push({ path: 'source', message: `source must be one of ${SOURCES.join(', ')}` });
  }
  const command = opts.command;
  if (!(typeof command === 'string' && command.trim() !== '')) {
    errors.push({ path: 'command', message: 'command must be the non-empty text the human typed' });
  }
  const nowMs = instantMs(opts.now);
  if (nowMs === null) {
    errors.push({ path: 'now', message: 'now must be a full ISO 8601 instant with a zone' });
  }
  const ttl = opts.ttlHours === undefined ? DEFAULT_TTL_HOURS : opts.ttlHours;
  if (!(typeof ttl === 'number' && Number.isFinite(ttl) && ttl >= TTL_MIN_HOURS && ttl <= TTL_MAX_HOURS)) {
    errors.push({
      path: 'ttlHours',
      message: `ttlHours must be a number between ${TTL_MIN_HOURS} and ${TTL_MAX_HOURS}`,
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  if (mode === DEFAULT_MODE) return { ok: true, value: null };
  // Cast then VALIDATE: the fields were checked one by one above, and the record is proved as
  // a whole by the reader's own validator before it is handed back.
  const session = /** @type {SessionState} */ ({
    schema: SCHEMA_VERSION,
    mode,
    declaredBy: 'user',
    source,
    command,
    activatedAt: String(opts.now),
    expiresAt: new Date(Number(nowMs) + Number(ttl) * HOUR_MS).toISOString(),
    scope: 'session',
  });
  return validateSession(session);
}

/**
 * PURE. Back to the default. Identical to `declare('ready', ...)` and kept as its own name
 * because that is what the CLI command is called; it needs no clock and no provenance,
 * because nothing is written.
 * @returns {import('./types.mjs').ValidationResult<SessionState | null>}
 */
export function reset() {
  return { ok: true, value: null };
}
