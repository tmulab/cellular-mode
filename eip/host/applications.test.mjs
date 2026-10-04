// U31 — registering an application changes nothing on the host API, and the app is a CLIENT.
//
// Two claims, both of them about the seam rather than about the registry:
//   1. the published contract does not move: `ROUTE_TABLE` is the same three routes, no new
//      path exists, `applications` is an OPTIONAL additive key, and a host with no
//      application answers byte-for-byte what it answered before;
//   2. an application reaches the system the way any client does — over `/api/v1`, from its
//      own server — and the host's authorization boundaries are unchanged: a consequential
//      capability with no approver answers `APPROVAL_REQUIRED`, to the app as to anyone.
//
// The app here is the real fixture process, and the call it makes is made by IT, not by the
// test: a test that called the API itself would prove nothing about the direction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { check } from '../sdk/index.mjs';
import { createApplicationRegistry } from '../upp-host/applications.mjs';
import { APP_ID, APP_PATH, appManifest, freePort, withApplicationConfig } from '../upp-host/fixtures/harness.mjs';
import { ROUTE_TABLE } from './router.mjs';
import { createHost } from './index.mjs';
import { startHost } from './fixture.mjs';
import textStats from '../plugins/text-stats/index.mjs';

const DOC = JSON.parse(await readFile(fileURLToPath(new URL('../../api/openapi.json', import.meta.url)), 'utf8'));
const SAVE_REPORT = '/api/v1/plugins/text.report/capabilities/save-report';

test('U31 the route table is unchanged by the existence of application plugins', () => {
  assert.deepEqual(ROUTE_TABLE.map((route) => `${route.method} ${route.template}`), [
    'GET /api/v1/health',
    'GET /api/v1/plugins',
    'POST /api/v1/plugins/{key}/capabilities/{cap}',
  ], 'an application adds no route: it is its own server');
  const value = DOC.components.schemas.PluginListResult.properties.value;
  assert.deepEqual(value.required, ['plugins'], '`applications` is additive, never required');
  assert.ok(value.properties.applications !== undefined, 'and it is documented where it appears');
});

test('U31 a host with no applications answers exactly as before', async () => {
  const h = await startHost();
  try {
    const answer = await h.call('/api/v1/plugins');
    const body = /** @type {{ value: Record<string, unknown> }} */ (answer.body);
    assert.deepEqual(Object.keys(body.value), ['plugins'], 'no empty key appears out of nowhere');
    assert.deepEqual(check(DOC.components.schemas.PluginListResult, answer.body).errors, []);
  } finally {
    await h.cleanup();
  }
});

test('U31 a registered application is listed beside the plugins, and validates', async () => {
  const baseUrl = `http://127.0.0.1:${await freePort()}`;
  const harness = await withApplicationConfig({ baseUrl, manifest: appManifest(baseUrl) });
  const authorized = await harness.authorize();
  assert.ok(authorized.ok, authorized.ok ? '' : authorized.error.message);
  if (!authorized.ok) return;
  const registry = createApplicationRegistry();
  assert.equal(registry.register(authorized.value).ok, true);
  const host = await createHost({ plugins: [textStats], applications: registry.describe });
  const { url } = await host.listen(0);
  try {
    const response = await fetch(`${url}/api/v1/plugins`);
    const body = /** @type {{ value: { plugins: unknown[], applications: unknown[] } }} */ (await response.json());
    assert.deepEqual(body.value.plugins.map((p) => /** @type {{ name: string }} */ (p).name), ['text.stats']);
    assert.deepEqual(body.value.applications, [{
      id: APP_ID,
      kind: 'application',
      supervision: 'external',
      state: 'registered',
      baseUrl,
      routes: ['/'],
      auth: 'none-local',
      restarts: 0,
    }]);
    // The documented schema is the one the real response is measured against.
    assert.deepEqual(check(DOC.components.schemas.ApplicationDescription, body.value.applications[0]).errors, []);
    assert.deepEqual(check(DOC.components.schemas.PluginListResult, body).errors, []);
    // No route was added for it: the app is reached directly, never proxied by the host.
    assert.equal((await fetch(`${url}/api/v1/applications`)).status, 404);
    assert.equal((await fetch(`${url}/api/v1/plugins/${APP_ID}/capabilities/anything`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"input":{}}',
    })).status, 404, 'an application provides no capability through the kernel');
  } finally {
    await host.close();
    await harness.cleanup();
  }
});

test('U31 the application calls the API as a client, and approval is still required', async () => {
  // No approver: every consequential capability must refuse, including when the caller is a
  // registered application plugin. Registration grants identity, never authority.
  const h = await startHost();
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const harness = await withApplicationConfig({
    baseUrl,
    manifest: appManifest(baseUrl),
    entry: {
      supervision: 'managed',
      command: [process.execPath, APP_PATH, '--port', String(port)],
      env: ['UPP_HOST_API', 'UPP_APP_CALL'],
      timeouts: { startupMs: 10_000, requestMs: 2000, shutdownMs: 800 },
    },
  });
  const authorized = await harness.authorize();
  assert.ok(authorized.ok);
  if (!authorized.ok) return;
  const registry = createApplicationRegistry({
    env: { ...process.env, UPP_HOST_API: h.url, UPP_APP_CALL: SAVE_REPORT },
  });
  assert.equal(registry.register(authorized.value).ok, true);
  try {
    const started = await registry.start(APP_ID);
    assert.ok(started.ok, started.ok ? '' : started.error.message);
    // (a) the app read the system at startup, server-side, over the public API.
    const seen = /** @type {{ reached: boolean, plugins: string[], detail: string }} */ (
      await (await fetch(`${baseUrl}/system`)).json());
    assert.equal(seen.reached, true, `the app did not reach the host API: ${seen.detail}`);
    assert.deepEqual([...seen.plugins].sort(), ['text.report', 'text.stats']);
    // (b) the app asked for a consequential capability. The host refused — fail closed.
    const called = /** @type {{ status: number, body: { error: { code: string } } }} */ (
      await (await fetch(`${baseUrl}/call`)).json());
    assert.equal(called.status, 403);
    assert.equal(called.body.error.code, 'APPROVAL_REQUIRED');
    assert.deepEqual(h.approvals, [], 'there was no approver to ask');
  } finally {
    await registry.stopAll();
    await harness.cleanup();
    await h.cleanup();
  }
});
