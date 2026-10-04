// A real child process, inside the real kernel, through the real adapter.
//
// The unit tests next door each hold one thing still. This file holds nothing still, which is
// why it is the one that would catch a seam that only works in isolation: U16's TIMEOUT (the
// kernel's deadline, not the transport's), U18's CANCELLED, U20 against a live transport,
// U26's `plugin` events, and the shutdown sequence reached through `kernel.dispose`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '../kernel/index.mjs';
import { registerUppPlugin } from './adapter.mjs';
import { startProcessPlugin } from './process-transport.mjs';
import { authorizeFixture } from './fixtures/harness.mjs';

/** @param {{ approver?: import('../kernel/types.mjs').Approver, requestMs?: number }} [options] */
async function compose(options = {}) {
  const { authorization, cleanup } = await authorizeFixture({
    entry: { timeouts: { startupMs: 8000, requestMs: options.requestMs ?? 4000, shutdownMs: 400 } },
  });
  const started = await startProcessPlugin({ authorization });
  if (!started.ok) {
    await cleanup();
    throw new Error(`the fixture did not start: ${started.error.message}`);
  }
  const kernel = createKernel(options.approver === undefined ? {} : { approver: options.approver });
  /** @type {Array<Record<string, unknown>>} */
  const events = [];
  kernel.on('*', (event) => events.push(/** @type {Record<string, unknown>} */ (event)));
  const handle = registerUppPlugin(kernel, started.value);
  await kernel.load(handle.key);
  return { kernel, handle, plugin: started.value, events, cleanup };
}

/** @type {(events: Array<Record<string, unknown>>, prefix: string) => string[]} */
const diagnostics = (events, prefix) => events
  .filter((e) => e.type === 'plugin')
  .map((e) => String(/** @type {Record<string, unknown>} */ (e.detail ?? {}).line ?? ''))
  .filter((line) => line.startsWith(prefix));

test('end to end · a capability answers through the kernel, and dispose stops the child', async () => {
  const { kernel, handle, plugin, events, cleanup } = await compose();
  try {
    const answer = await kernel.execute(handle.key, 'echo', { text: 'through the kernel' });
    assert.equal(answer.ok, true);
    assert.equal(answer.ok && /** @type {Record<string, unknown>} */ (answer.value).text, 'through the kernel');
    const executed = events.find((e) => e.type === 'execute');
    assert.equal(executed?.key, handle.key);
    assert.equal(executed?.ok, true);
    assert.equal(typeof executed?.ms, 'number');

    const pid = plugin.pid();
    await kernel.dispose(handle.key);
    await new Promise((resolve) => { setTimeout(resolve, 200); });
    assert.equal(kernel.isLoaded(handle.key), false);
    assert.equal(plugin.state(), 'stopped');
    assert.equal(processGone(pid), true, 'dispose is the inverse of load, all the way down');
  } finally {
    await cleanup();
  }
});

test('end to end · the kernel deadline is TIMEOUT, never CANCELLED, and retires the id', async () => {
  const { kernel, handle, plugin, events, cleanup } = await compose();
  try {
    const answer = await kernel.execute(handle.key, 'slow', {}, { timeoutMs: 250 });
    assert.equal(answer.ok, false);
    assert.equal(!answer.ok && answer.error.code, 'TIMEOUT',
      'the host does not wait on a peer’s goodwill, and does not call it a cancellation');
    await new Promise((resolve) => { setTimeout(resolve, 150); });
    assert.equal(diagnostics(events, 'cancel:').length, 1, 'upp.cancel went out, best effort');
    assert.equal(plugin.counters()?.discardedLate, 0, 'nothing late arrived for the retired id');
    await kernel.dispose(handle.key);
  } finally {
    await cleanup();
  }
});

test('end to end · an aborted call is CANCELLED and the notice reaches the plugin', async () => {
  const { kernel, handle, events, cleanup } = await compose();
  try {
    const controller = new AbortController();
    const call = kernel.execute(handle.key, 'slow', {}, { signal: controller.signal });
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    controller.abort();
    const answer = await call;
    assert.equal(!answer.ok && answer.error.code, 'CANCELLED');
    await new Promise((resolve) => { setTimeout(resolve, 150); });
    assert.equal(diagnostics(events, 'cancel:').length, 1);
    await kernel.dispose(handle.key);
  } finally {
    await cleanup();
  }
});

test('end to end · a consequential capability with no approver writes nothing', async () => {
  const { kernel, handle, plugin, cleanup } = await compose();
  try {
    const before = plugin.counters()?.sent ?? -1;
    const refused = await kernel.execute(handle.key, 'destroy', {});
    assert.equal(!refused.ok && refused.error.code, 'APPROVAL_REQUIRED');
    assert.equal(plugin.counters()?.sent, before, 'zero bytes crossed the transport');
    await kernel.dispose(handle.key);
  } finally {
    await cleanup();
  }
});

test('end to end · with an approver, the same capability runs', async () => {
  const { kernel, handle, cleanup } = await compose({ approver: () => ({ approved: true, by: 'operator' }) });
  try {
    const answer = await kernel.execute(handle.key, 'destroy', {});
    assert.equal(answer.ok, true, !answer.ok ? answer.error.message : '');
    await kernel.dispose(handle.key);
  } finally {
    await cleanup();
  }
});

test('end to end · a plugin output that breaks the contract is OUTPUT_INVALID', async () => {
  const { kernel, handle, cleanup } = await compose();
  try {
    const answer = await kernel.execute(handle.key, 'badout', {});
    assert.equal(!answer.ok && answer.error.code, 'OUTPUT_INVALID',
      'the kernel checks the far side’s answer exactly as it checks a local one');
    await kernel.dispose(handle.key);
  } finally {
    await cleanup();
  }
});

/** @param {number | null} pid @returns {boolean} */
function processGone(pid) {
  if (pid === null) return true;
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
}
