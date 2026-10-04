// Replaying the conformance corpus: PURE, and deliberately ignorant of where the peer runs.
//
// The corpus under `upp/conformance/cases/` is JSON, so it belongs to no language. This module
// is the other half of that promise: it talks to a `Conversation` — send a LINE, read back the
// lines that arrived — and nothing in it knows whether those lines crossed a pipe, an HTTP
// request or a function call. That is what lets the same eleven cases judge a Python process
// and an in-process JavaScript plugin by the same standard.
//
// The matchers are narrow on purpose. `result` is exact equality, `resultShape` is a declared
// subset, `code` is the exact JSON-RPC integer, `none` asserts SILENCE. A matcher that merely
// said "it failed" would pass for `TIMEOUT`, `CANCELLED` and `PLUGIN_ERROR` alike, and those
// are three different facts.
import { manifestDigest } from './canonical.mjs';

/** @typedef {Record<string, unknown>} Raw */
/** @typedef {{ send: (line: string) => void, messages: () => unknown[] }} Conversation */
/** @typedef {{ name: string, why?: string, requests: Raw[], expect: Raw[] }} Case */
/** @typedef {{ name: string, ok: boolean, breaches: string[], received: number }} CaseResult */

/** @type {(v: unknown) => v is Raw} */
const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Strict structural equality over JSON values. @param {unknown} a @param {unknown} b @returns {boolean} */
export function sameJson(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameJson(item, b[i]));
  }
  if (!isPlain(a) || !isPlain(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && sameJson(a[key], b[key]));
}

/** Is `whole` a superset of `part`? Arrays are compared member-wise and must be the same
 * length: a corpus that accepted a longer array would stop noticing added members.
 * @param {unknown} part @param {unknown} whole @returns {boolean} */
export function covers(part, whole) {
  if (Array.isArray(part)) return Array.isArray(whole) && part.length === whole.length
    && part.every((item, i) => covers(item, whole[i]));
  if (!isPlain(part)) return sameJson(part, whole);
  if (!isPlain(whole)) return false;
  return Object.keys(part).every((key) => Object.hasOwn(whole, key) && covers(part[key], whole[key]));
}

/** One request entry of a case, as the line that goes on the wire.
 * @param {Raw} entry @returns {string} */
export function requestLine(entry) {
  if (typeof entry.line === 'string') return entry.line;
  if (isPlain(entry.message)) return JSON.stringify(entry.message);
  throw new TypeError(`a request entry must be {message} or {line}, got ${JSON.stringify(entry)}`);
}

/** How many messages the case expects to receive. A `none` expectation expects silence, so it
 * does not count. @param {ReadonlyArray<Raw>} expect @returns {number} */
export const expectedMessageCount = (expect) => expect.filter((e) => e.none !== true).length;

/**
 * Judge one expectation against one received message. Returns the breaches, empty means pass.
 * @param {Raw} expectation @param {unknown} message @param {string} pin
 * @param {number} index @returns {string[]}
 */
export function matchExpectation(expectation, message, pin, index) {
  const at = `expect[${index}]`;
  if (expectation.none === true) {
    return message === undefined ? [] : [`${at}: expected silence, got ${JSON.stringify(message)}`];
  }
  if (message === undefined) return [`${at}: expected a message, nothing arrived`];
  if (!isPlain(message)) return [`${at}: a message must be a JSON object, got ${JSON.stringify(message)}`];
  /** @type {string[]} */
  const breaches = [];
  if (Object.hasOwn(expectation, 'id') && !sameJson(expectation.id, message.id ?? null)) {
    breaches.push(`${at}: id must be ${JSON.stringify(expectation.id)}, got ${JSON.stringify(message.id ?? null)}`);
  }
  if (Object.hasOwn(expectation, 'code')) {
    const error = isPlain(message.error) ? message.error : null;
    if (error === null) breaches.push(`${at}: expected an error object, got ${JSON.stringify(message)}`);
    else if (error.code !== expectation.code) {
      breaches.push(`${at}: code must be ${String(expectation.code)}, got ${JSON.stringify(error.code)}`);
    }
  }
  if (Object.hasOwn(expectation, 'result') && !sameJson(expectation.result, message.result)) {
    breaches.push(`${at}: result must be ${JSON.stringify(expectation.result)}, got ${JSON.stringify(message.result)}`);
  }
  if (Object.hasOwn(expectation, 'resultShape') && !covers(expectation.resultShape, message.result)) {
    breaches.push(`${at}: result must cover ${JSON.stringify(expectation.resultShape)}, got ${JSON.stringify(message.result)}`);
  }
  if (expectation.manifestPin === true) breaches.push(...checkPin(message.result, pin, at));
  return breaches;
}

/** @type {(result: unknown, pin: string, at: string) => string[]} */
function checkPin(result, pin, at) {
  const manifest = isPlain(result) ? result.manifest : undefined;
  if (manifest === undefined) return [`${at}: the result carries no manifest to pin`];
  let digest;
  try {
    digest = manifestDigest(manifest);
  } catch (cause) {
    return [`${at}: the manifest is not representable as JSON: ${String(cause)}`];
  }
  return digest === pin ? [] : [`${at}: manifest pin is ${pin}, the plugin answered ${digest}`];
}

/** @type {(ms: number) => Promise<void>} */
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Send every request, wait for the expected number of answers, then judge in order. The extra
 * `settleMs` after the last expected message is what makes a `none` expectation mean anything:
 * without it, "no reply yet" and "no reply ever" are the same observation.
 * @param {Conversation} conversation @param {Case} kase
 * @param {{ pin: string, deadlineMs?: number, settleMs?: number }} options @returns {Promise<CaseResult>}
 */
export async function replayCase(conversation, kase, options) {
  const { pin, deadlineMs = 15_000, settleMs = 250 } = options;
  for (const entry of kase.requests) conversation.send(requestLine(entry));
  const wanted = expectedMessageCount(kase.expect);
  const until = Date.now() + deadlineMs;
  while (conversation.messages().length < wanted && Date.now() < until) await wait(20);
  await wait(settleMs);
  const received = conversation.messages();
  /** @type {string[]} */
  const breaches = [];
  kase.expect.forEach((expectation, i) => {
    breaches.push(...matchExpectation(expectation, received[i], pin, i));
  });
  if (received.length > kase.expect.length) {
    breaches.push(`${received.length - kase.expect.length} unexpected extra message(s): `
      + JSON.stringify(received.slice(kase.expect.length)));
  }
  return { name: kase.name, ok: breaches.length === 0, breaches, received: received.length };
}
