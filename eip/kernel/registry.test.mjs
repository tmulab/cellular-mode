// K1, K2, K3 — the registry is the only place that answers "who owns this key?".
import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '../sdk/index.mjs';
import { createKernel } from './index.mjs';
import { findRequiredCycle } from './registry.mjs';
import { localeFormatter, metricsCollector, reportArchive } from './doubles.mjs';
import { errorOf, kernelError } from './assertions.mjs';

/** A manifest built WITHOUT definePlugin, so the kernel's own gate is exercised.
 * @param {Record<string, unknown>} [patch] @returns {Record<string, unknown>} */
function rawPlugin(patch = {}) {
  return {
    name: 'audit.trail',
    version: '1.0.0',
    sdk: '1',
    description: 'Immutable record of decisions.',
    capabilities: {
      record: {
        description: 'Record one decision.',
        consequential: false,
        input: { type: 'object', properties: { what: { type: 'string' } }, required: ['what'] },
        output: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      },
    },
    apply: () => ({ record: () => ({ ok: true }) }),
    ...patch,
  };
}

/** @param {() => unknown} fn @returns {import('../sdk/index.mjs').KernelError} */
function thrown(fn) {
  try {
    fn();
  } catch (error) {
    return kernelError(error);
  }
  return assert.fail('expected a throw, got a return');
}

/** @param {Promise<unknown>} promise
 * @returns {Promise<import('../sdk/index.mjs').KernelError>} */
async function rejected(promise) {
  try {
    await promise;
  } catch (error) {
    return kernelError(error);
  }
  return assert.fail('expected a rejection, got a resolution');
}

test('K1 · register refuses a manifest that breaks the contract, and keeps the registry empty', () => {
  const kernel = createKernel();
  const err = thrown(() => kernel.register(rawPlugin({ sdk: '0', permissions: ['db.root'] })));
  assert.equal(err.code, 'CONTRACT_INVALID');
  assert.deepEqual((err.details ?? []).map((d) => d.path).sort(), ['permissions.0', 'sdk']);
  assert.deepEqual(kernel.list(), []);
});

test('K2 · duplicate key is refused and the first owner survives', () => {
  const kernel = createKernel();
  kernel.register(rawPlugin({ version: '1.0.0' }));
  const err = thrown(() => kernel.register(rawPlugin({ version: '2.0.0' })));
  assert.equal(err.code, 'DUPLICATE_KEY');
  assert.equal(kernel.list().length, 1);
  assert.equal(kernel.list()[0]?.version, '1.0.0');
});

test('K3 · a required-inject cycle is detected at load, with the path named', async () => {
  const kernel = createKernel();
  /** @type {(name: string, dep: string) => import('../sdk/types.mjs').Manifest} */
  const pair = (name, dep) => definePlugin({
    name,
    version: '1.0.0',
    sdk: '1',
    description: `Half of a mutually required pair (${name}).`,
    inject: { [dep]: { required: true } },
    capabilities: {
      ping: {
        description: 'Liveness probe.',
        consequential: false,
        input: { type: 'object', properties: {}, additionalProperties: false },
        output: { type: 'object', properties: { up: { type: 'boolean' } }, required: ['up'] },
      },
    },
    apply: () => ({ ping: () => ({ up: true }) }),
  });
  kernel.register(pair('queue.worker', 'schedule.timer'));
  kernel.register(pair('schedule.timer', 'queue.worker'));
  const err = await rejected(kernel.load('queue.worker', {}));
  assert.equal(err.code, 'DEPENDENCY_CYCLE');
  assert.match(err.message, /queue\.worker -> schedule\.timer -> queue\.worker/);
  assert.equal(kernel.isLoaded('queue.worker'), false);
});

test('K3 · an OPTIONAL mutual dependency is not a cycle — both sides load', async () => {
  const kernel = createKernel();
  /** @type {(name: string, dep: string) => import('../sdk/types.mjs').Manifest} */
  const soft = (name, dep) => definePlugin({
    name,
    version: '1.0.0',
    sdk: '1',
    description: `Optionally aware of ${dep}.`,
    inject: { [dep]: { required: false } },
    capabilities: {
      ping: {
        description: 'Liveness probe.',
        consequential: false,
        input: { type: 'object', properties: {}, additionalProperties: false },
        output: { type: 'object', properties: { up: { type: 'boolean' } }, required: ['up'] },
      },
    },
    apply: () => ({ ping: () => ({ up: true }) }),
  });
  kernel.register(soft('queue.worker', 'schedule.timer'));
  kernel.register(soft('schedule.timer', 'queue.worker'));
  await kernel.load('queue.worker', {});
  await kernel.load('schedule.timer', {});
  assert.equal(kernel.isLoaded('queue.worker') && kernel.isLoaded('schedule.timer'), true);
});

test('findRequiredCycle · pure, and an unregistered key is absence, not a knot', () => {
  // `findRequiredCycle` reads only `inject`, so the fixtures carry only that: the
  // cast records which part of the manifest contract this pure function depends on.
  const partial = (/** @type {string} */ name, /** @type {string} */ dep) =>
    /** @type {import('../sdk/types.mjs').Manifest} */ (
      /** @type {unknown} */ ({ name, inject: { [dep]: { required: true } } }));
  const manifests = new Map([
    ['a.one', partial('a.one', 'b.two')],
    ['b.two', partial('b.two', 'c.three')],
  ]);
  assert.equal(findRequiredCycle(manifests, 'a.one'), null);
  manifests.set('c.three', partial('c.three', 'a.one'));
  assert.deepEqual(findRequiredCycle(manifests, 'a.one'), ['a.one', 'b.two', 'c.three', 'a.one']);
});

test('K14 · list() is metadata only: no apply, no dev-UI body, inject map intact', () => {
  const kernel = createKernel();
  kernel.register(metricsCollector);
  kernel.register(reportArchive);
  kernel.register(localeFormatter);
  const listed = kernel.list();
  assert.deepEqual(listed.map((m) => m.name).sort(), ['locale.formatter', 'metrics.collector', 'report.archive']);
  for (const manifest of listed) {
    // Absent, not merely undefined — the stronger of the two claims.
    assert.equal(Object.hasOwn(manifest, 'apply'), false);
    assert.equal(Object.hasOwn(manifest.devUi ?? {}, 'html'), false);
  }
  const archive = listed.find((m) => m.name === 'report.archive');
  assert.deepEqual(archive?.inject, { 'metrics.collector': { required: true } });
  assert.deepEqual(archive?.permissions, ['fs.write']);
  assert.equal(archive?.capabilities['store-snapshot']?.consequential, true);
  assert.equal(archive?.capabilities['visible-ports']?.consequential, false);
});

test('NOT_FOUND · loading, executing or disposing an unregistered key is named', async () => {
  const kernel = createKernel();
  assert.equal((await rejected(kernel.load('ghost.key', {}))).code, 'NOT_FOUND');
  assert.equal((await rejected(kernel.dispose('ghost.key'))).code, 'NOT_FOUND');
  const result = await kernel.execute('ghost.key', 'anything', {});
  assert.deepEqual(result.ok, false);
  assert.equal(errorOf(result).code, 'NOT_FOUND');
});
