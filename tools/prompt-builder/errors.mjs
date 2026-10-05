// errors.mjs — one failure type for the Builder, carrying a machine-readable `code`.
//
// A code rather than a parsed message: the refusals here are decisions a caller acts on
// (an answer that looks like a secret is re-asked, not reported as a crash), and matching
// on prose is how that turns into a bug the first time the wording is improved.

/** Every refusal this module can raise. Frozen, and deliberately NOT widened to a
 * `Record<string, string>`: the type checker then knows the key set, so a misspelled code is
 * an error at the call site instead of an `undefined` travelling as a message. */
export const CODES = Object.freeze({
  SECRET_LIKE: 'SECRET_LIKE',
  ABSOLUTE_PATH: 'ABSOLUTE_PATH',
  UNKNOWN_QUESTION: 'UNKNOWN_QUESTION',
  BAD_ENTRY: 'BAD_ENTRY',
  OUTSIDE_ROOT: 'OUTSIDE_ROOT',
  BAD_DRAFT: 'BAD_DRAFT',
  BAD_CONTRACT: 'BAD_CONTRACT',
  UNKNOWN_DECISION: 'UNKNOWN_DECISION',
  ALREADY_DECIDED: 'ALREADY_DECIDED',
  NEEDS_CONFIRMATION: 'NEEDS_CONFIRMATION',
  NOT_READY: 'NOT_READY',
  PUBLICATION_CHECK: 'PUBLICATION_CHECK',
  NOT_APPROVED: 'NOT_APPROVED',
  CELL_EXISTS: 'CELL_EXISTS',
  UNSAFE_EXPORT: 'UNSAFE_EXPORT',
  UNKNOWN_ADAPTER: 'UNKNOWN_ADAPTER',
  ADAPTER_NOT_IMPLEMENTED: 'ADAPTER_NOT_IMPLEMENTED',
});

export class BuilderError extends Error {
  /** `details` carries the machine-readable reason a refusal gives — the blocker list of a
   * NOT_READY, the finding list of a PUBLICATION_CHECK, the error list of a BAD_CONTRACT —
   * so a caller reports them without re-deriving or parsing them out of the message.
   * @param {string} code @param {string} message @param {unknown} [details] */
  constructor(code, message, details) {
    super(message);
    this.name = 'BuilderError';
    this.code = code;
    this.details = details;
  }
}

/** @param {unknown} error @returns {unknown} the details, when it is one of ours */
export function detailsOf(error) {
  return error instanceof BuilderError ? error.details : undefined;
}

/** @param {unknown} error @returns {string | null} the code, when it is one of ours */
export function codeOf(error) {
  return error instanceof BuilderError ? error.code : null;
}
