// The process transport, against a real child: the happy lifecycle and what it costs.
//
// Proves U11 (spawn -> initialize -> capabilities -> execute -> shutdown -> exit, child
// gone), U12 (argv only, minimal env, asserted on what the CHILD reports), U17 (deadlineMs
// reaches the plugin), U19 (startup and shutdown deadlines leave no residue) and the stderr
// half of U14/U26 (a line on stderr changes nothing and arrives as a diagnostic).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startProcessPlugin } from './process-transport.mjs';
import { authorizeFixture } from './fixtures/harness.mjs';

/** @type {(pid: number | null) => boolean} */
function alive(pid) {
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** @param {{ entry?: Record<string, unknown>, config?: Record<string, unknown> }} [options] */
async function start(options = {}) {
  const { authorization, cleanup } = await authorizeFixture(
    options.entry === undefined ? {} : { entry: options.entry });
  /** @type {Array<{ type: string, detail: Record<string, unknown> }>} */
  const events = [];
  const started = await startProcessPlugin({
    authorization, config: options.config ?? {}, onEvent: (event) => events.push(event),
  });
  return { started, events, cleanup, authorization };
}

test('process · the full lifecycle, and the child is gone afterwards', async () => {
  const { started, cleanup } = await start();
  try {
    assert.equal(started.ok, true, started.ok ? '' : started.error.message);
    if (!started.ok) return;
    const plugin = started.value;
    assert.equal(plugin.protocolVersion(), '1.0');
    assert.equal(plugin.state(), 'ready');
    assert.deepEqual([...plugin.capabilities].sort(),
      ['badout', 'boom', 'crash', 'destroy', 'echo', 'garbage', 'oversize', 'slow']);

    const health = await plugin.health();
    assert.deepEqual(health, { ok: true, value: { status: 'ok' } });

    const answer = await plugin.execute('echo', { text: 'hello' });
    assert.equal(answer.ok, true);
    assert.equal(answer.ok && /** @type {Record<string, unknown>} */ (answer.value).text, 'hello');

    const pid = plugin.pid();
    await plugin.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(alive(pid), false, 'no orphan process survives shutdown');
    assert.equal(plugin.state(), 'stopped');
  } finally {
    await cleanup();
  }
});

test('process · the child sees a minimal env and no host canary', async () => {
  process.env.UPP_TEST_CANARY = 'leaked';
  const { started, cleanup } = await start();
  try {
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const answer = await started.value.execute('echo', { text: 'env' });
    assert.equal(answer.ok, true);
    assert.equal(answer.ok && /** @type {Record<string, unknown>} */ (answer.value).sawEnvCanary, false,
      'a host variable the operator did not name is invisible to the plugin');
    await started.value.shutdown();
  } finally {
    delete process.env.UPP_TEST_CANARY;
    await cleanup();
  }
});

test('process · an operator-named env variable DOES reach the child', async () => {
  process.env.UPP_TEST_CANARY = 'authorised';
  const { started, cleanup } = await start({ entry: { env: ['UPP_TEST_CANARY'] } });
  try {
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const answer = await started.value.execute('echo', { text: 'env' });
    assert.equal(answer.ok && /** @type {Record<string, unknown>} */ (answer.value).sawEnvCanary, true);
    await started.value.shutdown();
  } finally {
    delete process.env.UPP_TEST_CANARY;
    await cleanup();
  }
});

test('process · the deadline the host enforces is the deadline the plugin is told', async () => {
  const { started, cleanup } = await start({ entry: { timeouts: { requestMs: 1234 } } });
  try {
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const fromConfig = await started.value.execute('echo', { text: 'a' });
    assert.equal(fromConfig.ok && /** @type {Record<string, unknown>} */ (fromConfig.value).deadlineMs, 1234);
    const explicit = await started.value.execute('echo', { text: 'a' }, { deadlineMs: 777 });
    assert.equal(explicit.ok && /** @type {Record<string, unknown>} */ (explicit.value).deadlineMs, 777);
    await started.value.shutdown();
  } finally {
    await cleanup();
  }
});

test('process · stderr is a diagnostic event and never an answer', async () => {
  const { started, events, cleanup } = await start({ config: { stderrNoise: true } });
  try {
    assert.equal(started.ok, true, 'a plugin printing a forged frame on stderr still initialises');
    if (!started.ok) return;
    const answer = await started.value.execute('echo', { text: 'after noise' });
    assert.equal(answer.ok && /** @type {Record<string, unknown>} */ (answer.value).text, 'after noise',
      'the forged stderr frame did not resolve this call');
    await started.value.shutdown();
    const lines = events.filter((e) => e.type === 'plugin' && e.detail.stream === 'stderr')
      .map((e) => String(e.detail.line));
    assert.ok(lines.includes('starting up'), `expected the captured stderr, got ${JSON.stringify(lines)}`);
    assert.ok(lines.some((line) => line.includes('forged')), 'stderr is captured verbatim, not parsed');
  } finally {
    await cleanup();
  }
});

test('process · a plugin that never answers initialize is not registered', async () => {
  const { started, cleanup } = await start({
    config: { silentInit: true }, entry: { timeouts: { startupMs: 300, requestMs: 500, shutdownMs: 300 } },
  });
  try {
    assert.equal(started.ok, false, 'a half-registered key is worse than no plugin');
    assert.equal(!started.ok && started.error.code, -32004);
    assert.equal(!started.ok && started.error.data.code, 'TIMEOUT');
  } finally {
    await cleanup();
  }
});

test('process · a plugin that ignores shutdown is terminated anyway', async () => {
  const { started, cleanup } = await start({
    config: { ignoreShutdown: true }, entry: { timeouts: { startupMs: 8000, requestMs: 400, shutdownMs: 200 } },
  });
  try {
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const pid = started.value.pid();
    await started.value.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(alive(pid), false, 'the shutdown deadline is the host’s, not the plugin’s');
  } finally {
    await cleanup();
  }
});

test('process · a manifest that differs from the pin is refused at initialize', async () => {
  const { started, cleanup } = await start({ config: { wrongManifest: true } });
  try {
    assert.equal(started.ok, false);
    assert.match(!started.ok ? started.error.message : '', /does not match the pinned one/);
  } finally {
    await cleanup();
  }
});
