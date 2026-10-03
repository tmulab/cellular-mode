// AD27, AD31 — the adaptive reader over real HTTP, and the OPT-IN proved by comparison.
//
// Four claims: `api/openapi.json` describes exactly the capability the manifest declares, a
// real HTTP answer validates against the documented schema, a composition WITHOUT `--adaptive`
// answers 404 (which the UI renders as "no badge"), and — the one that matters most — the
// `observer.*` answers are BYTE-IDENTICAL with the flag and without it. An optional feature
// that quietly changed the data would not be optional.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, validateSchema } from '../sdk/index.mjs';
import { createHost } from '../host/index.mjs';
import {
  ADAPTIVE_KEY, OBSERVER_PLUGINS, adaptiveParts, observerComposition,
} from '../host/observer-composition.mjs';
import { createAdaptiveReadPorts } from '../host/adaptive-read-port.mjs';
import { createAdaptivePreferencesPlugin } from './adaptive-preferences/index.mjs';
import { ACTIVE_SESSION } from './adaptive-preferences-fixture.mjs';
import { demoVault } from './observer-fixture.mjs';

const document = JSON.parse(await readFile(fileURLToPath(new URL('../../api/openapi.json', import.meta.url)), 'utf8'));

/** Resolve `$ref` so the SDK validator can read an OpenAPI schema.
 * @param {unknown} node @param {number} [seen] @returns {unknown} */
function deref(node, seen = 0) {
  if (seen > 10) throw new Error('$ref nesting too deep');
  if (Array.isArray(node)) return node.map((item) => deref(item, seen));
  if (node === null || typeof node !== 'object') return node;
  const ref = /** @type {{ $ref?: unknown }} */ (node).$ref;
  if (typeof ref === 'string') {
    const [, , group, name] = ref.split('/');
    const target = document.components[String(group)][String(name)];
    assert.ok(target !== undefined, `dangling $ref ${ref}`);
    return deref(target, seen + 1);
  }
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, deref(value, seen)]));
}

/** A demo vault that also carries an ACTIVE declaration, served by a real host.
 * @param {{ adaptive: boolean }} options */
