// Every failure path of the process transport, reached on purpose.
//
// U13 (outbound and inbound caps), U14 (a malformed frame), U15 (a crash, and exactly one
// restart), U16 (a host-side deadline, with the id retired), U18 (cancel reaches the plugin
// and the caller does not depend on it) and U22's zero-bytes claim are decided here. Each
// case uses the fixture capability named after it, so a green run means the path ran.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MESSAGE_BYTES } from '../upp/index.mjs';
import { createChannel } from './channel.mjs';
import { startProcessPlugin } from './process-transport.mjs';
import { authorizeFixture, withOperatorConfig } from './fixtures/harness.mjs';
// Generous by default, tightened per test where a deadline is the SUBJECT: a load-sensitive
// default makes a correct host look broken beside a Rust compile and a JVM launch.
const FAST = { startupMs: 20_000, requestMs: 5000, shutdownMs: 2000 };

/** @param {{ entry?: Record<string, unknown> }} [options] */
async function start(options = {}) {
  const { authorization, cleanup } = await authorizeFixture({
    entry: { timeouts: FAST, ...options.entry },
  });
  /** @type {Array<{ type: string, detail: Record<string, unknown> }>} */
  const events = [];
  const started = await startProcessPlugin({ authorization, onEvent: (event) => events.push(event) });
  if (!started.ok) {
    await cleanup();
    throw new Error(`the fixture did not start: ${started.error.message}`);
  }
  return { plugin: started.value, events, cleanup };
}

/** @type {(events: Array<{ detail: Record<string, unknown> }>, prefix: string) => string[]} */
const stderrLines = (events, prefix) => events
  .map((e) => String(e.detail.line ?? ''))
  .filter((line) => line.startsWith(prefix));

test('failures · an id the operator never listed is never spawned', async () => {
  const harness = await withOperatorConfig();
  let spawned = 0;
  try {
    const authorized = await harness.authorize('text.not-listed');
    if (authorized.ok) {
      await startProcessPlugin({
        authorization: authorized.value,
        spawnChannel: (wiring) => { spawned += 1; return createChannel(wiring); },
      });
    }
    assert.equal(authorized.ok, false);
    assert.equal(spawned, 0, 'the authorisation file is not advisory');
  } finally {
    await harness.cleanup();
  }
});

test('failures · a capability absent from the pinned manifest costs zero bytes', async () => {
  const { plugin, cleanup } = await start();
  try {
    const before = plugin.counters()?.sent ?? -1;
    const answer = await plugin.execute('exfiltrate', {});
    assert.deepEqual(answer, {
      ok: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: '"fixture.node-plugin" does not declare "exfiltrate" in its pinned manifest — nothing was sent',
      },
    });
    assert.equal(plugin.counters()?.sent, before, 'nothing was written to the transport');
    await plugin.shutdown();
  } finally {
    await cleanup();
  }
});

test('failures · an outbound frame over the cap is refused with nothing written', async () => {
  const { plugin, cleanup } = await start();
  try {
    const before = plugin.counters()?.sent ?? -1;
    const answer = await plugin.execute('echo', { text: 'x'.repeat(MAX_MESSAGE_BYTES + 16) });
    assert.equal(answer.ok, false);
    assert.equal(!answer.ok && answer.error.code, 'INPUT_INVALID',
      'an oversized REQUEST is the caller’s fault, not the plugin’s');
    assert.equal(plugin.counters()?.sent, before);
    assert.equal(plugin.state(), 'ready', 'the plugin did nothing wrong and stays healthy');
    await plugin.shutdown();
  } finally {
    await cleanup();
  }
});

test('failures · a malformed line is -32700, the call fails, the plugin is unhealthy', async () => {
  const { plugin, cleanup } = await start();
  try {
    const answer = await plugin.execute('garbage', {});
    assert.equal(answer.ok, false);
    assert.equal(!answer.ok && answer.error.code, 'PLUGIN_ERROR');
    assert.equal(plugin.lastBreach()?.code, -32700);
    assert.equal(plugin.state(), 'unhealthy');
    const again = await plugin.execute('echo', { text: 'after' });
    assert.match(!again.ok ? again.error.message : '', /unhealthy and was not restarted/);
  } finally {
    await cleanup();
  }
});

