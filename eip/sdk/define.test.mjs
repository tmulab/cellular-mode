// `definePlugin` is the author-facing gate. It must fail at module load, with a
// named error carrying structure, and it must hand back something nobody can
// edit afterwards: a declaration that can change is not a contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from './define.mjs';
import { ContractError, KernelError } from './errors.mjs';
import { CODES } from './errors.mjs';

/** `assert.throws` returns nothing, and the ERROR is what we need to inspect.
 * @type {(fn: () => unknown) => unknown} */
function thrown(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return assert.fail('expected a throw, got a return');
}

const sessionCache = {
  name: 'session.cache',
  version: '3.1.4',
  sdk: '1',
  description: 'Short-lived token cache for the running process.',
  permissions: ['clock'],
  capabilities: {
    put: {
      description: 'Store a token under a subject.',
      consequential: false,
      input: { type: 'object', properties: { subject: { type: 'string' } }, required: ['subject'] },
      output: { type: 'object', properties: { stored: { type: 'boolean' } }, required: ['stored'] },
    },
  },
  apply: () => ({ put: () => ({ stored: true }) }),
};

test('definePlugin · returns the manifest when the contract holds', () => {
  const plugin = definePlugin({ ...sessionCache });
  assert.equal(plugin.name, 'session.cache');
  assert.equal(typeof plugin.apply, 'function');
});

test('definePlugin · the returned manifest is frozen, deeply', () => {
  const plugin = definePlugin({ ...sessionCache });
  const put = plugin.capabilities.put;
  const { permissions } = plugin;
  assert.ok(put, 'the reference manifest declares put');
  assert.ok(permissions, 'the reference manifest declares permissions');
  assert.throws(() => { plugin.name = 'session.other'; }, TypeError);
  assert.throws(() => { put.consequential = true; }, TypeError);
  assert.throws(() => { permissions.push('fs.write'); }, TypeError);
  assert.equal(put.consequential, false);
});

test('definePlugin · throws ContractError with the code from the closed list', () => {
  const broken = { ...sessionCache, name: 'session', permissions: ['db.admin'] };
  const err = thrown(() => definePlugin(broken));
  assert.ok(err instanceof ContractError);
  assert.ok(err instanceof KernelError);
  assert.equal(err.code, 'CONTRACT_INVALID');
  assert.ok(CODES.includes(err.code));
  assert.deepEqual(err.details.map((d) => d.path).sort(), ['name', 'permissions.0']);
  assert.match(err.message, /name: name must be a key/);
});

test('definePlugin · an error result never carries a stack', () => {
  const err = thrown(() => definePlugin({ ...sessionCache, apply: null }));
  assert.ok(err instanceof ContractError);
  const result = err.toResult();
  assert.deepEqual(Object.keys(result).sort(), ['error', 'ok']);
  assert.deepEqual(Object.keys(result.error).sort(), ['code', 'details', 'message']);
  assert.equal('stack' in result.error, false);
});

test('KernelError · refuses a code outside the closed list', () => {
  assert.throws(() => new KernelError('WHATEVER', 'x'), TypeError);
  assert.equal(new KernelError('TIMEOUT', 'x').details.length, 0);
});
