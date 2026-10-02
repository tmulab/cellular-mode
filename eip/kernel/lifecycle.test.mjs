// K4..K9 — the plugin contract itself: provides the key it declares, refuses an
// impossible composition at load, leaves zero residue, sees only the ports it
// declared, and resolves siblings at CALL time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '../sdk/index.mjs';
import { createKernel } from './index.mjs';
import { grantPorts } from './ports.mjs';
import {
  localeFormatter, makeWritePort, metricsCollector, reportArchive, spawnPort, teardownLog,
} from './doubles.mjs';
import { kernelError } from './assertions.mjs';

/** The doubles' sibling-facing contract. `get`/`serviceOf` answer `unknown` on
 * purpose — a service is known by contract, never by import — so the contract these
 * tests rely on is written here, once.
 * @typedef {{ sample: (input: { name: string, value: number }) => unknown,
 *   total: () => number }} Collector */
/** @type {(service: unknown) => Collector} */
const asCollector = (service) => /** @type {Collector} */ (service);

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

/** A kernel with the three doubles registered and an approver that always says yes. */
function composition() {
  const kernel = createKernel({ approver: () => ({ approved: true, by: 'operator' }) });
  kernel.register(metricsCollector);
  kernel.register(reportArchive);
  kernel.register(localeFormatter);
  teardownLog.length = 0;
  return kernel;
}

test('K4 · P1 — after load the key answers with the capabilities it declared', async () => {
  const kernel = composition();
  const service = await kernel.load('metrics.collector', { config: { label: 'requests' } });
  assert.equal(typeof service.sample, 'function');
  assert.equal(kernel.isLoaded('metrics.collector'), true);
  assert.deepEqual(asCollector(kernel.get('metrics.collector')).sample({ name: 'GET /health', value: 1 }),
    { name: 'GET /health', count: 1, label: 'requests' });
  const declared = kernel.list().find((m) => m.name === 'metrics.collector');
  assert.deepEqual(Object.keys(declared?.capabilities ?? {}).sort(), ['flush-window', 'mis-shaped', 'sample']);
  assert.deepEqual(declared?.inject, {});
});

test('K4 · P1 — the plugin name IS the key: the inject map is exact', () => {
  assert.equal(reportArchive.name, 'report.archive');
  assert.deepEqual(reportArchive.inject, { 'metrics.collector': { required: true } });
  assert.deepEqual(localeFormatter.inject, { 'metrics.collector': { required: false } });
});

test('K5 · P2 — invalid required config fails LOUD and the key is NOT provided', async () => {
  const kernel = composition();
  const err = await rejected(kernel.load('metrics.collector', { config: { windowMs: 500 } }));
  assert.equal(err.code, 'INPUT_INVALID');
  assert.deepEqual((err.details ?? []).map((d) => d.path).sort(), ['config.label', 'config.windowMs']);
  assert.equal(kernel.isLoaded('metrics.collector'), false);
  assert.throws(() => kernel.get('metrics.collector'), /not loaded/);
});

test('K5 · P2 — a mandatory PORT does not degrade: apply refusing is a load failure', async () => {
  const kernel = composition();
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  const err = await rejected(kernel.load('report.archive', { config: { prefix: 'snapshots' } }));
  assert.equal(err.code, 'PLUGIN_ERROR');
  assert.match(err.message, /writeBlob/);
  assert.equal(kernel.isLoaded('report.archive'), false);
});

test('K5 · P2 — a required dependency that nobody registered fails at load', async () => {
  const kernel = createKernel();
  kernel.register(reportArchive);
  const err = await rejected(kernel.load('report.archive', { config: { prefix: 'snapshots' } }));
  assert.equal(err.code, 'DEPENDENCY_MISSING');
  assert.deepEqual(err.details, [{ path: 'inject.metrics.collector', message: 'not registered' }]);
});

