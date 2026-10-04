// The error mapping, in one place and in both directions.
//
// Two vocabularies meet here and neither one wins: JSON-RPC speaks integers, this
// architecture speaks a CLOSED list of names (`eip/sdk/errors.mjs`). So the integer
// belongs to the transport, the name belongs to the architecture, and they travel in
// the same object — `{code: <int>, message, data: {code: <CODE>, details}}`. No new
// architecture code is introduced by the protocol: `CODES` stays closed, which is why
// `PLUGIN_UNAVAILABLE` is a transport fact mapped onto `PLUGIN_ERROR` and not a 15th code.
//
// The rule worth defending: a REMOTE peer may name a client error and nothing else.
// `passthroughOf` is imported rather than re-derived, so the wire honours exactly the
// set the kernel already honours for an in-process throw.
import { CODES, KernelError, passthroughOf } from '../sdk/index.mjs';

/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */
/** @typedef {import('../sdk/types.mjs').Err} Err */
/** @typedef {{ code: number, message: string,
 *   data: { code: string, details?: ReadonlyArray<SchemaError> } }} UppError */

/** The five standard JSON-RPC 2.0 codes, by name. */
export const JSONRPC_CODES = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
});

/** UPP's own codes, inside the range JSON-RPC reserves for implementation server errors. */
export const UPP_CODES = Object.freeze({
  PLUGIN_FAULT: -32000,
  CAPABILITY_NOT_FOUND: -32001,
  UNSUPPORTED_PROTOCOL_VERSION: -32002,
  PLUGIN_UNAVAILABLE: -32003,
  TIMEOUT: -32004,
  CANCELLED: -32005,
  PAYLOAD_TOO_LARGE: -32006,
  NOT_INITIALIZED: -32007,
  SHUTTING_DOWN: -32008,
  CAPABILITY_NOT_AUTHORIZED: -32010,
});

/** The reserved implementation range, inclusive. Anything inside it that this version has
 * not assigned is `PLUGIN_ERROR` — never a guess, and the raw integer is kept by callers. */
export const SERVER_ERROR_RANGE = Object.freeze({ from: -32099, to: -32000 });

/** rpc integer -> kernel CODE. Total over every code this protocol assigns (U8). */
export const KERNEL_CODE_BY_RPC = Object.freeze({
  '-32700': 'PLUGIN_ERROR',
  '-32600': 'CONTRACT_INVALID',
  '-32601': 'CONTRACT_INVALID',
  '-32602': 'INPUT_INVALID',
  '-32603': 'PLUGIN_ERROR',
  '-32000': 'PLUGIN_ERROR',
  '-32001': 'NOT_FOUND',
  '-32002': 'CONTRACT_INVALID',
  '-32003': 'PLUGIN_ERROR',
  '-32004': 'TIMEOUT',
  '-32005': 'CANCELLED',
  '-32006': 'INPUT_INVALID',
  '-32007': 'CONTRACT_INVALID',
  '-32008': 'CANCELLED',
  '-32010': 'PERMISSION_DENIED',
});

/**
 * kernel CODE -> the integer a host puts on the wire for it. Declared, not derived: the
 * reverse of the table above is not a bijection (five rpc codes mean `PLUGIN_ERROR`), so
 * the representative for each name is a decision and is written down. Composition faults
 * the caller cannot cause — `DUPLICATE_KEY`, `DEPENDENCY_CYCLE`, `OUTPUT_INVALID`,
 * `DEPENDENCY_IN_USE` — are `-32603`: the peer did nothing wrong and can retry nothing.
 */
export const RPC_CODE_BY_KERNEL = Object.freeze({
  CONTRACT_INVALID: -32600,
  DUPLICATE_KEY: -32603,
  NOT_FOUND: -32001,
  DEPENDENCY_MISSING: -32003,
  DEPENDENCY_CYCLE: -32603,
  INPUT_INVALID: -32602,
  OUTPUT_INVALID: -32603,
  APPROVAL_REQUIRED: -32010,
  APPROVAL_DENIED: -32010,
  PERMISSION_DENIED: -32010,
  CANCELLED: -32005,
  TIMEOUT: -32004,
  PLUGIN_ERROR: -32000,
  DEPENDENCY_IN_USE: -32603,
});

/**
 * AUTHORITY. A remote peer may never be believed when it names one of these: the host
 * grants approval and permission, and a plugin able to claim them could assert that a
 * human had decided something. Host-side `-32010` exists for the host's own refusal; the
 * same integer arriving FROM a plugin is downgraded to `PLUGIN_ERROR`.
 */
