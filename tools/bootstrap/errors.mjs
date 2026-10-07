// errors.mjs — the one refusal vocabulary of Bootstrap, and the one exit-code table.
//
// Every refusal in Bootstrap is a BootstrapError carrying a CODE from a closed list and a
// `details` record a renderer can show. The codes exist so that the CLI never decides an exit
// status from a message string, and so that a test can assert WHY a refusal happened rather
// than matching prose that the next edit will reword.
//
// `EXIT_FOR` is the single mapping from a code to the process exit status declared in
// `bootstrap/CONTRACTS.md`, "Exit codes": 0 ok · 1 usage · 2 validation, drift or analysis
// findings · 3 refused because of existing state · 5 human confirmation required. The table is
// FAIL CLOSED: a code nobody mapped resolves to 2 (a finding), never to 0, because an
// unestablished outcome is UNKNOWN and UNKNOWN is not success.

/** @typedef {Readonly<Record<string, unknown>>} Details */

/**
 * The closed set of refusal codes. Each one is a distinct decision a caller may want to
 * handle: USAGE is the human's argument, BAD_* is a document that failed validation,
 * EXISTING_INSTALL/OVERLAP/OUTSIDE_TARGET are states of the target that forbid proceeding,
 * CONFLICT, HOST_UNSUPPORTED and COMPONENT_UNAVAILABLE are selections that cannot be installed
 * coherently — the last one because this checkout does not hold the files it would copy, and
 * NEEDS_CONFIRMATION / UNMERGEABLE are the two ways Bootstrap stops and waits for a human.
 * The values are deliberately left as literal types, so that a typo in a call site is a
 * typecheck error rather than a refusal nobody can map.
 */
export const CODES = Object.freeze({
  USAGE: 'USAGE',
  NEEDS_CONFIRMATION: 'NEEDS_CONFIRMATION',
  CONFLICT: 'CONFLICT',
  UNKNOWN_COMPONENT: 'UNKNOWN_COMPONENT',
  UNKNOWN_PROFILE: 'UNKNOWN_PROFILE',
  HOST_UNSUPPORTED: 'HOST_UNSUPPORTED',
  COMPONENT_UNAVAILABLE: 'COMPONENT_UNAVAILABLE',
  EXISTING_INSTALL: 'EXISTING_INSTALL',
  OVERLAP: 'OVERLAP',
  OUTSIDE_TARGET: 'OUTSIDE_TARGET',
  BAD_MANIFEST: 'BAD_MANIFEST',
  BAD_FACTS: 'BAD_FACTS',
  BAD_PLAN: 'BAD_PLAN',
  UNMERGEABLE: 'UNMERGEABLE',
});

/** The exit status this project's contract assigns to each code. */
export const EXIT_FOR = Object.freeze({
  [CODES.USAGE]: 1,
  [CODES.UNKNOWN_PROFILE]: 1,
  [CODES.UNKNOWN_COMPONENT]: 1,
  [CODES.BAD_MANIFEST]: 2,
  [CODES.BAD_FACTS]: 2,
  [CODES.BAD_PLAN]: 2,
  [CODES.CONFLICT]: 2,
  [CODES.HOST_UNSUPPORTED]: 2,
  // A component whose declared source is not in THIS checkout. A finding about the source, not
  // about the target and not a usage mistake, so it is 2 — and never a silent smaller install.
  [CODES.COMPONENT_UNAVAILABLE]: 2,
  [CODES.EXISTING_INSTALL]: 3,
  [CODES.OVERLAP]: 3,
  [CODES.OUTSIDE_TARGET]: 3,
  [CODES.NEEDS_CONFIRMATION]: 5,
  [CODES.UNMERGEABLE]: 5,
});

/** The status an unmapped code resolves to. Never 0. */
export const EXIT_UNKNOWN = 2;

/** A refusal with a machine-readable cause. */
export class BootstrapError extends Error {
  /**
   * @param {string} code one of `CODES`
   * @param {string} message one sentence, safe to show a human
   * @param {Details} [details] structured context (ids, paths, pairs) — never a secret
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BootstrapError';
    /** @type {string} */
    this.code = code;
    /** @type {Details} */
    this.details = Object.freeze({ ...details });
  }

  /** The process exit status for this refusal. @returns {number} */
  get exitCode() {
    return exitFor(this.code);
  }
}

/** PURE and TOTAL. The exit status for a code, fail-closed for anything unmapped.
 * @param {unknown} code @returns {number} */
export function exitFor(code) {
  if (typeof code !== 'string') return EXIT_UNKNOWN;
  const table = /** @type {Readonly<Record<string, number | undefined>>} */ (EXIT_FOR);
  const mapped = table[code];
  return typeof mapped === 'number' ? mapped : EXIT_UNKNOWN;
}

/** PURE. True when `value` is a BootstrapError, without relying on `instanceof` across realms.
 * @param {unknown} value @returns {boolean} */
export function isBootstrapError(value) {
  return value instanceof BootstrapError
    || (typeof value === 'object' && value !== null
      && /** @type {{ name?: unknown }} */ (value).name === 'BootstrapError'
      && typeof /** @type {{ code?: unknown }} */ (value).code === 'string');
}

/** Convenience constructor, so call sites read as one line.
 * @param {string} code @param {string} message @param {Details} [details]
 * @returns {BootstrapError} */
export function refuse(code, message, details = {}) {
  return new BootstrapError(code, message, details);
}
