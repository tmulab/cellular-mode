// U6 · every existing JS plugin maps to a valid UPP manifest, without loss.
//
// This test lives under `tests/` and not beside the module it exercises, for a reason the
// gate enforces: `eip/upp/` may import the SDK and itself only, so a file in there could not
// reach a plugin manifest. The claim "every plugin still works" is about the REPOSITORY, so
// it is checked from the one place entitled to know every part.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest } from '../eip/sdk/index.mjs';
import { compatBreaches, toUppManifest, validateUppManifest } from '../eip/upp/index.mjs';
import observerAudit from '../eip/plugins/observer-audit/index.mjs';
import observerState from '../eip/plugins/observer-state/index.mjs';
import textReport from '../eip/plugins/text-report/index.mjs';
import textStats from '../eip/plugins/text-stats/index.mjs';
import { createAdvisorPlugin } from '../eip/plugins/observer-advisor/index.mjs';
import { fixtureAdapter } from '../eip/plugins/observer-advisor/fixture-adapter.mjs';
import { allDirs, exists } from './helpers.mjs';

/** `adaptive.preferences` belongs to the OPTIONAL Cellular Adaptive module (AD29), which the
 * removal rehearsal DELETES. A static import of it would turn its absence into a crashed test
 * file — which is exactly what `npm run rehearse:adaptive-removal` reported in stage 5, cell 7
 * — so it is loaded dynamically and only when it is in the checkout. Absent, it is covered by
 * nothing and claimed by nothing; present, it is covered exactly as before.
 * @type {string} */
const ADAPTIVE = 'eip/plugins/adaptive-preferences';
const adaptivePreferences = exists(`${ADAPTIVE}/index.mjs`)
  ? /** @type {import('../eip/sdk/types.mjs').Manifest} */ (
    (await import('../eip/plugins/adaptive-preferences/index.mjs')).default)
  : null;

/** Every plugin in the repository. `observer.advisor` is a FACTORY — it is composed with a
 * model adapter — so it is instantiated here with the fixture adapter that already ships for
 * its own tests. Nothing is stubbed: these are the real manifests.
 * @type {ReadonlyArray<import('../eip/sdk/types.mjs').Manifest>} */
const PLUGINS = Object.freeze([
  textStats, textReport, observerState, observerAudit,
  createAdvisorPlugin({ adapter: fixtureAdapter }),
  ...(adaptivePreferences === null ? [] : [adaptivePreferences]),
]);

test('upp compat · the list really is every plugin directory in the repository', () => {
  const directories = allDirs()
    .filter((rel) => /^eip[\\/]plugins[\\/][^\\/]+$/.test(rel))
    .map((rel) => rel.split(/[\\/]/).pop());
  assert.equal(directories.length, PLUGINS.length,
    `found ${directories.length} plugin directories but ${PLUGINS.length} manifests: `
    + 'a new plugin must be added to this list, or U6 silently stops covering it');
  const keys = PLUGINS.map((m) => m.name).sort();
  assert.deepEqual(keys, [
    'adaptive.preferences', 'observer.advisor', 'observer.audit', 'observer.state',
    'text.report', 'text.stats',
  ].filter((key) => key !== 'adaptive.preferences' || adaptivePreferences !== null));
});

test('upp compat · every plugin is a valid SDK manifest to begin with', () => {
  for (const manifest of PLUGINS) {
    assert.deepEqual(validateManifest(manifest).errors, [], manifest.name);
  }
});

test('upp compat · U6 every plugin maps to a VALID UPP manifest', () => {
  for (const manifest of PLUGINS) {
    const upp = toUppManifest(manifest);
    const verdict = validateUppManifest(upp);
    assert.deepEqual(verdict.errors, [], `${manifest.name}: ${JSON.stringify(verdict.errors)}`);
    assert.ok(Object.isFrozen(upp));
  }
});