export const REMOTE_FORBIDDEN_CODES = Object.freeze([
  'APPROVAL_REQUIRED', 'APPROVAL_DENIED', 'PERMISSION_DENIED',
]);

/** @type {(v: unknown) => v is Record<string, unknown>} */
const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** The tables are asked about arbitrary keys, so they are read through one typed lookup
 * instead of being indexed by something they may not declare.
 * @type {(table: object, key: string | number) => unknown} */
const lookup = (table, key) => /** @type {Record<string, unknown>} */ (table)[String(key)];

/** The kernel CODE for an rpc integer. `PLUGIN_ERROR` for anything unassigned — the honest
 * default, because an unknown failure is the peer's fault and not the caller's.
 * @param {unknown} rpcCode @returns {string} */
export function kernelCodeFor(rpcCode) {
  if (typeof rpcCode !== 'number' || !Number.isInteger(rpcCode)) return 'PLUGIN_ERROR';
  const mapped = lookup(KERNEL_CODE_BY_RPC, rpcCode);
  return typeof mapped === 'string' ? mapped : 'PLUGIN_ERROR';
}

/** The rpc integer for a kernel CODE. `-32000` for a code this table does not name, so a
 * future architecture code is a server fault rather than a silent success.
 * @param {unknown} kernelCode @returns {number} */
export function rpcCodeFor(kernelCode) {
  if (typeof kernelCode !== 'string') return UPP_CODES.PLUGIN_FAULT;
  const mapped = lookup(RPC_CODE_BY_KERNEL, kernelCode);
  return typeof mapped === 'number' ? mapped : UPP_CODES.PLUGIN_FAULT;
}

/** True when `code` is inside the reserved implementation range. @type {(c: unknown) => boolean} */
export const isServerErrorCode = (code) => typeof code === 'number' && Number.isInteger(code)
  && code >= SERVER_ERROR_RANGE.from && code <= SERVER_ERROR_RANGE.to;

/** Structured `{path, message}` entries only. Anything else a peer sent is dropped rather
 * than forwarded: details are read by machines and must have one shape.
 * @param {unknown} value @returns {SchemaError[]} */
export function readDetails(value) {
  if (!Array.isArray(value)) return [];
  /** @type {SchemaError[]} */
  const out = [];
  for (const entry of value) {
    if (!isPlain(entry)) continue;
    if (typeof entry.path === 'string' && typeof entry.message === 'string') {
      out.push({ path: entry.path, message: entry.message });
    }
  }
  return out;
}

/** Build the error object that goes on the wire. Never carries a stack.
 * @param {number} rpcCode @param {string} message
 * @param {ReadonlyArray<SchemaError>} [details] @returns {UppError} */
export function uppError(rpcCode, message, details = []) {
  /** @type {{ code: string, details?: ReadonlyArray<SchemaError> }} */
  const data = { code: kernelCodeFor(rpcCode) };
  if (details.length > 0) data.details = Object.freeze([...details]);
  return Object.freeze({ code: rpcCode, message, data: Object.freeze(data) });
}

/** The wire error for a `KernelError` the host is reporting outward.
 * @param {KernelError} error @returns {UppError} */
export function toUppError(error) {
  return uppError(rpcCodeFor(error.code), error.message, error.details);
}

/**
 * A remote error object -> the kernel result a caller sees. The containment rule, applied
 * to the wire: `data.code` is honoured ONLY when it is a PASSTHROUGH code, proved by the
 * SDK's own predicate. Everything else — in particular a forged `APPROVAL_DENIED` or
 * `PERMISSION_DENIED` — becomes `PLUGIN_ERROR`.
 * @param {unknown} rawError @returns {Err}
 */
export function remoteToResult(rawError) {
  const raw = isPlain(rawError) ? rawError : {};
  const rpcCode = typeof raw.code === 'number' ? raw.code : JSONRPC_CODES.INTERNAL_ERROR;
  const message = typeof raw.message === 'string' && raw.message.trim() !== ''
    ? raw.message
    : `remote error ${rpcCode}`;
  const data = isPlain(raw.data) ? raw.data : {};
  const details = readDetails(data.details);
  const claimed = typeof data.code === 'string' ? data.code : null;
  if (claimed !== null && !REMOTE_FORBIDDEN_CODES.includes(claimed) && CODES.includes(claimed)) {
    const passed = passthroughOf(new KernelError(claimed, message, details));
    if (passed !== null) return passed.toResult();
  }
  const mapped = kernelCodeFor(rpcCode);
  const code = REMOTE_FORBIDDEN_CODES.includes(mapped) ? 'PLUGIN_ERROR' : mapped;
  return new KernelError(code, message, details).toResult();
}
