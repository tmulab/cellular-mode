// The catalog as a SET: the eleven real manifests load, their references resolve, the graph is
// acyclic — and the expansion of their copy entries obeys two invariants that no single manifest
// can state about itself.
//
//   OWNERSHIP — every copied file belongs to exactly one component, so an uninstall knows who
//     may delete it and a drift report knows who to blame.
//   EXCLUSION — no test, fixture, report, evidence or scratch path is ever copied. The source
//     tree is the project's own, and the one thing a target must not inherit is this
//     repository's verification apparatus.
//
// The referential and cycle cases run against hand-built sets, so they are fast and do not
// depend on the real manifests staying wrong-shaped for the test's benefit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { COMPONENTS_DIR, expandFiles, findCycle, integrityErrors, isExcluded, loadCatalog } from './catalog.mjs';
import { partition } from './fixtures/availability.mjs';
import { diskSource } from './source-read.mjs';
import { SCHEMA, VERSION } from './component-schema.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const source = diskSource(ROOT);
const catalog = loadCatalog(ROOT, source);

/** Path shapes that must never reach a target. Each one is a real category from
 * `bootstrap/CONTRACTS.md`, "Never copied", written as the test that enforces it. */
const FORBIDDEN = Object.freeze([
  { why: 'a colocated test', match: (/** @type {string} */ p) => p.endsWith('.test.mjs') },
  { why: 'a test directory', match: (/** @type {string} */ p) => p.split('/').includes('tests') },
  { why: 'a fixture directory', match: (/** @type {string} */ p) => p.split('/').includes('fixtures') },
  { why: 'a fixture module', match: (/** @type {string} */ p) => /(^|\/|-)fixtures?\.mjs$/.test(p) || p.endsWith('-fixture.mjs') },
  { why: 'test plumbing', match: (/** @type {string} */ p) => p.endsWith('/helpers.mjs') || p.endsWith('/doubles.mjs') },
  { why: 'a stage report', match: (/** @type {string} */ p) => /_REPORT\.md$/.test(p) },
  { why: 'an acceptance or validation record', match: (/** @type {string} */ p) => /(ACCEPTANCE|MANUAL|VALIDATION)/.test(p) },
  { why: 'local evidence', match: (/** @type {string} */ p) => p.split('/').includes('.cellular') },
  { why: 'builder scratch', match: (/** @type {string} */ p) => p.startsWith('vault/builder/') },
  { why: 'bootstrap scratch', match: (/** @type {string} */ p) => p.startsWith('vault/bootstrap/') },
  { why: 'recorded project state', match: (/** @type {string} */ p) => p.startsWith('vault/state/') },
  { why: 'an example', match: (/** @type {string} */ p) => p.startsWith('examples/') },
  { why: 'an installed dependency', match: (/** @type {string} */ p) => p.split('/').includes('node_modules') },
]);

/** Every component this checkout can expand — ALL of them in a complete checkout, so the ownership
 * and hygiene claims below cover the whole catalog. In a checkout that deleted an optional module
 * (a removal rehearsal makes one on purpose) the rest are COMPONENT_UNAVAILABLE, and
 * `bootstrap-availability.test.mjs` is where that refusal and the exact unavailable set are asserted.
 * @returns {ReadonlyArray<{ id: string, files: ReadonlyArray<{ source: string, target: string }> }>} */
