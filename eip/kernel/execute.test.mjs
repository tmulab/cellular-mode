// K11..K13 — the call path: a contract checked at both ends, a real deadline, and a
// contained plugin fault. The approval gate (K10) lives in approval.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin } from '../sdk/index.mjs';
import { createKernel } from './index.mjs';
import { makeWritePort, metricsCollector, reportArchive } from './doubles.mjs';
import { errorOf } from './assertions.mjs';

/** A kernel plus the two loaded doubles; `approver` is whatever the test needs.
 * @param {import('./types.mjs').Approver} [approver] */
async function loaded(approver) {
  const kernel = createKernel(approver === undefined ? {} : { approver });
  kernel.register(metricsCollector);
  kernel.register(reportArchive);
  const writer = makeWritePort();
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  await kernel.load('report.archive', {
    config: { prefix: 'snapshots' },
    ports: { writeBlob: writer.port },
  });
  return { kernel, writer };
}

test('a non-consequential call needs no decision and returns {ok, value}', async () => {
  const { kernel } = await loaded();
  assert.deepEqual(await kernel.execute('metrics.collector', 'sample', { name: 'GET /health', value: 1 }),
    { ok: true, value: { name: 'GET /health', count: 1, label: 'requests' } });
});

test('K11 · input — a breach of the input schema never reaches the plugin', async () => {
  const { kernel } = await loaded();
  const result = await kernel.execute('metrics.collector', 'sample', { name: '', value: 'high', extra: 1 });
  assert.equal(errorOf(result).code, 'INPUT_INVALID');
  assert.deepEqual((errorOf(result).details ?? []).map((d) => d.path).sort(), ['extra', 'name', 'value']);
});

test('K11 · input — the gate runs BEFORE the approval gate', async () => {
  let asked = 0;
  const { kernel } = await loaded(() => {
    asked += 1;
    return { approved: true, by: 'operator' };
  });
  const result = await kernel.execute('report.archive', 'store-snapshot', { wrong: true });
  assert.equal(errorOf(result).code, 'INPUT_INVALID');
  assert.equal(asked, 0, 'a human must not be asked to approve a malformed request');
});

test('K11 · output — a capability returning the wrong shape is OUTPUT_INVALID', async () => {
  const { kernel } = await loaded();
  const result = await kernel.execute('metrics.collector', 'mis-shaped', {});
  assert.equal(result.ok, false);
  assert.equal(errorOf(result).code, 'OUTPUT_INVALID');
  assert.deepEqual(errorOf(result).details, [
    { path: 'count', message: 'must be of type integer, got string' },
  ]);
});

test('K12 · cancellation — an aborted signal yields CANCELLED, before and during', async () => {
  const { kernel } = await loaded();
  const already = new AbortController();
  already.abort();
  const first = await kernel.execute('metrics.collector', 'flush-window', { delayMs: 50 }, { signal: already.signal });
  assert.equal(errorOf(first).code, 'CANCELLED');

  const during = new AbortController();
  const pending = kernel.execute('metrics.collector', 'flush-window', { delayMs: 5000 }, { signal: during.signal });
  setTimeout(() => during.abort(), 5);
  const second = await pending;
  assert.equal(errorOf(second).code, 'CANCELLED');
  assert.match(errorOf(second).message, /was cancelled/);
});

test('K12 · timeout — a deadline is TIMEOUT, told apart from CANCELLED', async () => {
  const { kernel } = await loaded();
  const result = await kernel.execute('metrics.collector', 'flush-window', { delayMs: 5000 }, { timeoutMs: 10 });
  assert.equal(result.ok, false);
  assert.equal(errorOf(result).code, 'TIMEOUT');
  assert.match(errorOf(result).message, /exceeded 10ms/);
  // A capability that finishes inside the deadline is untouched by it.
  const inTime = await kernel.execute('metrics.collector', 'flush-window', { delayMs: 0 }, { timeoutMs: 1000 });
  assert.deepEqual(inTime, { ok: true, value: { cleared: 0 } });
});

test('K12 · timeout — a kernel-wide default deadline applies when the call gives none', async () => {
  const kernel = createKernel({ defaultTimeoutMs: 10 });
  kernel.register(metricsCollector);
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  assert.equal(errorOf(await kernel.execute('metrics.collector', 'flush-window', { delayMs: 5000 })).code, 'TIMEOUT');
});

test('K13 · plugin error — the fault is contained and no stack leaks into the result', async () => {
  const kernel = createKernel();
  kernel.register(definePlugin({
    name: 'rates.converter',
    version: '1.0.0',
    sdk: '1',
    description: 'Converts amounts between currencies.',
    capabilities: {
      convert: {
        description: 'Convert one amount.',
        consequential: false,
        input: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] },
        output: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] },
      },
    },
    apply: () => ({
      convert() {
        throw new Error('rate table for 2026-10-02 is missing');
      },
    }),
  }));
  await kernel.load('rates.converter', {});
  /** @type {import('../sdk/types.mjs').KernelEvent[]} */
  const errors = [];
  kernel.on('error', (event) => errors.push(event));
  const result = await kernel.execute('rates.converter', 'convert', { amount: 10 });
  assert.equal(result.ok, false);
  assert.equal(errorOf(result).code, 'PLUGIN_ERROR');
  assert.match(errorOf(result).message, /rate table/);
  assert.equal('stack' in errorOf(result), false);
  assert.equal(JSON.stringify(result).includes('execute.mjs'), false);
  // The stack exists for diagnostics — on the event, where only the host can see it.
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]?.stack), /rates\.converter|convert/);
});

test('NOT_FOUND · a registered but unloaded key, and an unknown capability', async () => {
  const kernel = createKernel();
  kernel.register(metricsCollector);
  assert.equal(errorOf(await kernel.execute('metrics.collector', 'sample', {})).code, 'NOT_FOUND');
  await kernel.load('metrics.collector', { config: { label: 'requests' } });
  assert.equal(errorOf(await kernel.execute('metrics.collector', 'teleport', {})).code, 'NOT_FOUND');
});
