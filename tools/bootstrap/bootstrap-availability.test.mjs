// COMPONENT_UNAVAILABLE — what Bootstrap does when a component's declared source is not in THIS
// checkout. `adaptive/` and `tools/prompt-builder/` are OPTIONAL modules, and `npm run
// rehearse:adaptive-removal` / `rehearse:builder-removal` delete them in a copy on purpose, so this
// is a real state and not a hypothetical.
//
// Three decisions, all tested here:
//   REFUSE, NEVER CRASH. The old behaviour was a raw `ENOENT` from the walk. It is now a named
//   refusal carrying the component id and the missing RELATIVE path, mapped to exit 2.
//   REFUSE, NEVER DOWNGRADE. A profile naming an unavailable component is refused whole. It is not
//   quietly planned without it: an install that silently delivered less than the profile promises
//   is the worse of the two failures, and the refusal carries the hint that says what to do instead.
//   THIS CHECKOUT IS COMPLETE. Every component here is available, so every other real-catalog test
//   in this directory runs its full present-world claim and the narrow branches stay unreachable.
//
// The synthetic source is a temp tree holding `bootstrap/` plus the sources `minimal` and
// `prompt-builder` need, and NOT `adaptive/` — the smallest tree in which one component is
// unavailable and the rest are not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandFiles, expandSelection, loadCatalog } from './catalog.mjs';
import { CODES, EXIT_FOR, exitFor } from './errors.mjs';
import { diskSource } from './source-read.mjs';
import { preparePlan } from './new-flow.mjs';
import { makeFacts } from './target-facts.mjs';
import { PROFILE_NAMES } from './profiles.mjs';
import { missingForProfile, partition, unavailableFor } from './fixtures/availability.mjs';
import { cleanup, makeTarget } from './fixtures/temp.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** The OPTIONAL modules, the directory that says each one is installed, and the components that
 * cannot be expanded without it. Data, so the two worlds are one derivation rather than two guesses:
 * `observer` is on the adaptive row because it copies `eip/plugins/adaptive-preferences`, the EIP
 * half of that module. @type {ReadonlyArray<{ marker: string, components: ReadonlyArray<string> }>} */
const OPTIONAL = Object.freeze([
  Object.freeze({ marker: 'tools/adaptive', components: Object.freeze(['adaptive', 'observer']) }),
  Object.freeze({ marker: 'tools/prompt-builder', components: Object.freeze(['prompt-builder']) }),
]);

/** The components THIS checkout cannot expand because an optional module was deleted from it.
 * Empty in this repository; non-empty inside a removal rehearsal's copy. @type {ReadonlyArray<string>} */
const ABSENT_HERE = Object.freeze([...new Set(OPTIONAL
  .filter(({ marker }) => !existsSync(join(ROOT, ...marker.split('/'))))
  .flatMap(({ components }) => components))].sort());

/** @param {ReadonlyArray<string>} ids @returns {string[]} */
const sortedUnique = (ids) => [...new Set(ids)].sort();

/** The directories a synthetic source copies from this checkout: everything every component declares
 * EXCEPT `adaptive` and `tools/adaptive`, whose absence is the subject. Listed rather than filtered,
 * so a new component source has to be named here and the "exactly one unavailable" claim below stays
 * a claim about adaptive rather than about whatever the copy happened to miss. */
const COPIED = Object.freeze(['bootstrap', 'skills', 'tools/cellmode', 'tools/prompt-builder',
  'tools/gates', '.githooks', 'apps/observer', 'eip', 'upp', 'adapters', 'templates']);

/** A source tree missing exactly the `adaptive` component's sources. @returns {string} */
function syntheticSource() {
  const dir = makeTarget('source');
  for (const rel of COPIED) {
    const from = join(ROOT, ...rel.split('/'));
    if (existsSync(from)) {
      mkdirSync(join(dir, ...rel.split('/')), { recursive: true });
      cpSync(from, join(dir, ...rel.split('/')), { recursive: true, dereference: false });
    }
  }
  writeFileSync(join(dir, 'package.json'), readFileSync(join(ROOT, 'package.json')));
  writeFileSync(join(dir, 'AGENTS.md'), readFileSync(join(ROOT, 'AGENTS.md')));
  return dir;
}

test('availability · the refusal names the component, the missing path and exit 2', () => {
  const dir = syntheticSource();
  try {
    const source = diskSource(dir);
    const catalog = loadCatalog(dir, source);
    assert.equal(catalog.ok, true, 'the synthetic source must still hold a valid catalog');
    const part = partition(catalog, source);
    assert.deepEqual(sortedUnique(part.unavailable.map(({ id }) => id)),
      sortedUnique(['adaptive', ...ABSENT_HERE]),
      `the component whose source was withheld, plus whatever this checkout already lacks: ${JSON.stringify(part.unavailable)}`);
    assert.equal(part.unavailable.find(({ id }) => id === 'adaptive')?.missing, 'adaptive');
    // The refusal itself, raised by the product and not by the test helper.
    const adaptive = catalog.ok ? catalog.byId.adaptive : undefined;
    assert.ok(adaptive !== undefined);
    assert.throws(() => expandFiles(/** @type {never} */ (adaptive), source), (error) => {
      assert.equal(unavailableFor('adaptive')(error), true, String(error));
      const refusal = /** @type {{ code: string, message: string, exitCode: number }} */ (error);
      assert.equal(refusal.code, CODES.COMPONENT_UNAVAILABLE);
      assert.equal(refusal.exitCode, 2, 'a finding about the source is exit 2');
      assert.match(refusal.message, /component "adaptive" is not available in this checkout/);
      assert.match(refusal.message, /--profile custom/, 'the refusal must carry the hint');
      assert.match(refusal.message, /omits "adaptive"/);
      return true;
    });
    assert.equal(exitFor(CODES.COMPONENT_UNAVAILABLE), 2);
    assert.equal(EXIT_FOR[CODES.COMPONENT_UNAVAILABLE], 2);
  } finally {
    cleanup(dir);
  }
});

