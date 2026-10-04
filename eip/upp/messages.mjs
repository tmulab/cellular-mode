// JSON-RPC 2.0 envelopes: the builders, the strict validators, and id correlation.
//
// Strict in one direction only, and that is the design: what this module BUILDS is always
// well-formed, and what it READS is distrusted until proved. A reader that is generous about
// a missing `id` or a stray `jsonrpc` buys nothing and loses correlation — so every
// deviation is a reported breach carrying a JSON-RPC code, never a repair.
//
// Pure. Byte limits and parsing live in `framing.mjs`; the transports (cell 3) own sockets.
import { check } from '../sdk/index.mjs';
import { JSONRPC_CODES, UPP_CODES, uppError } from './errors.mjs';
import {
  ERROR_SCHEMA, METHODS, NOTIFICATIONS, PARAMS_SCHEMA_BY_METHOD, RESULT_SCHEMA_BY_METHOD,
} from './schemas.mjs';

/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */
/** @typedef {import('./errors.mjs').UppError} UppError */
/** @typedef {number | string} MessageId */
/** @typedef {{ ok: true, value: T } | { ok: false, error: UppError }} Checked
 * @template T */

export const JSONRPC_VERSION = '2.0';

/** @type {(v: unknown) => v is Record<string, unknown>} */
const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @type {(table: object, key: string) => unknown} */
const lookup = (table, key) => /** @type {Record<string, unknown>} */ (table)[key];
/** @type {(code: number, message: string, details?: SchemaError[]) => { ok: false, error: UppError }} */
const refuse = (code, message, details = []) => Object.freeze({
  ok: false, error: uppError(code, message, details),
});

/** A legal JSON-RPC id: an integer or a non-empty string. `null` is reserved by the
 * specification for a response to an unidentifiable request, so it is never an id we send.
 * @param {unknown} id @returns {id is MessageId} */
export function isMessageId(id) {
  if (typeof id === 'number') return Number.isInteger(id);
  return typeof id === 'string' && id !== '';
}

/** `id` and `method` are typed `unknown` because this function IS the check: a builder that
 * only accepted already-valid arguments would leave the validation to its callers, which is
 * exactly where it gets forgotten.
 * @param {unknown} id @param {unknown} method @param {Record<string, unknown>} [params]
 * @returns {Record<string, unknown>} */
export function request(id, method, params = {}) {
  if (!isMessageId(id)) throw new TypeError('a request id must be an integer or a non-empty string');
  if (typeof method !== 'string' || !METHODS.includes(method)) {
    throw new TypeError(`unknown UPP method: ${String(method)}`);
  }
  if (NOTIFICATIONS.includes(method)) throw new TypeError(`${method} is a notification, not a request`);
  return { jsonrpc: JSONRPC_VERSION, id, method, params };
}

/** @param {unknown} method @param {Record<string, unknown>} [params]
 * @returns {Record<string, unknown>} */
export function notification(method, params = {}) {
  if (typeof method !== 'string' || !NOTIFICATIONS.includes(method)) {
    throw new TypeError(`${String(method)} is not a notification`);
  }
  return { jsonrpc: JSONRPC_VERSION, method, params };
}

/** @param {unknown} id @param {Record<string, unknown>} result
 * @returns {Record<string, unknown>} */
