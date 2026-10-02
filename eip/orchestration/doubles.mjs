// Test doubles for the gateway suite. The orchestration layer may import the
// kernel's PUBLIC entry and the SDK only — never a plugin from `eip/plugins`, which
// is why these minimal plugins are defined here, in the layer's own directory.
import assert from 'node:assert/strict';
import { definePlugin } from '../sdk/index.mjs';

/** @typedef {import('../sdk/types.mjs').Schema} Schema */
/** @typedef {import('../sdk/types.mjs').Result} Result */
/** @typedef {import('../sdk/types.mjs').ErrorShape} ErrorShape */
/** @typedef {ReturnType<typeof import('../kernel/index.mjs').createKernel>} Kernel */

/** @type {(properties: Record<string, Schema>, required: string[]) => Schema} */
const obj = (properties, required) => ({
  type: 'object', properties, required, additionalProperties: false,
});

/** One recorded `execute`. `options` is what the gateway chose to forward, which is
 * the thing most of these tests are actually about.
 * @typedef {{ key: string, cap: string, input: unknown,
 *   options: { signal?: unknown, timeoutMs?: unknown, approval?: unknown } }} KernelCall */

/** What the kernel was actually asked, so a test can inspect it.
 * @type {KernelCall[]} */
export const kernelCalls = [];

/** The recorded call a test is asking about, asserted to exist.
 * @type {(at?: number) => KernelCall} */
export function recordedCall(at = 0) {
  const call = kernelCalls[at];
  assert.ok(call, `expected a recorded kernel call at ${at}, got ${kernelCalls.length}`);
  return call;
}

// The orchestration layer may import the kernel's PUBLIC entry and the SDK only, so
// it cannot reuse eip/kernel/assertions.mjs. That boundary is worth more than the six
// lines it costs here: the rule exists so this layer stays a CLIENT of the kernel.

/** The failure of a result, after asserting the call failed at all.
 * @type {(result: Result, why?: string) => ErrorShape} */
export function errorOf(result, why) {
  assert.ok(result.ok === false, why ?? `expected a failure, got ${JSON.stringify(result)}`);
  return result.error;
}

export const notes = definePlugin({
  name: 'agent.notes',
  version: '1.0.0',
  sdk: '1',
  description: 'A tiny note board: one reading capability, one consequential write.',
  capabilities: {
    read: {
      description: 'Number of notes currently on the board.',
      consequential: false,
      input: obj({}, []),
      output: obj({ count: { type: 'integer', minimum: 0 } }, ['count']),
    },
    append: {
      description: 'Add a note. Consequential: it changes what others will read.',
      consequential: true,
      input: obj({ text: { type: 'string', minLength: 1 } }, ['text']),
      output: obj({ count: { type: 'integer', minimum: 1 } }, ['count']),
    },
  },
  /** @param {import('../sdk/types.mjs').PluginContext} ctx */
  apply(ctx) {
    /** @type {string[]} */
    const board = [];
    ctx.onDispose(() => { board.length = 0; });
    return {
      read: () => ({ count: board.length }),
      /** @param {{ text: string }} input */
      append: ({ text }) => {
        board.push(text);
        return { count: board.length };
      },
    };
  },
});

/**
 * A kernel wrapper that records every `execute` call, so a test can prove what the
 * gateway forwarded — and, more importantly, what it did NOT forward.
 * @param {Kernel} kernel @returns {Kernel}
 */
export function spyKernel(kernel) {
  return Object.freeze({
    ...kernel,
    list: kernel.list,
    /** @type {Kernel['execute']} */
    execute: (key, cap, input, options) => {
      kernelCalls.push({ key, cap, input, options: options ?? {} });
      return kernel.execute(key, cap, input, options);
    },
  });
}

/**
 * A host policy a real composition could ship: a consequential act needs an
 * approval object that names who asked and who consented. An agent never holds the
 * kernel, so the only way such an object exists is through the gateway's human gate.
 * @type {import('../kernel/types.mjs').Approver}
 */
export const hostApprover = ({ approval }) => {
  // Provenance arrives from outside: the cast names the two fields checked below.
  const seal = /** @type {{ requestedBy?: unknown, approvedBy?: unknown }} */ (approval);
  if (approval === null || typeof approval !== 'object') {
    return { approved: false, reason: 'no approval provenance' };
  }
  if (typeof seal.requestedBy !== 'string' || typeof seal.approvedBy !== 'string') {
    return { approved: false, reason: 'approval provenance is incomplete' };
  }
  return { approved: true, by: seal.approvedBy };
};
