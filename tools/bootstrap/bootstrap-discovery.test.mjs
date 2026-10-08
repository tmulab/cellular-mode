// H4 — NO INSTALLED FILE IS HOST-TEST-DISCOVERABLE. Installing Cellular Mode must not change the
// number of tests the target's own suite runs. In the 2026-10-07 adoption trial it did
// (A-14 / B-05): the copied `tools/gates/test-counts.mjs` matched Node's default `node --test`
// glob `**/test-*.?(c|m)js`, so the host's count went 6→7 and 11→12. The module is now
// `tools/gates/count-tests.mjs`; this test is the invariant that keeps it, and every future
// installed path, out of the host's discovery.
//
// The check runs over the CONCRETE target paths an install writes — copy targets from
// `expandFiles`, generated targets from `generateFor` (so `vault/state/` is its five real files,
// not a placeholder) — for every profile, with the `git` condition met so `article-8` is in.
//
// The matcher is deliberately a LIST OF PATTERNS, not a framework detector: Node's six documented
// defaults plus the obvious conventions of pytest, cargo, Maven/Gradle and Go. Each is a small
// explicit predicate on a POSIX relative path — no dependency, no glob engine, nothing to trust.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { generateFor } from './apply-generate.mjs';
import { expandFiles, loadCatalog } from './catalog.mjs';
import { componentActions } from './plan-actions.mjs';
import { missingForProfile, partition } from './fixtures/availability.mjs';
import { PROFILE_NAMES, profileComponents } from './profiles.mjs';
import { diskSource } from './source-read.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const source = diskSource(ROOT);
const catalog = loadCatalog(ROOT, source);
const part = partition(catalog, source);
const INSTALLABLE = PROFILE_NAMES.filter((name) => missingForProfile(name, part).length === 0);

/** A path segment list, with the file name last. @param {string} rel @returns {string[]} */
const segments = (rel) => rel.split('/').filter((s) => s.length > 0);
/** @param {string} rel @returns {string} */
const base = (rel) => String(segments(rel).at(-1) ?? '');
/** The `?(c|m)js` suffix set, as the three literal endings it expands to.
 * @param {string} name @param {string} stem @returns {boolean} */
const endsJs = (name, stem) => ['js', 'cjs', 'mjs'].some((ext) => name === `${stem}.${ext}`);
/** @param {string} name @returns {boolean} */
const anyJs = (name) => /\.(c|m)?js$/.test(name);
/** @param {string} rel @param {string} dir @returns {boolean} */
const underDir = (rel, dir) => segments(rel).slice(0, -1).includes(dir);
/** @param {string} name @param {string} suffix @returns {boolean} */
const stemEnds = (name, suffix) => anyJs(name) && name.replace(/\.(c|m)?js$/, '').endsWith(suffix);

/**
 * The host test-discovery conventions an installed path may never match. Node's six are the
 * documented defaults of `node --test` (Node 22/24); the rest are the single most common
 * convention of each other ecosystem a Cellular Mode target might be written in.
 * @type {ReadonlyArray<{ id: string, hits: (rel: string) => boolean }>}
 */