async function startHost({ adaptive }) {
  const vault = demoVault();
  mkdirSync(join(vault.root, '.cellular', 'adaptive'), { recursive: true });
  writeFileSync(join(vault.root, '.cellular', 'adaptive', 'session.json'),
    `${JSON.stringify(ACTIVE_SESSION, null, 2)}\n`, 'utf8');
  const plugins = [...OBSERVER_PLUGINS];
  if (adaptive) plugins.push(createAdaptivePreferencesPlugin({ now: () => '2026-10-03T14:00:00.000Z' }));
  const host = await createHost({
    ...observerComposition({
      root: vault.root, plugins, ...(adaptive ? { adaptivePorts: createAdaptiveReadPorts } : {}),
    }),
    devUi: false,
  });
  const { url } = await host.listen(0);
  return {
    url,
    /** @param {string} key @param {string} cap */
    async post(key, cap) {
      const response = await fetch(`${url}/api/v1/plugins/${key}/capabilities/${cap}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      });
      const text = await response.text();
      return { status: response.status, text, body: JSON.parse(text) };
    },
    async cleanup() {
      await host.close();
      rmSync(vault.root, { recursive: true, force: true });
    },
  };
}

test('AD27 the document describes exactly the capability the manifest declares, legally', () => {
  const ext = document['x-adaptive-preferences'];
  assert.equal(ext.key, ADAPTIVE_KEY);
  const manifest = createAdaptivePreferencesPlugin();
  assert.deepEqual(Object.keys(ext.capabilities), Object.keys(manifest.capabilities));
  assert.deepEqual(Object.keys(ext.capabilities), ['current'], 'one capability, and no setter');
  for (const end of /** @type {const} */ (['input', 'output'])) {
    assert.deepEqual(validateSchema(/** @type {import('../sdk/types.mjs').Schema} */ (
      deref(ext.capabilities['current'][end]))), [], `current.${end}`);
  }
  assert.ok(ext.capabilities['current'].summary.length > 30);
  // The two vocabularies are CLOSED in the document: a sixth standing could not reach a
  // frontend without this file changing first.
  const schema = document.components.schemas.AdaptiveCurrent;
  assert.deepEqual(schema.properties.standing.enum, ['active', 'expired', 'invalid', 'none', 'disabled']);
  assert.deepEqual(schema.properties.mode.enum, ['ready', 'tired', 'focus', 'explore']);
  assert.deepEqual(schema.properties.declaredBy.enum, ['user', null], 'only a human declares a mode');
  assert.equal(schema.additionalProperties, false);
  assert.equal(Object.keys(schema.properties).includes('command'), false,
    'the text a human typed stays in their own file');
  // And the description says the two things a client must not get wrong.
  assert.match(ext.description, /404 NOT_FOUND/);
  assert.match(ext.description, /never infers/);
  assert.match(ext.description, /FAIL and every security finding/);
});

test('AD27 a real HTTP answer validates against the documented schema', async () => {
  const h = await startHost({ adaptive: true });
  try {
    const answer = await h.post(ADAPTIVE_KEY, 'current');
    assert.equal(answer.status, 200, answer.text);
    assert.equal(answer.body.value.standing, 'active');
    assert.equal(answer.body.value.mode, 'tired');
    assert.deepEqual(check(/** @type {import('../sdk/types.mjs').Schema} */ (
      deref(document['x-adaptive-preferences'].capabilities['current'].output)), answer.body.value).errors, []);
    assert.doesNotMatch(answer.text, /[A-Za-z]:\\\\|\/tmp\/|\.cellular/, 'no path may travel in the payload');
  } finally {
    await h.cleanup();
  }
});

test('AD31 without the flag the key does not exist, and a call is 404 NOT_FOUND', async () => {
  const h = await startHost({ adaptive: false });
  try {
    const listed = await fetch(`${h.url}/api/v1/plugins`);
    const body = /** @type {{ value: { plugins: Array<{ name: string }> } }} */ (await listed.json());
    assert.equal(body.value.plugins.some((p) => p.name === ADAPTIVE_KEY), false,
      'the health list is what the UI reads to decide whether to show a badge at all');
    const answer = await h.post(ADAPTIVE_KEY, 'current');
    assert.equal(answer.status, 404);
    assert.equal(answer.body.error.code, 'NOT_FOUND');
  } finally {
    await h.cleanup();
  }
});

test('AD31 the observer answers are BYTE-IDENTICAL with the flag and without it', async () => {
  const caps = ['overview', 'cells', 'graph', 'timeline'];
  /** @type {Record<string, string>} */
  const withFlag = {};
  /** @type {Record<string, string>} */
  const without = {};
  for (const [adaptive, into] of /** @type {const} */ ([[true, withFlag], [false, without]])) {
    const h = await startHost({ adaptive });
    try {
      for (const cap of caps) into[cap] = (await h.post('observer.state', cap)).text;
    } finally {
      await h.cleanup();
    }
  }
  // The vault is replayed per host, so the two trees are equal by construction; what is being
  // compared is whether loading the adaptive plugin changed a single byte of the observer's
  // answers. The ids and names are deterministic, so equality here is a real claim.
  for (const cap of caps) {
    assert.equal(withFlag[cap], without[cap], `${cap} changed when the adaptive reader was loaded`);
  }
});

test('AD31 the port over .cellular/adaptive is created ONLY for the adaptive plugin', async () => {
  const vault = demoVault();
  try {
    const bare = observerComposition({ root: vault.root });
    assert.deepEqual(Object.keys(bare.ports).sort(), ['listCells', 'readVault'],
      'the privilege nobody needs is never built');
    const parts = await adaptiveParts();
    assert.ok(parts !== null, 'this checkout has the adaptive module');
    const loaded = [...OBSERVER_PLUGINS, parts.manifest];
    const withReader = observerComposition({
      root: vault.root, plugins: loaded, adaptivePorts: parts.createPorts,
    });
    assert.deepEqual(Object.keys(withReader.ports).sort(), ['listCells', 'readAdaptive', 'readVault']);
    assert.equal(Object.keys(withReader.ports).includes('writeFile'), false,
      'no combination of plugins creates a writer');
    // Fail closed: the plugin may not be composed without the port factory it needs, so a
    // half-wired host is refused at composition time instead of 500ing at call time.
    assert.throws(() => observerComposition({ root: vault.root, plugins: loaded }), TypeError);
    // And handing the factory over does NOT create the privilege: only the plugin does.
    assert.deepEqual(
      Object.keys(observerComposition({ root: vault.root, adaptivePorts: parts.createPorts }).ports).sort(),
      ['listCells', 'readVault'],
    );
  } finally {
    vault.cleanup();
  }
});
