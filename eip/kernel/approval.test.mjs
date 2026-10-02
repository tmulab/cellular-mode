// K10 — the approval gate. A consequential act needs a decision, and the decision
// belongs to a human the HOST supplies. Split out of execute.test.mjs to keep both
// files inside the 200-line budget: this one is about CONSENT, that one about the
// contract, the deadline and containment.
import test from 'node:test';
import assert from 'node:assert/strict';
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

test('K10 · approval — no approver is a closed door, and the body never runs', async () => {
  const { kernel, writer } = await loaded();
  const result = await kernel.execute('report.archive', 'store-snapshot', { name: 'daily' });
  assert.equal(result.ok, false);
  assert.equal(errorOf(result).code, 'APPROVAL_REQUIRED');
  assert.match(errorOf(result).message, /consequential/);
  assert.deepEqual(writer.written, []); // the side effect did NOT happen
});

test('K10 · approval — a granted decision lets the effect through, once', async () => {
  /** @type {unknown[]} */
  const seen = [];
  const { kernel, writer } = await loaded((request) => {
    seen.push(request);
    return { approved: true, by: 'operator', reason: 'nightly window' };
  });
  const result = await kernel.execute('report.archive', 'store-snapshot', { name: 'daily' },
    { approval: { ticket: 'OPS-71' } });
  assert.deepEqual(result, { ok: true, value: { path: 'snapshots/daily.json', total: 0 } });
  assert.deepEqual(writer.written, [{ path: 'snapshots/daily.json', body: '{"total":0}' }]);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], {
    key: 'report.archive', cap: 'store-snapshot', input: { name: 'daily' },
    consequential: true, approval: { ticket: 'OPS-71' },
  });
});

test('K10 · approval — a refusal is APPROVAL_DENIED and carries the reason', async () => {
  const { kernel, writer } = await loaded(() => ({ approved: false, by: 'operator', reason: 'outside the window' }));
  const result = await kernel.execute('report.archive', 'store-snapshot', { name: 'daily' });
  assert.equal(errorOf(result).code, 'APPROVAL_DENIED');
  assert.match(errorOf(result).message, /outside the window/);
  assert.deepEqual(writer.written, []);
});

test('K10 · approval — an approver that throws denies; it never fails open', async () => {
  const { kernel, writer } = await loaded(() => {
    throw new Error('approval service unreachable');
  });
  const result = await kernel.execute('report.archive', 'store-snapshot', { name: 'daily' });
  assert.equal(errorOf(result).code, 'APPROVAL_DENIED');
  assert.match(errorOf(result).message, /approval service unreachable/);
  assert.deepEqual(writer.written, []);
});

// DEFECT FOUND IN S2-7 and fixed here: a human decision takes time. An approver
// that asks a person — a TTY prompt, a queue, a chat message — can only answer with
// a promise, and the verdict was being read synchronously, so every interactive
// approver was silently treated as a "malformed verdict" and denied. Fail-closed is
// right, but a gate that can never open is not a gate: the host CLI's
// --approve-interactive could not exist. `decide` now AWAITS the verdict.
test('K10 · approval — an ASYNCHRONOUS approver is a real decision, not a malformed verdict', async () => {
  const { kernel, writer } = await loaded(async (/** @type {{ key: string, cap: string }} */ { key, cap }) => {
    await new Promise((resolve) => setTimeout(resolve, 5)); // a human, thinking
    return { approved: true, by: `human-at-${key}#${cap}` };
  });
  const result = await kernel.execute('report.archive', 'store-snapshot', { name: 'daily' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(writer.written.length, 1);
});

test('K10 · approval — an asynchronous refusal is APPROVAL_DENIED, never a pass', async () => {
  const { kernel, writer } = await loaded(async () => ({ approved: false, reason: 'answered no at the prompt' }));
  const result = await kernel.execute('report.archive', 'store-snapshot', { name: 'daily' });
  assert.equal(errorOf(result).code, 'APPROVAL_DENIED');
  assert.match(errorOf(result).message, /answered no at the prompt/);
  assert.deepEqual(writer.written, []);
});

test('K10 · approval — an asynchronous approver that REJECTS denies; it never fails open', async () => {
  const { kernel, writer } = await loaded(async () => {
    throw new Error('the operator closed the terminal');
  });
  const result = await kernel.execute('report.archive', 'store-snapshot', { name: 'daily' });
  assert.equal(errorOf(result).code, 'APPROVAL_DENIED');
  assert.match(errorOf(result).message, /the operator closed the terminal/);
  assert.deepEqual(writer.written, []);
});

test('K10 · approval — a malformed verdict is not consent', async () => {
  const { kernel, writer } = await loaded(() => 'yes, go ahead');
  const result = await kernel.execute('report.archive', 'store-snapshot', { name: 'daily' });
  assert.equal(errorOf(result).code, 'APPROVAL_DENIED');
  assert.match(errorOf(result).message, /malformed verdict/);
  assert.deepEqual(writer.written, []);
});
