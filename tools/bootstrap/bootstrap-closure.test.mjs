// IMPORT CLOSURE — the invariant that makes an installed profile a working program instead of a
// pile of plausible files. For each profile, every relative specifier of every copied `.mjs` —
// static import, dynamic `import()` with a literal, and the `import('…')` inside a JSDoc type,
// which `tsc --checkJs` resolves just as strictly — must land on a file the SAME profile copies.
// A bare specifier is a failure on sight: this project has zero runtime dependencies, so a
// target cannot be asked to install one.
//
// The one documented hole is not an import at all, which is exactly why it needs a test:
// `tools/gates/verification-suite.mjs` RUNS this repository's own gate as a command, and that
// gate is deliberately not copied. Since BS3 (Cell 5) the hole is UNREACHABLE in a target —
// that command belongs to the BUILT-IN suite, which is selected only when
// `vault/verification.json` is absent, and every install carrying `article-8` also carries the
// `verification` component that generates it. KNOWN_COMMAND_GAPS names it and the last two
// tests assert both halves: the list is neither stale nor growing, and the contract is there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { expandFiles, loadCatalog } from './catalog.mjs';
import { missingForProfile, partition, unavailableFor } from './fixtures/availability.mjs';
import { diskSource } from './source-read.mjs';
import { PROFILES, PROFILE_NAMES, profileComponents, unmetConditions } from './profiles.mjs';
import { isBare, referenceSpecifiers, resolveSpecifier, staticSpecifiers } from './import-scan.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const source = diskSource(ROOT);
const catalog = loadCatalog(ROOT, source);

/** The profiles THIS checkout can install. All three here; fewer in a checkout that deleted an
 * optional module, which a removal rehearsal creates on purpose — there `copiedSet` REFUSES
 * (COMPONENT_UNAVAILABLE) rather than returning a smaller set, and the two tests that need every
 * profile at once branch on it explicitly. `bootstrap-availability.test.mjs` asserts that in this
 * repository nothing is unavailable, so the narrow branch can never become the only one that runs. */
const part = partition(catalog, source);
const INSTALLABLE = PROFILE_NAMES.filter((name) => missingForProfile(name, part).length === 0);

/** The components each profile installs when the target IS a git repository — the condition the
 * conditional entry waits for. Written out rather than derived, so a change to `profiles.mjs`
 * has to be agreed with this file.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>} */
const EXPECTED = Object.freeze({
  minimal: ['method-core', 'engineering-skills', 'cellmode-cli', 'verification', 'article-8'],
  standard: ['method-core', 'engineering-skills', 'cellmode-cli', 'verification', 'adaptive',
    'prompt-builder', 'article-8'],
  full: ['method-core', 'engineering-skills', 'cellmode-cli', 'verification', 'adaptive',
    'prompt-builder', 'upp', 'observer', 'article-8'],
});

/**
 * The repository-specific files a copied module names as a COMMAND rather than as an import.
 * Each entry is a real, named, bounded gap with the cell that closes it; the test below fails
 * if a new one appears, so the list can shrink but never grow by accident.
 * @type {ReadonlyArray<{ by: string, path: string, reason: string }>}
 */
const KNOWN_COMMAND_GAPS = Object.freeze([
  Object.freeze({
    by: 'tools/gates/verification-suite.mjs',
    path: 'tools/gates/check-all.mjs',
    reason: 'unreachable in a target (BS3, Cell 5): it belongs to the BUILT-IN suite, which is selected only when vault/verification.json is absent, and every install carrying article-8 generates that contract',
  }),
]);

/** @param {string} profile @returns {Set<string>} */
function copiedSet(profile) {
  assert.equal(catalog.ok, true);
  if (!catalog.ok) return new Set();
  const set = new Set();
  for (const id of profileComponents(profile, ['git'])) {
    const component = catalog.byId[id];
    assert.ok(component !== undefined, `profile ${profile} names unknown component ${id}`);
    for (const file of expandFiles(/** @type {never} */ (component), source)) set.add(file.source);
  }
  return set;
}

test('profiles · each profile is the declared list, and git is what adds Article 8', () => {
  assert.deepEqual([...PROFILE_NAMES], ['minimal', 'standard', 'full']);
  for (const name of PROFILE_NAMES) {
    assert.deepEqual([...profileComponents(name, ['git'])], EXPECTED[name]);
    const withoutGit = profileComponents(name);
    assert.equal(withoutGit.includes('article-8'), false, `${name} without git must not install hooks`);
    assert.deepEqual(unmetConditions(name).map((c) => c.id), ['article-8']);
    assert.deepEqual(unmetConditions(name, ['git']), []);
    assert.equal(Object.isFrozen(PROFILES[name]), true);
  }
  assert.throws(() => profileComponents('everything'), /unknown profile/);
});

test('profiles · each profile is a superset of the previous one', () => {
  const minimal = profileComponents('minimal', ['git']);
  const standard = profileComponents('standard', ['git']);
  const full = profileComponents('full', ['git']);
  assert.ok(minimal.every((id) => standard.includes(id)));
  assert.ok(standard.every((id) => full.includes(id)));
  for (const name of PROFILE_NAMES) {
    const missing = missingForProfile(name, part);
    if (missing.length > 0) assert.throws(() => copiedSet(name), unavailableFor(String(missing[0])));
  }
  if (INSTALLABLE.length < PROFILE_NAMES.length) return;
  assert.equal(copiedSet('minimal').size < copiedSet('standard').size, true);
  assert.equal(copiedSet('standard').size < copiedSet('full').size, true);
});

