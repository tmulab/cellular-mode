// Named errors. Every failure in this architecture has a code from one closed
// list, so a caller can branch on `err.code` and never on a message string.

/** The thirteen codes of the architecture contract, plus one kernel extension. */
export const CODES = Object.freeze([
  'CONTRACT_INVALID',
  'DUPLICATE_KEY',
  'NOT_FOUND',
  'DEPENDENCY_MISSING',
  'DEPENDENCY_CYCLE',
  'INPUT_INVALID',
  'OUTPUT_INVALID',
  'APPROVAL_REQUIRED',
  'APPROVAL_DENIED',
  'PERMISSION_DENIED',
  'CANCELLED',
  'TIMEOUT',
  'PLUGIN_ERROR',
  // Extension beyond the thirteen: dispose is refused while a loaded dependent
  // declares the key as required. Documented in eip/sdk/README.md.
  'DEPENDENCY_IN_USE',
]);

const KNOWN = new Set(CODES);

/**
 * The only error type crossing the kernel boundary.
 * `details` is always an array of structured `{path, message}` entries (possibly
 * empty) so that machine and human readers get the same information.
 */
export class KernelError extends Error {
  /**
   * @param {string} code one of `CODES`
   * @param {string} message human-readable, never a stack
   * @param {ReadonlyArray<import('./types.mjs').SchemaError>} [details] structured breaches
   */
  constructor(code, message, details = []) {
    super(message);
    if (!KNOWN.has(code)) {
      throw new TypeError(`unknown error code: ${String(code)}`);
    }
    this.name = 'KernelError';
    this.code = code;
    this.details = Object.freeze([...details]);
  }

  /** The wire/result shape: a code, a message, and structure — never a stack.
   * @returns {import('./types.mjs').Err}
   */
  toResult() {
    /** @type {{ code: string, message: string, details?: ReadonlyArray<import('./types.mjs').SchemaError> }} */
    const error = { code: this.code, message: this.message };
    if (this.details.length > 0) error.details = this.details;
    return { ok: false, error };
  }
}

/** A contract breach: the manifest itself is wrong, before anything can run. */
export class ContractError extends KernelError {
  /**
   * @param {string} message @param {ReadonlyArray<import('./types.mjs').SchemaError>} [details]
   */
  constructor(message, details = []) {
    super('CONTRACT_INVALID', message, details);
    this.name = 'ContractError';
  }
}

/**
 * The message of an unknown thrown value, without pretending it is an `Error`.
 * Same reading as the `cause?.message ?? cause` idiom it replaces: a thrown object
 * with a `message` yields it, anything else is stringified.
 * @type {(cause: unknown) => string}
 */
export function messageOf(cause) {
  const carried = cause !== null && typeof cause === 'object' && 'message' in cause
    ? /** @type {{ message?: unknown }} */ (cause).message
    : undefined;
  return String(carried ?? cause);
}

/**
 * The stack an unknown thrown value carries, or `null`. Diagnostics only: a stack
 * belongs in an event, never in a result a caller can see.
 * @type {(cause: unknown) => string | null}
 */
export function stackOf(cause) {
  const carried = cause !== null && typeof cause === 'object' && 'stack' in cause
    ? /** @type {{ stack?: unknown }} */ (cause).stack
    : undefined;
  return typeof carried === 'string' ? carried : null;
}

/** True when `value` is a KernelError (cross-realm safe enough for one process). */
/** @type {(value: unknown) => value is KernelError} */
export function isKernelError(value) {
  return value instanceof KernelError;
}
