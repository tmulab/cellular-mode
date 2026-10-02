// Reading a request body is where a server is attacked first, so it is its own
// module with its own test: bounded, typed, and parsed only after both checks pass.
import { messageOf } from '../sdk/index.mjs';
import { failure } from './errors.mjs';

/** @typedef {import('../sdk/types.mjs').Err} Err */
/** A refusal carries the status and the envelope; a success carries the parsed value.
 * `status?: undefined` on the success arm is what makes `result.status !== undefined`
 * a usable discriminant for the router.
 * @typedef {{ status: number, body: Err }} Refusal
 * @typedef {{ value: unknown, status?: undefined } | Refusal} BodyResult
 */

/** 64 KB. Enough for a long article, far from enough to exhaust memory. */
export const MAX_BODY_BYTES = 64 * 1024;

const JSON_TYPE = /^application\/json(\s*;.*)?$/i;

/** PURE. `null` when the content type is acceptable, else the 415 envelope.
 * @param {unknown} header @returns {Refusal | null} */
export function checkContentType(header) {
  if (typeof header === 'string' && JSON_TYPE.test(header.trim())) return null;
  return {
    status: 415,
    body: failure('INPUT_INVALID', 'this API speaks application/json only', [
      { path: 'content-type', message: `expected application/json, got ${header ?? 'nothing'}` },
    ]),
  };
}

/**
 * Read at most MAX_BODY_BYTES and parse JSON. Returns `{value}` or `{status, body}`.
 * The announced length is refused BEFORE reading, and the stream is still cut at
 * the limit: a lying Content-Length must not buy an unbounded read.
 * @param {import('node:http').IncomingMessage} req @param {number} [limit]
 * @returns {Promise<BodyResult>}
 */
export async function readJsonBody(req, limit = MAX_BODY_BYTES) {
  const badType = checkContentType(req.headers['content-type']);
  if (badType !== null) return badType;

  const announced = Number(req.headers['content-length']);
  if (Number.isFinite(announced) && announced > limit) return tooLarge(limit);

  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      req.destroy();
      return tooLarge(limit);
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return { value: text === '' ? {} : JSON.parse(text) };
  } catch (cause) {
    return {
      status: 400,
      body: failure('INPUT_INVALID', 'the request body is not valid JSON', [
        { path: 'body', message: messageOf(cause) },
      ]),
    };
  }
}

/** @type {(limit: number) => Refusal} */
const tooLarge = (limit) => ({
  status: 413,
  body: failure('INPUT_INVALID', `the request body exceeds ${limit} bytes`, [
    { path: 'body', message: `at most ${limit} bytes` },
  ]),
});

/**
 * PURE. The call envelope: exactly `{input}`, nothing else.
 * `approval` is named explicitly and refused with `APPROVAL_REQUIRED`: a caller
 * that tries to approve its own act is not making a malformed request, it is
 * asking for consent it cannot give. Consent comes from the host's approver.
 * @param {unknown} payload @returns {BodyResult}
 */
export function readCallEnvelope(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 400, body: failure('INPUT_INVALID', 'the body must be a JSON object {"input": …}', [{ path: 'body', message: 'expected an object' }]) };
  }
  if ('approval' in payload) {
    return {
      status: 403,
      body: failure('APPROVAL_REQUIRED', 'an HTTP caller cannot supply its own approval', [
        { path: 'approval', message: 'approval is issued by the host approver, never by the caller' },
      ]),
    };
  }
  const unknown = Object.keys(payload).filter((field) => field !== 'input');
  if (unknown.length > 0) {
    return {
      status: 400,
      body: failure('INPUT_INVALID', `unknown field(s) in the request body: ${unknown.join(', ')}`,
        unknown.map((field) => ({ path: field, message: 'not an allowed field' }))),
    };
  }
  return { value: /** @type {{ input?: unknown }} */ (payload).input ?? {} };
}