export const DISCOVERY_PATTERNS = Object.freeze([
  { id: 'node **/*.test.?(c|m)js', hits: (rel) => stemEnds(base(rel), '.test') },
  { id: 'node **/*-test.?(c|m)js', hits: (rel) => stemEnds(base(rel), '-test') },
  { id: 'node **/*_test.?(c|m)js', hits: (rel) => stemEnds(base(rel), '_test') },
  { id: 'node **/test-*.?(c|m)js', hits: (rel) => anyJs(base(rel)) && base(rel).startsWith('test-') },
  { id: 'node **/test.?(c|m)js', hits: (rel) => endsJs(base(rel), 'test') },
  { id: 'node **/test/**/*.?(c|m)js', hits: (rel) => anyJs(base(rel)) && underDir(rel, 'test') },
  { id: 'pytest test_*.py', hits: (rel) => base(rel).startsWith('test_') && base(rel).endsWith('.py') },
  { id: 'pytest *_test.py', hits: (rel) => base(rel).endsWith('_test.py') },
  { id: 'pytest test/ or tests/ *.py', hits: (rel) => base(rel).endsWith('.py') && (underDir(rel, 'test') || underDir(rel, 'tests')) },
  { id: 'cargo tests/*.rs', hits: (rel) => base(rel).endsWith('.rs') && underDir(rel, 'tests') },
  { id: 'maven/gradle src/test/**', hits: (rel) => segments(rel).slice(0, 2).join('/') === 'src/test' || /(^|\/)src\/test\//.test(rel) },
  { id: 'go *_test.go', hits: (rel) => base(rel).endsWith('_test.go') },
]);

/** Every pattern a path matches, as reportable ids. @param {string} rel @returns {string[]} */
export function discoveryHits(rel) {
  return DISCOVERY_PATTERNS.filter((pattern) => pattern.hits(rel)).map((pattern) => pattern.id);
}

/** The concrete relative paths an install of one profile WRITES into the target: copy targets and
 * the real files behind every generate action. Reference actions write nothing.
 * @param {string} profile @returns {ReadonlyArray<string>} */
function installedPaths(profile) {
  assert.equal(catalog.ok, true);
  if (!catalog.ok) return [];
  const chosen = new Set(profileComponents(profile, ['git']));
  const ctx = { read: (/** @type {string} */ rel) => source.read(rel), projectName: 'target', chosen };
  /** @type {Set<string>} */
  const out = new Set();
  for (const id of chosen) {
    const component = catalog.byId[id];
    assert.ok(component !== undefined, `profile ${profile} names unknown component ${id}`);
    const expanded = expandFiles(/** @type {never} */ (component), source);
    for (const act of componentActions(/** @type {never} */ (component), expanded, new Set())) {
      if (act.mode === 'copy') out.add(act.path);
      else if (act.mode === 'generate') {
        for (const made of generateFor(act, ctx)) if (made.dir !== true) out.add(made.rel);
      }
    }
  }
  return Object.freeze([...out].sort());
}

test('discovery · the matcher recognises each convention it claims to', () => {
  const positives = [
    ['tools/gates/test-counts.mjs', 'node **/test-*.?(c|m)js'],
    ['a/b.test.mjs', 'node **/*.test.?(c|m)js'],
    ['a/b-test.cjs', 'node **/*-test.?(c|m)js'],
    ['a/b_test.js', 'node **/*_test.?(c|m)js'],
    ['a/test.mjs', 'node **/test.?(c|m)js'],
    ['a/test/deep/helper.mjs', 'node **/test/**/*.?(c|m)js'],
    ['pkg/test_thing.py', 'pytest test_*.py'],
    ['pkg/thing_test.py', 'pytest *_test.py'],
    ['tests/helper.py', 'pytest test/ or tests/ *.py'],
    ['tests/integration.rs', 'cargo tests/*.rs'],
    ['src/test/java/Thing.java', 'maven/gradle src/test/**'],
    ['pkg/thing_test.go', 'go *_test.go'],
  ];
  for (const [rel, id] of positives) {
    assert.ok(discoveryHits(String(rel)).includes(String(id)), `${rel} must match ${id}`);
  }
  // And the names this project actually installs are clean, including the renamed module.
  for (const rel of ['tools/gates/count-tests.mjs', 'tools/gates/verify-final.mjs', 'AGENTS.md',
    'vault/state/log.md', 'skills/cell/SKILL.md', '.githooks/pre-commit', 'tests/README.md']) {
    assert.deepEqual(discoveryHits(rel), [], `${rel} must not look like a host test`);
  }
});

test('discovery · no installed path is host-test-discoverable, in any profile (H4)', () => {
  assert.ok(INSTALLABLE.length > 0, 'at least one profile must be installable here');
  for (const profile of INSTALLABLE) {
    const paths = installedPaths(profile);
    assert.ok(paths.length >= 20, `profile ${profile} installs ${paths.length} paths, expected ≥ 20`);
    const found = paths.flatMap((rel) => discoveryHits(rel).map((id) => `${rel} matches ${id}`));
    assert.deepEqual(found.sort(), [],
      `profile ${profile} installs host-discoverable files:\n  ${found.join('\n  ')}`);
  }
});

test('discovery · the renamed counts module is installed under its non-discoverable name', () => {
  for (const profile of INSTALLABLE) {
    const paths = new Set(installedPaths(profile));
    assert.equal(paths.has('tools/gates/count-tests.mjs'), true,
      `profile ${profile} must install the counts module`);
    assert.equal(paths.has('tools/gates/test-counts.mjs'), false, 'the discoverable name is gone');
  }
});
