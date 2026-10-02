// Kernel codes -> HTTP status, in ONE place.
//
// The architecture already has a closed list of error codes; inventing a second
// vocabulary at the transport would mean two lists to keep in agreement. So the
// transport reuses the codes and owns only the mapping — and the mapping is data,
// so a reviewer can read it without reading the server.
import { CODES } from '../sdk/index.mjs';

/** @typedef {import('../sdk/types.mjs').Err} Err */
/** @typedef {import('../sdk/types.mjs').ErrorShape} ErrorShape */
/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */

/**
 * Decisions worth defending:
 *   CANCELLED -> 503 — `499` is not an IANA status; a conformant client should not
 *     have to learn a vendor code. "Did not complete" is what 503 says.
 *   TIMEOUT -> 504 — a deadline is a different fact from an abort, so it keeps a
 *     status of its own.
 *   OUTPUT_INVALID -> 500 — the server broke its own contract; the client did
 *     nothing wrong and can retry nothing.
 *   DEPENDENCY_IN_USE -> 409 — a conflict with the current state of the host.
 *   CONTRACT_INVALID / DUPLICATE_KEY -> 500 — composition faults; a caller cannot
 *     cause them through the API.
 */
export const STATUS_BY_CODE = Object.freeze({
  INPUT_INVALID: 400,
  NOT_FOUND: 404,
  APPROVAL_REQUIRED: 403,
  APPROVAL_DENIED: 403,
  PERMISSION_DENIED: 403,
  DEPENDENCY_IN_USE: 409,
  TIMEOUT: 504,
  CANCELLED: 503,
  DEPENDENCY_MISSING: 503,
  DEPENDENCY_CYCLE: 500,
  CONTRACT_INVALID: 500,
  DUPLICATE_KEY: 500,
  OUTPUT_INVALID: 500,
  PLUGIN_ERROR: 500,
});

/** The table is asked about arbitrary codes, so it is read through one typed lookup
 * instead of being indexed by a string it may not declare.
 * @type {(code: string) => number | undefined} */
const mapped = (code) => /** @type {Record<string, number | undefined>} */ (STATUS_BY_CODE)[code];

/** Every code the architecture knows has a status. A gap would default to 500 silently. */
export const UNMAPPED_CODES = CODES.filter((code) => mapped(code) === undefined);

/** 500 is the honest default for a code nobody mapped: it is the server's fault.
 * @type {(code: string) => number} */
export const statusFor = (code) => mapped(code) ?? 500;

/**
 * The failure envelope. `details` travels when it exists because it is structured
 * ({path, message}) and actionable; a stack never travels, it is diagnostics.
 * @param {string} code @param {string} message
 * @param {ReadonlyArray<SchemaError>} [details] @returns {Err}
 */
export function failure(code, message, details) {
  /** @type {ErrorShape} */
  const error = { code, message };
  if (Array.isArray(details) && details.length > 0) error.details = details;
  return { ok: false, error };
}
