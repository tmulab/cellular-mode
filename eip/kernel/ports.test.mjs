// K8, K9 — least privilege on ports, and "assembled at CALL time, never at apply".
import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '../sdk/index.mjs';
import { createKernel } from './index.mjs';
import { grantPorts } from './ports.mjs';
import { localeFormatter, makeWritePort, metricsCollector, reportArchive, spawnPort } from './doubles.mjs';
import { errorOf, kernelError, valueOf } from './assertions.mjs';

/** The doubles' sibling-facing contract. `get`/`serviceOf` answer `unknown` on
 * purpose — a service is known by contract, never by import — so the contract these
 * tests rely on is written here, once.
 * @typedef {{ sample: (input: { name: string, value: number }) => unknown,
 *   total: () => number }} Collector */
/** @type {(service: unknown) => Collector} */
const asCollector = (service) => /** @type {Collector} */ (service);

function composition() {
  const kernel = createKernel({ approver: () => ({ approved: true, by: 'operator' }) });
  kernel.register(metricsCollector);
  kernel.register(reportArchive);
  kernel.register(localeFormatter);
  return kernel;
}

test('K8 · ports — a plugin sees only ports whose permission it declared', async () => {
  const kernel = composition();
  const writer = makeWritePort();
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  await kernel.load('report.archive', {
    config: { prefix: 'snapshots' },
    ports: { writeBlob: writer.port, spawnWorker: spawnPort },
  });
  const result = await kernel.execute('report.archive', 'visible-ports', {});
  assert.deepEqual(result, { ok: true, value: { names: ['writeBlob'] } });
});

test('K8 · ports — an undeclared port is invisible, not merely refused at call time', () => {
  const { granted, denied } = grantPorts({ writeBlob: makeWritePort().port, spawnWorker: spawnPort }, ['fs.write']);
  assert.equal(granted.spawnWorker, undefined);
  assert.equal(typeof granted.writeBlob, 'function');
  assert.deepEqual(denied, ['spawnWorker']);
  assert.equal(Object.isFrozen(granted), true);
});

test('K8 · ports — a malformed or unnameable port is a composition error', () => {
  assert.throws(() => grantPorts({ writeBlob: () => {} }, ['fs.write']), /must be \{permission, fn\}/);
  assert.throws(
    () => grantPorts({ dropTables: { permission: 'db.admin', fn: () => {} } }, ['db.admin']),
    (err) => kernelError(err).code === 'PERMISSION_DENIED',
  );
});

test('K9 · lazy — a provider loaded AFTER the consumer is visible at call time', async () => {
  const kernel = composition();
  await kernel.load('locale.formatter', {});
  assert.deepEqual(valueOf(await kernel.execute('locale.formatter', 'format-total', {})),
    { text: 'no metrics available', degraded: true });
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  asCollector(kernel.get('metrics.collector')).sample({ name: 'GET /health', value: 1 });
  assert.deepEqual(valueOf(await kernel.execute('locale.formatter', 'format-total', {})),
    { text: '1 observation(s)', degraded: false });
});

test('K9 · lazy — a required dependency not yet loaded fails at CALL time, by name', async () => {
  const kernel = composition();
  const writer = makeWritePort();
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  await kernel.load('report.archive', { config: { prefix: 'snapshots' }, ports: { writeBlob: writer.port } });
  await kernel.dispose('report.archive');
  await kernel.dispose('metrics.collector');
  // report.archive loads with its required sibling merely REGISTERED...
  await kernel.load('report.archive', { config: { prefix: 'snapshots' }, ports: { writeBlob: writer.port } });
  const result = await kernel.execute('report.archive', 'store-snapshot', { name: 'daily' });
  assert.equal(result.ok, false);
  assert.equal(errorOf(result).code, 'PLUGIN_ERROR');
  assert.match(errorOf(result).message, /required dependency "metrics\.collector" .* is not loaded/);
  // The underlying named code travels in `details`, so the test pins DEPENDENCY_MISSING
  // and not merely "the capability threw something".
  assert.deepEqual((errorOf(result).details ?? []).map((d) => d.path), ['DEPENDENCY_MISSING']);
  assert.deepEqual(writer.written, []);
});


test('K9 · an UNDECLARED sibling is unreachable through ctx.get — contract, not convention', async () => {
  const kernel = composition();
  kernel.register(definePlugin({
    name: 'dashboard.widget',
    version: '1.0.0',
    sdk: '1',
    description: 'Reads totals it never declared a dependency on.',
    capabilities: {
      render: {
        description: 'Render the widget body.',
        consequential: false,
        input: { type: 'object', properties: {}, additionalProperties: false },
        output: { type: 'object', properties: { body: { type: 'string' } }, required: ['body'] },
      },
    },
    /** @param {import('../sdk/types.mjs').PluginContext} ctx */
    apply: (ctx) => ({ render: () => ({ body: String(asCollector(ctx.get('metrics.collector')).total()) }) }),
  }));
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  await kernel.load('dashboard.widget', {});
  const result = await kernel.execute('dashboard.widget', 'render', {});
  assert.equal(result.ok, false);
  assert.equal(errorOf(result).code, 'PLUGIN_ERROR');
  assert.match(errorOf(result).message, /did not declare "metrics\.collector" in inject/);
});