export function response(id, result) {
  if (!isMessageId(id)) throw new TypeError('a response id must match the request id');
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

/** A failure response. `id` may be `null`: that is exactly the case JSON-RPC reserves it for,
 * a request whose id could not be read.
 * @param {unknown} id @param {UppError} error @returns {Record<string, unknown>} */
export function errorResponse(id, error) {
  return { jsonrpc: JSONRPC_VERSION, id: isMessageId(id) ? id : null, error };
}

/** @type {(raw: unknown) => { ok: false, error: UppError } | null} */
function checkEnvelope(raw) {
  if (Array.isArray(raw)) {
    return refuse(JSONRPC_CODES.INVALID_REQUEST,
      'batch arrays are not supported in UPP 1.0', [{ path: '', message: 'expected one object' }]);
  }
  if (!isPlain(raw)) {
    return refuse(JSONRPC_CODES.INVALID_REQUEST, 'a message must be a JSON object',
      [{ path: '', message: 'expected an object' }]);
  }
  if (raw.jsonrpc !== JSONRPC_VERSION) {
    return refuse(JSONRPC_CODES.INVALID_REQUEST, `jsonrpc must be "${JSONRPC_VERSION}"`,
      [{ path: 'jsonrpc', message: `got ${JSON.stringify(raw.jsonrpc)}` }]);
  }
  return null;
}

/** @type {(method: unknown) => { ok: false, error: UppError } | null} */
function checkMethod(method) {
  if (typeof method !== 'string' || method === '') {
    return refuse(JSONRPC_CODES.INVALID_REQUEST, 'method must be a non-empty string',
      [{ path: 'method', message: 'missing' }]);
  }
  if (!METHODS.includes(method)) {
    return refuse(JSONRPC_CODES.METHOD_NOT_FOUND, `unknown method "${method}"`,
      [{ path: 'method', message: `expected one of ${METHODS.join(', ')}` }]);
  }
  return null;
}

/**
 * Validate an incoming request or notification against the method's parameter schema.
 * `upp.cancel` additionally proves its `id`, which the schema subset cannot express.
 * @param {unknown} raw
 * @returns {Checked<{ id: MessageId | null, method: string, params: Record<string, unknown>, notification: boolean }>}
 */
export function validateMessage(raw) {
  const envelope = checkEnvelope(raw);
  if (envelope !== null) return envelope;
  const message = /** @type {Record<string, unknown>} */ (raw);
  const bad = checkMethod(message.method);
  if (bad !== null) return bad;
  const method = /** @type {string} */ (message.method);
  const isNotification = NOTIFICATIONS.includes(method);
  const hasId = Object.hasOwn(message, 'id');
  if (isNotification && hasId) {
    return refuse(JSONRPC_CODES.INVALID_REQUEST, `${method} is a notification and carries no id`,
      [{ path: 'id', message: 'must be absent' }]);
  }
  if (!isNotification && !isMessageId(message.id)) {
    return refuse(JSONRPC_CODES.INVALID_REQUEST, `${method} is a request and needs an id`,
      [{ path: 'id', message: 'expected an integer or a non-empty string' }]);
  }
  const params = message.params === undefined ? {} : message.params;
  if (!isPlain(params)) {
    return refuse(JSONRPC_CODES.INVALID_PARAMS, 'params must be an object',
      [{ path: 'params', message: 'positional parameters are not used' }]);
  }
  const schema = lookup(PARAMS_SCHEMA_BY_METHOD, method);
  const verdict = check(/** @type {import('../sdk/schema.mjs').Schema} */ (schema), params);
  if (!verdict.ok) {
    return refuse(JSONRPC_CODES.INVALID_PARAMS, `params for ${method} are invalid`,
      verdict.errors.map((e) => ({ path: `params${e.path ? `.${e.path}` : ''}`, message: e.message })));
  }
  if (method === 'upp.cancel' && !isMessageId(params.id)) {
    return refuse(JSONRPC_CODES.INVALID_PARAMS, 'upp.cancel needs the id it cancels',
      [{ path: 'params.id', message: 'expected an integer or a non-empty string' }]);
  }
  return Object.freeze({
    ok: true,
    value: {
      id: isNotification ? null : /** @type {MessageId} */ (message.id),
      method, params, notification: isNotification,
    },
  });
}

/**
 * Validate a response against the request it claims to answer. Correlation is checked here
 * and nowhere else: a response whose id does not match is not a late answer, it is a
 * different conversation.
 * @param {unknown} raw @param {{ id: MessageId, method: string }} sent
 * @returns {Checked<{ id: MessageId, result?: Record<string, unknown>, error?: UppError }>}
 */
export function validateResponse(raw, sent) {
  const envelope = checkEnvelope(raw);
  if (envelope !== null) return envelope;
  const message = /** @type {Record<string, unknown>} */ (raw);
  if (message.id !== sent.id) {
    return refuse(UPP_CODES.PLUGIN_UNAVAILABLE, `response id does not match request ${String(sent.id)}`,
      [{ path: 'id', message: `got ${JSON.stringify(message.id)}` }]);
  }
  const hasResult = Object.hasOwn(message, 'result');
  const hasError = Object.hasOwn(message, 'error');
  if (hasResult === hasError) {
    return refuse(JSONRPC_CODES.INVALID_REQUEST, 'a response carries exactly one of result or error',
      [{ path: '', message: hasResult ? 'both were present' : 'neither was present' }]);
  }
  if (hasError) {
    const verdict = check(ERROR_SCHEMA, message.error);
    if (!verdict.ok) {
      return refuse(JSONRPC_CODES.INVALID_REQUEST, 'the error object is malformed',
        verdict.errors.map((e) => ({ path: `error${e.path ? `.${e.path}` : ''}`, message: e.message })));
    }
    return Object.freeze({ ok: true, value: { id: sent.id, error: /** @type {UppError} */ (message.error) } });
  }
  const schema = lookup(RESULT_SCHEMA_BY_METHOD, sent.method);
  if (schema === undefined) {
    return refuse(JSONRPC_CODES.INVALID_REQUEST, `${sent.method} expects no response`,
      [{ path: 'method', message: 'notifications are not answered' }]);
  }
  const verdict = check(/** @type {import('../sdk/schema.mjs').Schema} */ (schema), message.result);
  if (!verdict.ok) {
    return refuse(JSONRPC_CODES.INVALID_REQUEST, `the result of ${sent.method} is invalid`,
      verdict.errors.map((e) => ({ path: `result${e.path ? `.${e.path}` : ''}`, message: e.message })));
  }
  return Object.freeze({
    ok: true,
    value: { id: sent.id, result: /** @type {Record<string, unknown>} */ (message.result) },
  });
}
