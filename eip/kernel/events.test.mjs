// K14 — observability without noise. The kernel tells the host everything and
// the terminal nothing: where logs belong is the host's decision, not ours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createEvents } from './events.mjs';
import { createKernel } from './index.mjs';
import { makeWritePort, metricsCollector, reportArchive } from './doubles.mjs';

/** @typedef {import('../sdk/types.mjs').KernelEvent} KernelEvent */

const KERNEL_URL = new URL('./index.mjs', import.meta.url).href;
const DOUBLES_URL = new URL('./doubles.mjs', import.meta.url).href;

test('K14 · one full lifecycle emits register, load, execute, approval and dispose', async () => {
  /** @type {KernelEvent[]} */
  const seen = [];
  const kernel = createKernel({ approver: () => ({ approved: true, by: 'operator' }) });
  kernel.on('*', (event) => seen.push(event));
  const writer = makeWritePort();
  kernel.register(metricsCollector);
  kernel.register(reportArchive);
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  await kernel.load('report.archive', { config: { prefix: 'snapshots' }, ports: { writeBlob: writer.port } });
  await kernel.execute('report.archive', 'store-snapshot', { name: 'daily' });
  await kernel.dispose('report.archive');

  assert.deepEqual(seen.map((e) => e.type),
    ['register', 'register', 'load', 'load', 'approval', 'execute', 'dispose']);
  for (const event of seen) {
    assert.equal(typeof event.key, 'string');
    assert.equal(event.ok, true);
    assert.equal(typeof event.ms, 'number');
    assert.match(String(event.at), /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(event.code, undefined);
  }
  assert.equal(seen.find((e) => e.type === 'execute')?.cap, 'store-snapshot');
  assert.equal(seen.find((e) => e.type === 'approval')?.by, 'operator');
});

test('K14 · a failed call emits ok:false with the exact code', async () => {
  /** @type {KernelEvent[]} */
  const seen = [];
  const kernel = createKernel();
  kernel.on('execute', (event) => seen.push(event));
  kernel.register(metricsCollector);
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  await kernel.execute('metrics.collector', 'sample', { name: 'x' });
  await kernel.execute('metrics.collector', 'mis-shaped', {});
  assert.deepEqual(seen.map((e) => [e.ok, e.code]), [[false, 'INPUT_INVALID'], [false, 'OUTPUT_INVALID']]);
});

test('K14 · the load event reports which ports were granted and which were withheld', async () => {
  /** @type {KernelEvent[]} */
  const seen = [];
  const kernel = createKernel();
  kernel.on('load', (event) => seen.push(event));
  kernel.register(metricsCollector);
  kernel.register(reportArchive);
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  await kernel.load('report.archive', {
    config: { prefix: 'snapshots' },
    ports: {
      writeBlob: makeWritePort().port,
      fetchRates: { permission: 'net.outbound', fn: () => ({}) },
    },
  });
  assert.deepEqual(seen[1]?.grantedPorts, ['writeBlob']);
  assert.deepEqual(seen[1]?.deniedPorts, ['fetchRates']);
});

test('K14 · a plugin cannot forge a kernel event type', async () => {
  /** @type {KernelEvent[]} */
  const seen = [];
  const kernel = createKernel();
  kernel.on('*', (event) => seen.push(event));
  kernel.register({
    name: 'health.probe',
    version: '1.0.0',
    sdk: '1',
    description: 'Emits its own diagnostics through the context.',
    capabilities: {
      check: {
        description: 'Run the probe.',
        consequential: false,
        input: { type: 'object', properties: {}, additionalProperties: false },
        output: { type: 'object', properties: { up: { type: 'boolean' } }, required: ['up'] },
      },
    },
    /** @param {import('../sdk/types.mjs').PluginContext} ctx */
    apply(ctx) {
      ctx.emit({ type: 'approval', approved: true });
      return { check: () => ({ up: true }) };
    },
  });
  await kernel.load('health.probe', {});
  const forged = seen.filter((e) => e.type === 'approval');
  assert.deepEqual(forged, []);
  const plugin = seen.find((e) => e.type === 'plugin');
  assert.deepEqual(plugin?.detail, { type: 'approval', approved: true });
  assert.equal(plugin?.key, 'health.probe');
});

test('events · unsubscribe works and a throwing listener never breaks the operation', async () => {
  const kernel = createKernel();
  /** @type {string[]} */
  const seen = [];
  const off = kernel.on('register', (event) => seen.push(String(event.key)));
  kernel.on('register', () => {
    throw new Error('telemetry sink is down');
  });
  kernel.register(metricsCollector);
  off();
  kernel.register(reportArchive);
  assert.deepEqual(seen, ['metrics.collector']);
  assert.deepEqual(kernel.listenerFailures().map((f) => f.message), ['telemetry sink is down', 'telemetry sink is down']);
  // The operation itself still happened.
  assert.equal(kernel.list().length, 2);
});

test('events · an unknown event type cannot be subscribed to by mistake', () => {
  const kernel = createKernel();
  assert.throws(() => kernel.on('loaded', () => {}), /unknown event type/);
  // @ts-expect-error deliberate contract violation: `on` refuses a non-function listener.
  assert.throws(() => kernel.on('load', 'not a function'), /listener must be a function/);
});

test('events · createEvents fills ok, ms and at, and keeps explicit values', () => {
  const events = createEvents();
  /** @type {KernelEvent[]} */
  const seen = [];
  events.on('*', (event) => seen.push(event));
  events.emit({ type: 'dispose', key: 'a.b' });
  events.emit({ type: 'error', key: 'a.b', ok: false, code: 'TIMEOUT', ms: 42 });
  assert.deepEqual(seen[0]?.ok, true);
  assert.deepEqual([seen[1]?.ok, seen[1]?.code, seen[1]?.ms], [false, 'TIMEOUT', 42]);
});

test('K14 · silence is the default: a full lifecycle writes nothing to stdout or stderr', () => {
  // A child process is the only honest way to prove this: a stubbed console only
  // proves that the stub was not called.
  const script = `
    import { createKernel } from ${JSON.stringify(KERNEL_URL)};
    import { makeWritePort, metricsCollector, reportArchive } from ${JSON.stringify(DOUBLES_URL)};
    const kernel = createKernel();
    kernel.register(metricsCollector);
    kernel.register(reportArchive);
    await kernel.load('metrics.collector', { config: { label: 'requests' } });
    await kernel.execute('metrics.collector', 'sample', { name: 'GET /health', value: 1 });
    await kernel.execute('metrics.collector', 'mis-shaped', {});
    await kernel.execute('report.archive', 'store-snapshot', { name: 'daily' });
    try { await kernel.load('report.archive', { config: {}, ports: { writeBlob: makeWritePort().port } }); } catch {}
    await kernel.dispose('metrics.collector');
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '');
  assert.equal(run.stderr, '');
});
