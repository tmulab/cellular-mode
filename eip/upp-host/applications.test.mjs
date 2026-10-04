// U30/U32 — registering an application: a pinned identity, and nothing executable.
//
// Every refusal here is asserted as a refusal BEFORE contact: the registry is handed a
// `fetch` that records every call, so "nothing was contacted" is a count of zero rather
// than a message. The happy paths run against the real fixture app on a real socket; the
// state machine lives in `app-supervision.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '../kernel/index.mjs';
import { UPP_CODES } from '../upp/index.mjs';
import { createApplicationRegistry } from './applications.mjs';
import { uppPluginManifest } from './adapter.mjs';
import { healthUrlOf } from './app-health.mjs';
import { APP_ID, appManifest, withApplicationConfig } from './fixtures/harness.mjs';

/** A `fetch` that answers nothing and counts every attempt: the only honest way to assert
 * that a refusal cost zero requests. @returns {{ calls: string[], impl: typeof fetch }} */
function recordingFetch() {
  /** @type {string[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const impl = async (input) => {
    calls.push(String(input));
    return new Response('{"status":"ok"}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, impl };
}

test('applications · an external application is authorised from the operator file alone', async () => {
  const harness = await withApplicationConfig({ baseUrl: 'http://127.0.0.1:4100' });
  try {
    const authorized = await harness.authorize();
    assert.ok(authorized.ok, authorized.ok ? '' : authorized.error.message);
    assert.equal(authorized.value.supervision, 'external');
    const registry = createApplicationRegistry();
    const registered = registry.register(authorized.value);
    assert.ok(registered.ok);
    assert.deepEqual(registry.describe(), [{
      id: APP_ID,
      kind: 'application',
      supervision: 'external',
      state: 'registered',
      baseUrl: 'http://127.0.0.1:4100',
      routes: ['/'],
      auth: 'none-local',
      restarts: 0,
    }], 'registered is a state of its own: it is not "up"');
    // The public description carries no command, no cwd and no environment: an operator's
    // authorisation is not part of the API.
    for (const key of ['command', 'cwd', 'env', 'manifestSha256', 'entry']) {
      assert.equal(key in /** @type {Record<string, unknown>} */ (registry.describe()[0] ?? {}), false, key);
    }
  } finally {
    await harness.cleanup();
  }
});

test('applications · an id absent from the operator file is never started and never contacted', async () => {
  const harness = await withApplicationConfig({ baseUrl: 'http://127.0.0.1:4100' });
  try {
    const authorized = await harness.authorize('other.app');
    assert.equal(authorized.ok, false);
    if (authorized.ok) return;
    assert.equal(authorized.error.code, UPP_CODES.CAPABILITY_NOT_AUTHORIZED);
    assert.match(authorized.error.message, /never started and never contacted/);
    // And a registry asked about it refuses too, with nothing probed.
    const probe = recordingFetch();
    const registry = createApplicationRegistry({ fetchImpl: probe.impl });
    const started = await registry.start('other.app');
    assert.equal(started.ok, false);
    assert.deepEqual(probe.calls, []);
  } finally {
    await harness.cleanup();
  }
});

test('applications · a non-loopback baseUrl without allowRemote is refused, nothing contacted', async () => {
  const baseUrl = 'http://app.example:8080';
  const harness = await withApplicationConfig({ baseUrl, manifest: appManifest(baseUrl) });
  try {
    const authorized = await harness.authorize();
    assert.ok(authorized.ok, 'the operator file itself is valid — the refusal is the registry`s');
    if (!authorized.ok) return;
    const probe = recordingFetch();
    const registry = createApplicationRegistry({ fetchImpl: probe.impl });
    const registered = registry.register(authorized.value);
    assert.equal(registered.ok, false);
    if (registered.ok) return;
    assert.equal(registered.error.code, UPP_CODES.CAPABILITY_NOT_AUTHORIZED);
    assert.match(registered.error.message, /allowRemote:true/);
    assert.deepEqual(probe.calls, [], 'a refused application is not probed');
    assert.deepEqual(registry.ids(), []);
  } finally {
    await harness.cleanup();
  }
});

test('applications · the same baseUrl is accepted once the operator allows it explicitly', async () => {
  const baseUrl = 'http://app.example:8080';
  const harness = await withApplicationConfig({
    baseUrl, manifest: appManifest(baseUrl), entry: { allowRemote: true },
  });
  try {
    const authorized = await harness.authorize();
    assert.ok(authorized.ok);
    if (!authorized.ok) return;
    const registry = createApplicationRegistry();
    assert.equal(registry.register(authorized.value).ok, true);
    assert.deepEqual(registry.ids(), [APP_ID]);
  } finally {
    await harness.cleanup();
  }
});

test('applications · a capability manifest is never supervised as an application', async () => {
  const baseUrl = 'http://127.0.0.1:4100';
  const harness = await withApplicationConfig({
    baseUrl,
    manifest: {
      ...appManifest(baseUrl),
      type: 'capability',
      application: undefined,
      capabilities: {
        'count-words': { description: 'd', consequential: false, input: {}, output: {} },
      },
    },
  });
  try {
    const authorized = await harness.authorize();
    assert.equal(authorized.ok, false, 'the authorisation itself refuses the wrong type');
    if (authorized.ok) return;
    assert.match(authorized.error.message, /type "capability"/);
  } finally {
    await harness.cleanup();
  }
});

test('applications · U30 an application gets no kernel service: the adapter refuses it', async () => {
  const baseUrl = 'http://127.0.0.1:4100';
  const kernel = createKernel();
  const manifest = appManifest(baseUrl);
  assert.throws(() => uppPluginManifest({
    id: APP_ID,
    runtime: 'http',
    manifest,
    digest: 'x',
    capabilities: [],
    protocolVersion: () => '1.0',
    state: () => 'ready',
    execute: async () => ({ ok: true, value: null }),
    health: async () => ({ ok: true, value: null }),
    shutdown: async () => undefined,
  }), /registered and supervised, never loaded into the kernel/);
  // And the kernel knows nothing about it: no key, no manifest, no service.
  assert.deepEqual(kernel.list().filter((entry) => entry.name === APP_ID), []);
  assert.equal(kernel.isLoaded(APP_ID), false);
});

test('applications · a health URL may never leave the application origin', () => {
  const base = 'http://127.0.0.1:4100';
  const resolved = healthUrlOf(base, '/healthz');
  assert.ok(resolved.ok);
  assert.equal(resolved.ok ? resolved.url : '', 'http://127.0.0.1:4100/healthz');
  for (const healthPath of ['//evil.example/healthz', 'http://evil.example/h', '/a?b', 'healthz']) {
    const bad = healthUrlOf(base, healthPath);
    assert.equal(bad.ok, false, healthPath);
  }
});
