// Framing: the bytes a message costs, and the two operations that bound them.
//
// Serialisation lives apart from the envelopes next door because it is a different subject
// to review: `messages.mjs` answers "is this a legal JSON-RPC message", this file answers
// "may this many bytes cross, and did a frame survive the trip". Keeping them apart is also
// what lets a transport (cell 3) depend on the bound without depending on the method set.
//
// Pure: a byte length is a fact about a string, not about a socket. The transports own the
// socket; this module owns the limit.
import { JSONRPC_CODES, UPP_CODES, uppError } from './errors.mjs';

/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */
/** @typedef {import('./errors.mjs').UppError} UppError */
/** @typedef {{ ok: true, value: T } | { ok: false, error: UppError }} Framed
 * @template T */

/** 1 MiB per message, every transport. Configurable DOWNWARD only (`docs/upp/SPEC.md` §9):
 * a limit somebody can raise is not a limit, so `serialize` refuses a larger one. */
export const MAX_MESSAGE_BYTES = 1024 * 1024;

/** @type {(code: number, message: string, details?: SchemaError[]) => { ok: false, error: UppError }} */
const refuse = (code, message, details = []) => Object.freeze({
  ok: false, error: uppError(code, message, details),
});

/** @type {(limit: number) => void} */
function assertLimit(limit) {
  if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_MESSAGE_BYTES) {
    throw new RangeError(`the message limit is an integer in 1..${MAX_MESSAGE_BYTES} bytes`);
  }
}

/** Monotonic request ids, as a closure rather than a module-level counter: two connections
 * must not share a sequence, and a module-level counter would make them.
 * @returns {{ next: () => number, issued: () => number }} */
export function createIdSequence() {
  let last = 0;
  return Object.freeze({ next: () => ++last, issued: () => last });
}

/** Serialise under the size bound. The limit is measured on the UTF-8 BYTES, because that is
 * what a line costs; a character count would under-count every non-ASCII payload.
 * @param {unknown} message @param {number} [limit] @returns {Framed<string>} */
export function serialize(message, limit = MAX_MESSAGE_BYTES) {
  assertLimit(limit);
  let text;
  try {
    text = JSON.stringify(message);
  } catch (cause) {
    return refuse(JSONRPC_CODES.INTERNAL_ERROR, 'the message is not serialisable as JSON',
      [{ path: '', message: String(cause) }]);
  }
  if (typeof text !== 'string') {
    return refuse(JSONRPC_CODES.INTERNAL_ERROR, 'the message is not serialisable as JSON',
      [{ path: '', message: 'JSON.stringify produced nothing' }]);
  }
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > limit) {
    return refuse(UPP_CODES.PAYLOAD_TOO_LARGE, `message is ${bytes} bytes, limit is ${limit}`,
      [{ path: '', message: 'nothing was written' }]);
  }
  return Object.freeze({ ok: true, value: text });
}

/** Parse one framed message. A malformed line is `-32700` and never a repair attempt.
 * @param {string} text @param {number} [limit] @returns {Framed<unknown>} */
export function deserialize(text, limit = MAX_MESSAGE_BYTES) {
  assertLimit(limit);
  if (typeof text !== 'string') {
    return refuse(JSONRPC_CODES.PARSE_ERROR, 'a frame must be text', [{ path: '', message: 'not a string' }]);
  }
  if (Buffer.byteLength(text, 'utf8') > limit) {
    return refuse(UPP_CODES.PAYLOAD_TOO_LARGE, `frame exceeds ${limit} bytes`,
      [{ path: '', message: 'the frame was discarded' }]);
  }
  try {
    return Object.freeze({ ok: true, value: JSON.parse(text) });
  } catch (cause) {
    return refuse(JSONRPC_CODES.PARSE_ERROR, 'the frame is not valid JSON',
      [{ path: '', message: String(cause) }]);
  }
}
