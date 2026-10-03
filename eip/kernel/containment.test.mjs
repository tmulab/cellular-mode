// K14 — the CLIENT-ERROR passthrough, and the forgery it must refuse.
//
// A plugin is the only thing that knows whether the id it was given names anything,
// so "not found" and "that input is wrong" are ITS answers to give: answering them as
// PLUGIN_ERROR would make an unknown id a 500, i.e. the server's fault for a question
// the client asked. Authority is the opposite case: a plugin able to throw
// APPROVAL_DENIED or PERMISSION_DENIED could claim a human had decided something.
//
// So the passthrough set is DECLARED and short — two codes, both client errors — and
// everything else, including a KernelError naming any other code, stays contained.
// Its own file because it is its own subject: execute.test.mjs covers the gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CODES, KernelError, PASSTHROUGH_CODES, definePlugin } from '../sdk/index.mjs';
import { createKernel } from './index.mjs';
import { errorOf } from './assertions.mjs';

/** A plugin whose single capability throws whatever the input names.
 * @param {string} key */
const thrower = (key) => definePlugin({
  name: key,
  version: '1.0.0',
  sdk: '1',
  description: 'Throws the error its input names, so the containment rule can be tested.',
  capabilities: {
    fail: {
      description: 'Throws a KernelError with the given code, or a plain Error.',
      consequential: false,
      input: {
        type: 'object',
        properties: { code: { type: 'string' }, plain: { type: 'boolean' } },
        required: [],
        additionalProperties: false,
      },
      output: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  apply: () => ({
    /** @param {{ code?: string, plain?: boolean }} input */
    fail({ code, plain }) {
      if (plain === true || code === undefined) throw new Error('something went wrong inside');
      throw new KernelError(code, `the plugin says ${code}`, [{ path: 'id', message: 'said so' }]);
    },
  }),
});

/** @type {(key: string) => Promise<ReturnType<typeof createKernel>>} */
async function loadedThrower(key) {
  const kernel = createKernel();
  kernel.register(thrower(key));
  await kernel.load(key, {});
  return kernel;
}

test('K14 · NOT_FOUND and INPUT_INVALID pass through with the plugin message, no stack', async () => {
  assert.deepEqual([...PASSTHROUGH_CODES], ['NOT_FOUND', 'INPUT_INVALID'],
    'the passthrough set is short, declared, and this test is where it is pinned');
  const kernel = await loadedThrower('client.errors');
  /** @type {import('../sdk/types.mjs').KernelEvent[]} */
  const errors = [];
  kernel.on('error', (event) => errors.push(event));
  for (const code of PASSTHROUGH_CODES) {
    const result = await kernel.execute('client.errors', 'fail', { code });
    const error = errorOf(result);
    assert.equal(error.code, code, 'the plugin code reaches the caller');
    assert.equal(error.message, `the plugin says ${code}`, 'the message is preserved verbatim');
    assert.deepEqual(error.details, [{ path: 'id', message: 'said so' }]);
    assert.equal('stack' in error, false);
    assert.equal(JSON.stringify(result).includes('execute.mjs'), false);
  }
  assert.deepEqual(errors, [], 'a client error is an answer, not a fault: no error event');
});

test('K14 · a plugin cannot forge an authority code: every other throw is PLUGIN_ERROR', async () => {
  const kernel = await loadedThrower('forger.plugin');
  // The whole closed list minus the two that pass through. Driven from CODES, so a
  // new code added to the architecture is covered here the day it is added.
  const forbidden = CODES.filter((code) => !PASSTHROUGH_CODES.includes(code));
  assert.ok(forbidden.includes('APPROVAL_DENIED') && forbidden.includes('PERMISSION_DENIED')
    && forbidden.includes('CANCELLED') && forbidden.length >= 11);
  for (const code of forbidden) {
    const error = errorOf(await kernel.execute('forger.plugin', 'fail', { code }));
    assert.equal(error.code, 'PLUGIN_ERROR', `a plugin must not be able to answer ${code}`);
    assert.match(error.message, /threw: the plugin says/);
    // The claimed code is still legible, as DETAIL — contained, never authority.
    assert.equal(error.details?.[0]?.path, code);
  }
  const plain = errorOf(await kernel.execute('forger.plugin', 'fail', { plain: true }));
  assert.equal(plain.code, 'PLUGIN_ERROR');
});
