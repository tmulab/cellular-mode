// assertions.mjs — reading a kernel answer inside a test, once instead of everywhere.
// Not a test file (the name does not match `node --test` discovery).
//
// `execute` returns a UNION — `{ok:true,value}` or `{ok:false,error}` — because a
// caller at the edge must be able to answer without a try/catch. That union is the
// right contract and the wrong thing to re-narrow in forty assertions: a test that
// spends three lines proving which arm it is in stops being readable as a claim.
//
// So each reader does two things in one call: it ASSERTS which arm the answer is in
// (with the whole answer in the failure message, which is better than the original
// `assert.equal(result.ok, false)` gave) and then hands back that arm. Nothing is
// loosened — there is no `any` here, and a wrong arm fails the test rather than
// reading `undefined` from it.
import assert from 'node:assert/strict';
import { KernelError } from '../sdk/index.mjs';

/** @typedef {import('../sdk/types.mjs').Result} Result */
/** @typedef {import('../sdk/types.mjs').ErrorShape} ErrorShape */

/**
 * The failure of a result, after asserting the call failed at all.
 * @type {(result: Result, why?: string) => ErrorShape}
 */
export function errorOf(result, why) {
  assert.ok(result.ok === false, why ?? `expected a failure, got ${JSON.stringify(result)}`);
  return result.error;
}

/**
 * The value of a successful result, as an object whose fields a test may read.
 * @type {(result: Result, why?: string) => Record<string, unknown>}
 */
export function valueOf(result, why) {
  assert.ok(result.ok === true, why ?? `expected a success, got ${JSON.stringify(result)}`);
  return /** @type {Record<string, unknown>} */ (result.value);
}

/**
 * A thrown value, as the `KernelError` the kernel contract promises it to be.
 * `catch` hands back `unknown`, and that is correct: anything can be thrown.
 * @type {(cause: unknown) => KernelError}
 */
export function kernelError(cause) {
  assert.ok(cause instanceof KernelError, `expected a KernelError, got ${String(cause)}`);
  return cause;
}