test('availability · an absent source is never an empty file list', () => {
  const dir = syntheticSource();
  try {
    const source = diskSource(dir);
    assert.equal(source.has('tools/cellmode'), true, 'the probe must see what is there');
    assert.equal(source.has('adaptive'), false, 'and must not see what is not');
    // The mutation this guards against: `expandFiles` answering `[]` for a missing directory. An
    // empty answer here would make a profile install less than it promises, in silence.
    const adaptive = loadCatalog(dir, source);
    const component = adaptive.ok ? adaptive.byId.adaptive : undefined;
    let files = /** @type {unknown} */ (null);
    try {
      files = expandFiles(/** @type {never} */ (component), source);
    } catch { /* the expected path */ }
    assert.equal(files, null, 'expandFiles returned a file list for a source that is not there');
  } finally {
    cleanup(dir);
  }
});

test('availability · a PROFILE naming an unavailable component is refused whole, not downgraded', () => {
  const dir = syntheticSource();
  try {
    const source = diskSource(dir);
    const catalog = loadCatalog(dir, source);
    const byId = catalog.ok ? catalog.byId : {};
    // The product path both `new` and `existing` plan through.
    const plan = (/** @type {string} */ profile) => preparePlan({
      sourceRoot: dir, facts: makeFacts({ isGitRepo: false }), profile,
    });
    assert.ok(plan('minimal').plan.actions.length > 0, 'a profile that needs nothing absent still plans');
    for (const profile of ['standard', 'full']) {
      assert.throws(() => plan(profile), unavailableFor('adaptive'),
        `${profile} names adaptive, so it must refuse rather than plan a smaller install`);
    }
    // A custom selection naming it refuses too; a custom selection omitting it is the way out, which
    // is exactly what the hint says. The way out is built from the components this checkout really
    // has, so it is the same claim in a checkout that deleted a second optional module.
    assert.throws(() => expandSelection(byId, ['adaptive'], source), unavailableFor('adaptive'));
    const wayOut = ['method-core', 'cellmode-cli', 'verification', 'prompt-builder']
      .filter((id) => !ABSENT_HERE.includes(id));
    assert.ok(expandSelection(byId, wayOut, source)['cellmode-cli']);
    assert.ok(preparePlan({
      sourceRoot: dir, facts: makeFacts({ isGitRepo: false }), profile: 'custom', components: wayOut,
    }).plan.actions.length > 0, 'the hint has to actually work');
  } finally {
    cleanup(dir);
  }
});

test('availability · status and uninstall need no component source at all', () => {
  // They work from `vault/install-manifest.json` in the TARGET, which is why a checkout that cannot
  // install a component can still report on, and remove, an install that has one. Asserted as an
  // import fact because it is the property that makes the behaviour impossible to lose by accident.
  const CATALOG_FREE = Object.freeze(['status.mjs', 'status-read.mjs', 'status-render.mjs',
    'uninstall.mjs', 'uninstall-plan.mjs', 'uninstall-render.mjs', 'manage-flow.mjs']);
  const here = fileURLToPath(new URL('.', import.meta.url));
  for (const name of CATALOG_FREE) {
    const text = readFileSync(join(here, name), 'utf8');
    assert.doesNotMatch(text, /from '\.\/catalog(?:-expand)?\.mjs'/, `${name} must not need the catalog`);
    assert.doesNotMatch(text, /expandFiles|expandSelection/, `${name} must not expand a component`);
  }
  // Positive control: the planning flow DOES need it, so the check above is about these files and
  // not about a pattern that matches nothing.
  const flow = readFileSync(join(here, 'new-flow.mjs'), 'utf8');
  assert.match(flow, /from '\.\/catalog\.mjs'/);
  assert.match(flow, /expandSelection/);
});

test('availability · the unavailable set is exactly the optional modules this checkout deleted', () => {
  const source = diskSource(ROOT);
  const catalog = loadCatalog(ROOT, source);
  assert.equal(catalog.ok, true);
  const part = partition(catalog, source);
  // In THIS repository both markers are present, so ABSENT_HERE is empty and this asserts that every
  // component expands — which is what makes the full present-world claim of every other
  // real-catalog test in this directory the one that actually runs. Inside a removal rehearsal's
  // copy the same line asserts the exact, named, expected set instead of excusing it.
  assert.deepEqual(sortedUnique(part.unavailable.map(({ id }) => id)), [...ABSENT_HERE],
    `unexpected unavailable components: ${JSON.stringify(part.unavailable)}`);
  assert.ok(part.available.length >= 11 - ABSENT_HERE.length,
    `only ${part.available.length} components were expanded`);
  for (const profile of PROFILE_NAMES) {
    assert.deepEqual(missingForProfile(profile, part).filter((id) => !ABSENT_HERE.includes(id)), [],
      `${profile} names a component this checkout cannot install for an unexplained reason`);
  }
});