test('failures · an inbound line over the cap is -32006 and the plugin is unhealthy', async () => {
  const { plugin, cleanup } = await start();
  try {
    const answer = await plugin.execute('oversize', {});
    assert.equal(answer.ok, false);
    assert.equal(!answer.ok && answer.error.code, 'PLUGIN_ERROR');
    assert.equal(plugin.lastBreach()?.code, -32006);
    assert.equal(plugin.state(), 'unhealthy');
  } finally {
    await cleanup();
  }
});

test('failures · a crash fails the pending call and does not restart by default', async () => {
  const { plugin, cleanup } = await start();
  try {
    const answer = await plugin.execute('crash', {});
    assert.equal(answer.ok, false);
    assert.equal(!answer.ok && answer.error.code, 'PLUGIN_ERROR');
    assert.match(!answer.ok ? answer.error.message : '', /exited \(code 7/);
    assert.equal(plugin.state(), 'unhealthy');
    assert.equal(plugin.restarts(), 0, 'a restart is the operator’s decision, not a default');
  } finally {
    await cleanup();
  }
});

test('failures · with restart enabled, exactly ONE restart is attempted', async () => {
  const { plugin, cleanup } = await start({ entry: { restart: true } });
  try {
    assert.equal((await plugin.execute('crash', {})).ok, false);
    const revived = await plugin.execute('echo', { text: 'back' });
    assert.equal(revived.ok, true, 'the first restart brings the plugin back');
    assert.equal(plugin.restarts(), 1);

    assert.equal((await plugin.execute('crash', {})).ok, false);
    const terminal = await plugin.execute('echo', { text: 'again' });
    assert.equal(terminal.ok, false, 'a second exit is terminal');
    assert.equal(plugin.restarts(), 1, 'a restart LOOP would hide the defect');
    await plugin.shutdown();
  } finally {
    await cleanup();
  }
});

test('failures · a plugin that never answers times out, and upp.cancel is sent', async () => {
  const { plugin, events, cleanup } = await start({ entry: { timeouts: { ...FAST, requestMs: 250 } } });
  try {
    const answer = await plugin.execute('slow', {});
    assert.equal(answer.ok, false);
    assert.equal(!answer.ok && answer.error.code, 'TIMEOUT');
    assert.equal(plugin.state(), 'ready', 'a slow answer is not a dead plugin');
    await new Promise((resolve) => setTimeout(resolve, 120));
    const cancels = stderrLines(events, 'cancel:');
    const slows = stderrLines(events, 'slow:');
    assert.equal(cancels.length, 1, `expected one cancel, saw ${JSON.stringify(cancels)}`);
    assert.deepEqual(cancels, slows.map((line) => line.replace('slow:', 'cancel:')),
      'the cancel names the id of the call that timed out');
    assert.equal(plugin.counters()?.discardedLate, 0);
    await plugin.shutdown();
  } finally {
    await cleanup();
  }
});

test('failures · an aborted call is CANCELLED even though the plugin ignores the notice', async () => {
  const { plugin, events, cleanup } = await start({ entry: { timeouts: { ...FAST, requestMs: 4000 } } });
  try {
    const controller = new AbortController();
    const pendingCall = plugin.execute('slow', {}, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.abort();
    const answer = await pendingCall;
    assert.equal(answer.ok, false);
    assert.equal(!answer.ok && answer.error.code, 'CANCELLED');
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(stderrLines(events, 'cancel:').length, 1,
      'the notice reached the plugin, which is free to ignore it');
    await plugin.shutdown();
  } finally {
    await cleanup();
  }
});

test('failures · a remote error claiming host authority is downgraded', async () => {
  const { plugin, cleanup } = await start();
  try {
    const answer = await plugin.execute('boom', {});
    assert.equal(answer.ok, false);
    assert.equal(!answer.ok && answer.error.code, 'PLUGIN_ERROR',
      'a plugin may not assert that a human decided something');
    await plugin.shutdown();
  } finally {
    await cleanup();
  }
});