test('upp compat · U6 identity, version and runtime survive exactly', () => {
  for (const manifest of PLUGINS) {
    const upp = toUppManifest(manifest);
    assert.equal(upp.id, manifest.name, 'the key IS the id');
    assert.equal(upp.version, manifest.version);
    assert.equal(upp.description, manifest.description);
    assert.equal(upp.type, 'capability');
    assert.equal(upp.runtime, 'in-process');
    assert.deepEqual(upp.entry, { module: manifest.name });
    assert.deepEqual(upp.extensions, {
      sdk: manifest.sdk,
      ...(manifest.devUi === undefined ? {} : { devUi: { title: manifest.devUi.title } }),
    });
  }
});

test('upp compat · U6 every capability keeps its schemas and its consequential flag', () => {
  for (const manifest of PLUGINS) {
    const mapped = /** @type {Record<string, Record<string, unknown>>} */ (
      toUppManifest(manifest).capabilities);
    assert.deepEqual(Object.keys(mapped).sort(), Object.keys(manifest.capabilities).sort(),
      manifest.name);
    for (const [id, cap] of Object.entries(manifest.capabilities)) {
      const got = mapped[id];
      assert.ok(got !== undefined, `${manifest.name}#${id}`);
      assert.deepEqual(Object.keys(got ?? {}).sort(),
        ['consequential', 'description', 'input', 'output']);
      assert.equal(got?.consequential, cap.consequential, `${manifest.name}#${id} consequential`);
      assert.deepEqual(got?.input, cap.input, `${manifest.name}#${id} input`);
      assert.deepEqual(got?.output, cap.output, `${manifest.name}#${id} output`);
      assert.equal(got?.description, cap.description);
    }
  }
});

test('upp compat · U6 the one consequential capability in the repository stays consequential', () => {
  // text.report#save-report writes a file. If the mapping ever flattened this flag, an
  // external plugin could perform a consequential act with nobody accountable.
  const mapped = /** @type {Record<string, Record<string, unknown>>} */ (
    toUppManifest(textReport).capabilities);
  assert.equal(mapped['save-report']?.consequential, true);
  const consequential = PLUGINS.flatMap((m) => Object.entries(m.capabilities)
    .filter(([, cap]) => cap.consequential).map(([id]) => `${m.name}#${id}`));
  assert.deepEqual(consequential, ['text.report#save-report']);
});

test('upp compat · U6 dependencies, permissions and config survive exactly', () => {
  for (const manifest of PLUGINS) {
    const upp = toUppManifest(manifest);
    const inject = Object.entries(manifest.inject ?? {});
    if (inject.length === 0) {
      assert.equal('dependencies' in upp, false, `${manifest.name} declares none`);
    } else {
      assert.deepEqual(upp.dependencies,
        Object.fromEntries(inject.map(([k, v]) => [k, { required: v.required }])), manifest.name);
    }
    const permissions = manifest.permissions ?? [];
    if (permissions.length === 0) assert.equal('permissions' in upp, false, manifest.name);
    else assert.deepEqual(upp.permissions, [...permissions], manifest.name);
    assert.deepEqual(upp.config, manifest.config, `${manifest.name} config`);
  }
});

test('upp compat · the breach report is empty for a faithful mapping, and names a drift', () => {
  for (const manifest of PLUGINS) {
    assert.deepEqual(compatBreaches(manifest, toUppManifest(manifest)), [], manifest.name);
  }
  const tampered = { ...toUppManifest(textReport), version: '9.9.9' };
  assert.deepEqual(compatBreaches(textReport, tampered).map((b) => b.path), ['version']);
  const flattened = {
    ...toUppManifest(textReport),
    capabilities: { 'save-report': { ...textReport.capabilities['save-report'], consequential: false } },
  };
  assert.deepEqual(compatBreaches(textReport, flattened).map((b) => b.path), ['capabilities'],
    'a dropped consequential flag must be a reported breach, not a silent round trip');
});

test('upp compat · a module specifier may be overridden, and nothing else may', () => {
  const upp = toUppManifest(textStats, { module: './eip/plugins/text-stats/index.mjs' });
  assert.deepEqual(upp.entry, { module: './eip/plugins/text-stats/index.mjs' });
  assert.deepEqual(compatBreaches(textStats, upp), [],
    'the override is the one degree of freedom the mapping has');
});
