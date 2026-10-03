// AD27 — `adaptive.preferences` behaves like a PLUGIN.
//
// Not a domain suite: these tests ask whether it declares what it provides, sees only the one
// port it declared, writes nothing, and reports the standing instead of interpreting it. Every
// assertion names a code or a shape, because "it failed" is the shape of a false green.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import adaptivePreferences, { createAdaptivePreferencesPlugin } from './adaptive-preferences/index.mjs';
import { CURRENT } from './adaptive-preferences/schemas.mjs';
import { ACTIVE_SESSION, KEY, loadAdaptive } from './adaptive-preferences-fixture.mjs';
import { createKernel } from '../kernel/index.mjs';
import { check, validateSchema } from '../sdk/index.mjs';
import { valueOf } from '../kernel/assertions.mjs';

const SOURCE = readFileSync(new URL('./adaptive-preferences/index.mjs', import.meta.url), 'utf8');
/** The module with its prose removed. A claim about what the CODE does must be made about the
 * code: this file's own comments explain the mode names, and matching those would be a test
 * of the documentation. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('AD27 the manifest declares one permission, one read-only capability, no inject', () => {
  const kernel = createKernel();
  kernel.register(adaptivePreferences);
  const [described] = kernel.list();
  assert.ok(described !== undefined);
  assert.equal(described.name, KEY);
  assert.deepEqual(described.permissions, ['fs.read']);
  assert.deepEqual(described.inject, {}, 'it depends on no sibling, and no sibling depends on it');
  assert.deepEqual(Object.keys(described.capabilities), ['current']);
  assert.equal(described.capabilities['current']?.consequential, false, 'reading is not an act');
  assert.ok((described.capabilities['current']?.description ?? '').length > 20);
  assert.equal(described.devUi, undefined, 'no diagnostics page: the Observer has its own');
});

test('AD27 the plugin sees ONLY readAdaptive — not the vault, not a writer the host offers', async () => {
  const a = await loadAdaptive({ session: ACTIVE_SESSION, offerExtraPorts: true });
  try {
    // The host DID offer `readVault`, `listCells` and `writeFile`; the plugin declared
    // `fs.read`, and the kernel grants per permission — so the vault readers ARE visible by
    // permission. What must be invisible is the WRITER, and that is the claim.
    const names = /** @type {() => string[]} */ (a.service()['portNames'])();
    assert.equal(names.includes('readAdaptive'), true);
    assert.equal(names.includes('writeFile'), false, 'an undeclared permission is invisible, not refused');
    assert.equal(valueOf(await a.call()).mode, 'tired', 'and the one port it needs does work');
  } finally {
    await a.cleanup();
  }
});

test('AD27 the module contains no write primitive and no inference of any kind', () => {
  assert.doesNotMatch(SOURCE, /writeFile|appendFile|mkdir|unlink|rmSync|renameSync/,
    'a reader must not be able to write');
  assert.doesNotMatch(SOURCE, /node:fs|node:child_process|node:net|node:http/,
    'the plugin touches no module of the platform: everything arrives through the port');
  // No code path from anything other than the file to a mode: every mode-valued expression
  // in this module comes from `effectiveMode`, which reads the declaration and nothing else.
  assert.equal((CODE.match(/effectiveMode\(/g) ?? []).length, 2, 'exactly two call sites');
  for (const inferred of ['tired', 'focus', 'explore', 'active']) {
    assert.doesNotMatch(CODE, new RegExp(`['"]${inferred}['"]`),
      `the plugin code must never name ${inferred}: it reports whatever the human declared`);
  }
  assert.doesNotMatch(CODE, /Date\.now|new Date\(\)\.getTime/, 'the clock is a parameter');
});

test('AD27 refuses to exist without the port, and without a clock', async () => {
  const kernel = createKernel();
  kernel.register(adaptivePreferences);
  await assert.rejects(() => kernel.load(KEY, { ports: {} }), /readAdaptive/);
  assert.throws(() => createAdaptivePreferencesPlugin({ now: /** @type {() => string} */ (/** @type {unknown} */ (7)) }), TypeError);
});

test('AD27 the output schema is legal in the SDK subset and every answer validates', async () => {
  assert.deepEqual(validateSchema(CURRENT), []);
  assert.deepEqual(validateSchema(/** @type {import('../sdk/types.mjs').Schema} */ (
    adaptivePreferences.capabilities['current']?.input)), []);
  const cases = [
    { session: ACTIVE_SESSION },
    { session: undefined },
    { sessionText: '{ not json' },
    { session: ACTIVE_SESSION, preferences: { schema: 1, enabled: false, ttlHours: 4 } },
    { session: { ...ACTIVE_SESSION, expiresAt: '2026-10-03T13:00:00.000Z' } },
  ];
  for (const scenario of cases) {
    const a = await loadAdaptive(scenario);
    try {
      const value = valueOf(await a.call());
      assert.deepEqual(check(CURRENT, value).errors, [], `drifted for ${JSON.stringify(scenario).slice(0, 60)}`);
    } finally {
      await a.cleanup();
    }
  }
});

test('AD27 it leaves nothing behind: dispose is clean and the project is unchanged', async () => {
  const a = await loadAdaptive({ session: ACTIVE_SESSION });
  const before = readFileSync(`${a.root}/.cellular/adaptive/session.json`, 'utf8');
  try {
    await a.call();
    await a.call();
    assert.equal(readFileSync(`${a.root}/.cellular/adaptive/session.json`, 'utf8'), before,
      'reading a declaration must not touch it');
    assert.equal(a.kernel.isLoaded(KEY), true);
    await a.kernel.dispose(KEY);
    assert.equal(a.kernel.isLoaded(KEY), false);
  } finally {
    await a.cleanup();
  }
});