test('closure · every relative import of every copied module resolves inside its profile', () => {
  for (const profile of INSTALLABLE) {
    const set = copiedSet(profile);
    const modules = [...set].filter((rel) => rel.endsWith('.mjs')).sort();
    assert.ok(modules.length >= 20, `${profile} copies ${modules.length} modules, expected at least 20`);
    /** @type {string[]} */
    const unresolved = [];
    for (const rel of modules) {
      const text = source.read(rel);
      for (const { spec, line, kind } of [...staticSpecifiers(text), ...referenceSpecifiers(text)]) {
        if (isBare(spec)) {
          unresolved.push(`${rel}:${line}: bare specifier "${spec}" — this project has no runtime dependencies`);
          continue;
        }
        const resolved = resolveSpecifier(rel, spec);
        if (resolved !== null && !set.has(resolved)) {
          unresolved.push(`${rel}:${line}: ${kind} ${spec} -> ${resolved} is not in profile ${profile}`);
        }
      }
    }
    assert.deepEqual([...new Set(unresolved)].sort(), [],
      `profile ${profile} is not import-closed:\n  ${[...new Set(unresolved)].sort().join('\n  ')}`);
  }
});

test('closure · the known command gap is real, named and has not grown', () => {
  const set = copiedSet('minimal');
  for (const gap of KNOWN_COMMAND_GAPS) {
    assert.ok(set.has(gap.by), `${gap.by} must be copied for its gap to matter`);
    assert.equal(set.has(gap.path), false, `${gap.path} is copied, so the gap is stale: drop the entry`);
    assert.ok(source.read(gap.by).includes(gap.path), `${gap.by} no longer names ${gap.path}: drop the entry`);
    assert.match(gap.reason, /BS3, Cell 5/);
    assert.match(gap.reason, /unreachable in a target/);
  }
  // No OTHER copied module may name an uncopied repository path as a command argument. The
  // search is deliberately narrow: a `tools/…` or `eip/…` string literal inside a copied module.
  const allowed = new Set(KNOWN_COMMAND_GAPS.map((gap) => `${gap.by}|${gap.path}`));
  /** @type {string[]} */
  const surprises = [];
  const full = copiedSet(INSTALLABLE.includes('full') ? 'full' : 'minimal');
  for (const rel of [...full].filter((p) => p.endsWith('.mjs'))) {
    for (const match of source.read(rel).matchAll(/'((?:tools|eip|apps|upp)\/[A-Za-z0-9._/-]+\.mjs)'/g)) {
      const named = String(match[1]);
      if (!full.has(named) && !allowed.has(`${rel}|${named}`)) surprises.push(`${rel} names ${named}`);
    }
  }
  assert.deepEqual([...new Set(surprises)].sort(), []);
});

// The other half of the gap's unreachability, asserted rather than asserted-in-prose: an install
// that can run `verify-final` is an install that supplies the contract it reads.
test('closure · every install with article-8 also installs vault/verification.json', () => {
  assert.equal(catalog.ok, true);
  if (!catalog.ok) return;
  const article8 = catalog.byId['article-8'];
  const verification = catalog.byId['verification'];
  assert.ok(article8 !== undefined && verification !== undefined);
  assert.ok(/** @type {ReadonlyArray<string>} */ (article8.dependsOn).includes('verification'),
    'article-8 must DEPEND on the contract it reads, so no selection can take one without the other');
  const generated = /** @type {ReadonlyArray<{ target: string, mode: string }>} */ (verification.files);
  assert.deepEqual(generated.map((file) => `${file.target} (${file.mode})`),
    ['vault/verification.json (generate)']);
  for (const profile of INSTALLABLE) {
    const ids = profileComponents(profile, ['git']);
    assert.equal(ids.includes('article-8'), true, `${profile} installs Article 8 in a git repository`);
    assert.equal(ids.includes('verification'), true, `${profile} must install the contract too`);
    // And the gate that READS the contract is copied beside the one that validates it.
    const set = copiedSet(profile);
    for (const module of ['verification-suite.mjs', 'verification-contract.mjs', 'verification-argv.mjs']) {
      assert.equal(set.has(`tools/gates/${module}`), true, `${profile} must copy ${module}`);
    }
  }
});

test('closure · the specifier reader tells a declaration from a dependency', () => {
  const sample = [
    "import { a } from './a.mjs';",
    'import {',
    '  b,',
    "} from './b.mjs';",
    "export { c } from './c.mjs';",
    "import './side-effect.mjs';",
    "// import { d } from './d.mjs';",
    " * @type {typeof import('./e.mjs')}",
    "  const f = await import('./f.mjs');",
    "export const EDGE = obj({ from: ID }, ['from', 'to']);",
  ].join('\n');
  assert.deepEqual(staticSpecifiers(sample).map((s) => s.spec),
    ['./a.mjs', './b.mjs', './c.mjs', './side-effect.mjs']);
  assert.deepEqual(referenceSpecifiers(sample).map((s) => s.spec), ['./e.mjs', './f.mjs']);
  assert.equal(resolveSpecifier('eip/host/index.mjs', '../../tools/gates/evidence.mjs'), 'tools/gates/evidence.mjs');
  assert.equal(resolveSpecifier('a/b.mjs', './c.mjs'), 'a/c.mjs');
  assert.equal(resolveSpecifier('a/b.mjs', 'node:fs'), null);
  assert.equal(isBare('node:fs'), false);
  assert.equal(isBare('three'), true);
  assert.equal(isBare('./x.mjs'), false);
});