test('K6 · P3 — inverse effects run in REVERSE order and the key disappears', async () => {
  const kernel = composition();
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  await kernel.dispose('metrics.collector');
  assert.deepEqual(teardownLog, ['clear-counters', 'close-window']);
  assert.equal(kernel.isLoaded('metrics.collector'), false);
  assert.throws(() => kernel.get('metrics.collector'), /not loaded/);
});

test('K6 · P3 — loading again after dispose works, with no state stuck in the module', async () => {
  const kernel = composition();
  await kernel.load('metrics.collector', { config: { label: 'first' } });
  asCollector(kernel.get('metrics.collector')).sample({ name: 'GET /health', value: 1 });
  await kernel.dispose('metrics.collector');
  await kernel.load('metrics.collector', { config: { label: 'second' } });
  assert.deepEqual(asCollector(kernel.get('metrics.collector')).sample({ name: 'GET /health', value: 1 }),
    { name: 'GET /health', count: 1, label: 'second' });
});

test('K6 · P3 — disposing a consumer leaves the sibling untouched: the arrow is one-way', async () => {
  const kernel = composition();
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  await kernel.load('locale.formatter', {});
  await kernel.dispose('locale.formatter');
  assert.equal(kernel.isLoaded('metrics.collector'), true);
  assert.equal(asCollector(kernel.get('metrics.collector')).total(), 0);
});

test('K6 · a failed apply leaves zero residue: its inverses already ran', async () => {
  const kernel = createKernel();
  /** @type {string[]} */
  const log = [];
  kernel.register(definePlugin({
    name: 'mail.outbox',
    version: '1.0.0',
    sdk: '1',
    description: 'Opens a connection, then discovers it cannot continue.',
    capabilities: {
      send: {
        description: 'Send one message.',
        consequential: true,
        input: { type: 'object', properties: { to: { type: 'string' } }, required: ['to'] },
        output: { type: 'object', properties: { queued: { type: 'boolean' } }, required: ['queued'] },
      },
    },
    /** @param {import('../sdk/types.mjs').PluginContext} ctx */
    apply(ctx) {
      ctx.onDispose(() => log.push('connection-closed'));
      throw new Error('relay host refused the greeting');
    },
  }));
  const err = await rejected(kernel.load('mail.outbox', {}));
  assert.equal(err.code, 'PLUGIN_ERROR');
  assert.deepEqual(log, ['connection-closed']);
  assert.equal(kernel.isLoaded('mail.outbox'), false);
});

test('K7 · dispose refuses while a loaded dependent declares the key required', async () => {
  const kernel = composition();
  const writer = makeWritePort();
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  await kernel.load('report.archive', { config: { prefix: 'snapshots' }, ports: { writeBlob: writer.port } });
  const err = await rejected(kernel.dispose('metrics.collector'));
  assert.equal(err.code, 'DEPENDENCY_IN_USE');
  assert.match(err.message, /report\.archive/);
  assert.deepEqual(err.details, [{ path: 'report.archive', message: 'declares this key as required' }]);
  assert.equal(kernel.isLoaded('metrics.collector'), true);
  // Dispose the dependent first, and the provider is free again.
  await kernel.dispose('report.archive');
  await kernel.dispose('metrics.collector');
  assert.equal(kernel.isLoaded('metrics.collector'), false);
});

test('K7 · an OPTIONAL dependent never blocks dispose', async () => {
  const kernel = composition();
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  await kernel.load('locale.formatter', {});
  await kernel.dispose('metrics.collector');
  assert.deepEqual(await kernel.execute('locale.formatter', 'format-total', {}),
    { ok: true, value: { text: 'no metrics available', degraded: true } });
});

test('DUPLICATE_KEY · loading an already loaded key is refused', async () => {
  const kernel = composition();
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  const err = await rejected(kernel.load('metrics.collector', { config: { label: 'again' } }));
  assert.equal(err.code, 'DUPLICATE_KEY');
});
