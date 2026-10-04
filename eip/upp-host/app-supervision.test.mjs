// The supervision state machine, against a REAL application process on a REAL socket.
//
// registered -> starting -> healthy | unhealthy -> stopped. Every transition below is proved
// by an observable fact: a port that answers, a process that is gone, a restart counter that
// stops at one. A mock would prove that the mock agrees with itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { APPLICATION_STATES, MAX_RESTARTS, createApplicationRegistry } from './applications.mjs';
import { APP_ID, APP_PATH, appManifest, freePort, withApplicationConfig } from './fixtures/harness.mjs';

/** Wait until `predicate` holds, or fail loudly. Polling is honest here: process exit and a
 * listening socket are events this test does not own.
 * @param {() => boolean} predicate @param {string} what @param {number} [timeoutMs] */
async function until(predicate, what, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => { setTimeout(resolve, 25); });
  }
  assert.fail(`timed out waiting for ${what}`);
}

/** A managed application, authorised and registered. @param {{ restart?: boolean }} [options] */
async function managed(options = {}) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const harness = await withApplicationConfig({
    baseUrl,
    manifest: appManifest(baseUrl),
    entry: {
      supervision: 'managed',
      command: [process.execPath, APP_PATH, '--port', String(port)],
      timeouts: { startupMs: 10_000, requestMs: 2000, shutdownMs: 800 },
      ...options,
    },
  });
  const authorized = await harness.authorize();
  if (!authorized.ok) {
    await harness.cleanup();
    assert.fail(`the fixture application was not authorised: ${authorized.error.message}`);
  }
  /** @type {Array<Record<string, unknown>>} */
  const events = [];
  const registry = createApplicationRegistry({ onEvent: (event) => events.push(event) });
  const registered = registry.register(authorized.value);
  assert.ok(registered.ok, registered.ok ? '' : registered.error.message);
  return { baseUrl, registry, events, harness, record: registered.ok ? registered.value : null };
}

test('applications · the declared states are the whole lifecycle, in order', () => {
  assert.deepEqual([...APPLICATION_STATES], ['registered', 'starting', 'healthy', 'unhealthy', 'stopped']);
  assert.equal(MAX_RESTARTS, 1, 'one restart, never a loop that hides the defect');
});

test('applications · a managed application is spawned by the host and becomes healthy', async () => {
  const app = await managed();
  try {
    const started = await app.registry.start(APP_ID);
    assert.ok(started.ok, started.ok ? '' : started.error.message);
    const record = app.registry.get(APP_ID);
    assert.equal(record?.state, 'healthy');
    assert.equal(typeof record?.pid, 'number');
    // The app is a real server: its own route answers its own HTML, from its own process.
    const page = await fetch(`${app.baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /independently executed app/);
    // The states it passed through are recorded, in order.
    assert.deepEqual(app.events.map((event) => event.state).filter((state) => state !== undefined),
      ['starting', 'healthy']);
  } finally {
    await app.registry.stopAll();
    await app.harness.cleanup();
  }
});

test('applications · healthy -> the process dies -> unhealthy, and the host says why', async () => {
  const app = await managed();
  try {
    assert.equal((await app.registry.start(APP_ID)).ok, true);
    const pid = app.registry.get(APP_ID)?.pid ?? 0;
    assert.ok(pid > 0);
    process.kill(pid);
    await until(() => app.registry.get(APP_ID)?.state === 'unhealthy', 'the exit to be noticed');
    assert.match(String(app.registry.get(APP_ID)?.detail), /exited/);
    assert.equal(app.registry.get(APP_ID)?.pid, null);
    // A probe after the death agrees — and it agrees for a reason the host can report.
    const checked = await app.registry.check(APP_ID);
    assert.equal(checked.ok, false);
    if (checked.ok) return;
    assert.match(checked.error.message, /unreachable|HTTP/);
    assert.equal(app.registry.get(APP_ID)?.state, 'unhealthy');
  } finally {
    await app.registry.stopAll();
    await app.harness.cleanup();
  }
});

test('applications · exactly ONE restart is attempted, and a second exit is terminal', async () => {
  const app = await managed({ restart: true });
  try {
    assert.equal((await app.registry.start(APP_ID)).ok, true);
    const first = app.registry.get(APP_ID)?.pid ?? 0;
    process.kill(first);
    await until(() => (app.registry.get(APP_ID)?.restarts ?? 0) === 1, 'the single restart');
    await until(() => (app.registry.get(APP_ID)?.pid ?? 0) > 0, 'the replacement process');
    const second = app.registry.get(APP_ID)?.pid ?? 0;
    assert.notEqual(second, first, 'a restart is a new process, not a revived one');
    process.kill(second);
    await until(() => app.registry.get(APP_ID)?.state === 'unhealthy', 'the terminal state');
    assert.equal(app.registry.get(APP_ID)?.restarts, MAX_RESTARTS, 'no second restart, ever');
  } finally {
    await app.registry.stopAll();
    await app.harness.cleanup();
  }
});

test('applications · stop() ends a managed process and leaves no residue', async () => {
  const app = await managed();
  try {
    assert.equal((await app.registry.start(APP_ID)).ok, true);
    const pid = app.registry.get(APP_ID)?.pid ?? 0;
    await app.registry.stop(APP_ID);
    assert.equal(app.registry.get(APP_ID)?.state, 'stopped');
    assert.equal(app.registry.get(APP_ID)?.pid, null);
    assert.throws(() => process.kill(pid, 0), /ESRCH/, 'the child is gone, not orphaned');
    await assert.rejects(fetch(`${app.baseUrl}/healthz`), 'and its port answers nothing');
    assert.equal(app.registry.get(APP_ID)?.restarts, 0, 'a stop the host asked for is not a failure');
  } finally {
    await app.harness.cleanup();
  }
});

test('applications · an EXTERNAL application is probed, never spawned', async () => {
  // "External" means: somebody else deployed it. The host is given no command at all, so
  // there is nothing it could start even if it wanted to.
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const harness = await withApplicationConfig({
    baseUrl,
    manifest: appManifest(baseUrl),
    entry: { supervision: 'external', timeouts: { startupMs: 600, requestMs: 300, shutdownMs: 100 } },
  });
  try {
    const authorized = await harness.authorize();
    assert.ok(authorized.ok);
    if (!authorized.ok) return;
    assert.equal(authorized.value.entry.command, undefined);
    const registry = createApplicationRegistry();
    assert.equal(registry.register(authorized.value).ok, true);
    const started = await registry.start(APP_ID);
    assert.equal(started.ok, false, 'nothing is listening, and the host did not invent a process');
    assert.equal(registry.get(APP_ID)?.state, 'unhealthy');
    assert.equal(registry.get(APP_ID)?.pid, null);
    await registry.stop(APP_ID);
    assert.match(String(registry.get(APP_ID)?.detail), /no longer watched/,
      'the host stops watching an external app; it does not stop it');
  } finally {
    await harness.cleanup();
  }
});