function expanded() {
  assert.equal(catalog.ok, true, catalog.ok ? '' : catalog.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  return partition(catalog, source).available;
}

/** @param {Partial<Record<string, unknown>>} extra @returns {Record<string, unknown>} */
const component = (extra) => ({
  schema: SCHEMA,
  version: VERSION,
  componentVersion: '1.0.0',
  description: 'A sample component.',
  files: [{ source: 'skills/cell/SKILL.md', target: 'skills/cell/SKILL.md', mode: 'copy' }],
  uninstall: 'remove-owned',
  ...extra,
});

test('catalog · the eleven real manifests load, resolve and stay frozen', () => {
  assert.equal(catalog.ok, true, catalog.ok ? '' : catalog.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  if (!catalog.ok) return;
  assert.equal(catalog.components.length, 11);
  assert.equal(Object.isFrozen(catalog.components), true);
  assert.equal(Object.isFrozen(catalog.byId['method-core']), true);
  const hooks = /** @type {{ host: { requires: ReadonlyArray<string> } }} */ (catalog.byId['article-8']);
  assert.deepEqual([...hooks.host.requires], ['git']);
  assert.equal(COMPONENTS_DIR, 'bootstrap/components');
});

test('catalog · an unknown reference, a self-reference and a cycle are refused', () => {
  const unknown = [component({ id: 'a', dependsOn: ['nowhere'] })];
  assert.deepEqual(integrityErrors(unknown).map((e) => e.path), ['a.dependsOn']);
  const itself = [component({ id: 'a', dependsOn: ['a'] })];
  assert.ok(integrityErrors(itself).some((e) => e.message.includes('itself')));
  const cycle = [
    component({ id: 'a', dependsOn: ['b'] }),
    component({ id: 'b', dependsOn: ['c'] }),
    component({ id: 'c', dependsOn: ['a'] }),
  ];
  assert.deepEqual(findCycle(cycle), ['a', 'b', 'c', 'a']);
  assert.ok(integrityErrors(cycle).some((e) => e.message === 'dependency cycle'));
  const duplicate = [component({ id: 'a' }), component({ id: 'a' })];
  assert.ok(integrityErrors(duplicate).some((e) => e.message === 'duplicate component id'));
  const both = [component({ id: 'a', dependsOn: ['b'], conflicts: ['b'] }), component({ id: 'b' })];
  assert.ok(integrityErrors(both).some((e) => e.path === 'a.conflicts'));
  const fine = [component({ id: 'a', dependsOn: ['b'] }), component({ id: 'b' })];
  assert.deepEqual(integrityErrors(fine), []);
  assert.equal(findCycle(fine), null);
});

test('catalog · exclude removes a directory segment or a path suffix, nothing else', () => {
  assert.equal(isExcluded('tools/cellmode/cli.test.mjs', ['.test.mjs']), true);
  assert.equal(isExcluded('tools/cellmode/cli.mjs', ['.test.mjs']), false);
  assert.equal(isExcluded('a/fixtures/b.json', ['fixtures/']), true);
  assert.equal(isExcluded('a/fixtures-not/b.json', ['fixtures/']), false);
  assert.equal(isExcluded('a/fixtures', ['fixtures/']), false, 'a FILE named like the dir is not the dir');
  assert.equal(isExcluded('eip/host/cli.mjs', ['eip/host/cli.mjs']), true);
  assert.equal(isExcluded('apps/observer/cli.mjs', ['eip/host/cli.mjs']), false);
});

test('catalog · every copied file is owned by exactly one component', () => {
  /** @type {Map<string, string[]>} */
  const bySource = new Map();
  /** @type {Map<string, string[]>} */
  const byTarget = new Map();
  for (const { id, files } of expanded()) {
    for (const file of files) {
      bySource.set(file.source, [...(bySource.get(file.source) ?? []), id]);
      byTarget.set(file.target, [...(byTarget.get(file.target) ?? []), id]);
    }
  }
  const shared = [...bySource.entries()].filter(([, owners]) => owners.length > 1);
  assert.deepEqual(shared.map(([path, owners]) => `${path}: ${owners.join(', ')}`), []);
  const collisions = [...byTarget.entries()].filter(([, owners]) => owners.length > 1);
  assert.deepEqual(collisions.map(([path, owners]) => `${path}: ${owners.join(', ')}`), []);
  // Non-vacuity, with the floor stated per world rather than lowered for both: 200 whenever every
  // component expands (this repository), and a smaller but still real floor in a checkout that
  // deleted an optional module, where a whole component's files are legitimately absent.
  const floor = partition(catalog, source).unavailable.length === 0 ? 200 : 100;
  assert.ok(bySource.size >= floor, `the expansion found ${bySource.size} files, expected ${floor}+`);
});

test('catalog · no test, fixture, report, evidence or scratch path is copied', () => {
  /** @type {string[]} */
  const offenders = [];
  for (const { id, files } of expanded()) {
    for (const { source: from, target: to } of files) {
      for (const rule of FORBIDDEN) {
        if (rule.match(from) || rule.match(to)) offenders.push(`${id}: ${from} is ${rule.why}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
  // Positive control: the categories above are not vacuous — the source tree really holds them.
  assert.ok(source.walk('tools/cellmode').some((p) => p.endsWith('.test.mjs')));
  assert.ok(source.walk('apps/observer').some((p) => p.split('/').includes('fixtures')));
});

test('catalog · a generate or reference entry expands to nothing to copy', () => {
  const generated = component({ id: 'g', files: [{ target: 'AGENTS.md', mode: 'generate', template: 'agents-md' }] });
  assert.deepEqual(expandFiles(generated, source), []);
  const referenced = component({ id: 'r', files: [{ source: 'README.md', target: 'README.md', mode: 'reference' }] });
  assert.deepEqual(expandFiles(referenced, source), []);
  const byId = catalog.ok ? catalog.byId : {};
  // Both are GENERATE-only components, so neither reads the source tree: available in every world.
  for (const id of ['verification', 'claude-code-adapter']) {
    assert.deepEqual(expandFiles(/** @type {never} */ (byId[id]), source), [], `${id} copies nothing`);
  }
});

test('catalog · the walk never follows a symlink and never leaves the source root', () => {
  const files = source.walk('skills');
  assert.ok(files.includes('skills/cell/SKILL.md'));
  assert.ok(files.every((rel) => rel.startsWith('skills/') && !rel.includes('..')));
  assert.deepEqual([...files], [...files].sort(), 'the walk is sorted, so a plan is deterministic');
  assert.deepEqual(source.skipped(), [], 'no symlink or special entry was met under skills/');
});
