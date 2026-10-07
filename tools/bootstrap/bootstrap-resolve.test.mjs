// Resolution against the real catalog and against synthetic ones: every component present for a
// stated reason, every component absent for a stated reason, and every incoherent request refused
// with a code rather than a guess.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './catalog.mjs';
import { diskSource } from './source-read.mjs';
import { CODES } from './errors.mjs';
import { makeFacts, validateFacts } from './target-facts.mjs';
import { PROFILE_NAMES } from './profiles.mjs';
import { resolveSelection } from './resolve.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const catalog = loadCatalog(ROOT, diskSource(ROOT));
assert.equal(catalog.ok, true, 'the real catalog must load before resolution can be tested');

/** @param {string} id @param {Record<string, unknown>} [extra] @returns {Record<string, unknown>} */
const fake = (id, extra = {}) => ({ id, dependsOn: [], optionalDependsOn: [], conflicts: [], host: { requires: [] }, ...extra });
/** @param {ReadonlyArray<Record<string, unknown>>} list @returns {{ ok: true, byId: Record<string, Record<string, unknown>> }} */
const synthetic = (list) => ({ ok: true, byId: Object.fromEntries(list.map((c) => [String(c.id), c])) });
/** @param {() => unknown} run @param {string} code @returns {void} */
function refuses(run, code) {
  assert.throws(run, (/** @type {{ name?: string, code?: string }} */ error) => {
    assert.equal(error.name, 'BootstrapError');
    assert.equal(error.code, code);
    return true;
  });
}
/** @param {import('./resolve.mjs').Selection} selection @returns {ReadonlyArray<string>} */
const idsOf = (selection) => selection.components.map((entry) => entry.id);

test('on a fresh directory that is not a repository, every profile reports article-8 as skipped', () => {
  for (const profile of PROFILE_NAMES) {
    const selection = resolveSelection(catalog, { profile }, makeFacts());
    assert.ok(!idsOf(selection).includes('article-8'), `${profile} must not install article-8 without git`);
    assert.deepEqual(selection.skipped.filter((entry) => entry.id === 'article-8'),
      [{ id: 'article-8', reason: 'condition git not met' }],
      `${profile} must say WHY article-8 is absent, not merely omit it`);
  }
});

test('on a git repository, every profile installs article-8 with the condition as its reason', () => {
  for (const profile of PROFILE_NAMES) {
    const selection = resolveSelection(catalog, { profile }, makeFacts({ isGitRepo: true }));
    const entry = selection.components.find((c) => c.id === 'article-8');
    assert.deepEqual(entry, { id: 'article-8', reason: 'condition git' });
    assert.deepEqual(selection.skipped, [], `${profile} on a repository has nothing to skip`);
  }
});

test('a profile lists its own components in dependency order, dependencies before dependents', () => {
  const selection = resolveSelection(catalog, { profile: 'full' }, makeFacts({ isGitRepo: true }));
  const order = idsOf(selection);
  for (const { id } of selection.components) {
    for (const dependency of /** @type {string[]} */ (catalog.ok ? catalog.byId[id]?.dependsOn ?? [] : [])) {
      assert.ok(order.indexOf(dependency) < order.indexOf(id), `${dependency} must precede ${id}`);
    }
  }
});

test('a custom selection SHOWS every dependency it had to add, and never adds an optional one', () => {
  const selection = resolveSelection(catalog, { profile: 'custom', components: ['observer'] }, makeFacts());
  assert.deepEqual(selection.added.map((entry) => entry.id), ['cellmode-cli', 'method-core', 'upp']);
  assert.deepEqual(selection.added.filter((entry) => entry.id === 'upp'), [{ id: 'upp', by: 'observer' }]);
  assert.equal(selection.components.find((c) => c.id === 'method-core')?.reason, 'dependency of cellmode-cli');
  assert.ok(!idsOf(selection).includes('adaptive'),
    'observer optionalDependsOn adaptive: optional means "honoured if selected", never "pulled in"');
});

test('an optional dependency that IS selected stays, with its own reason', () => {
  const selection = resolveSelection(catalog, { profile: 'custom', components: ['observer', 'adaptive'] }, makeFacts());
  assert.equal(selection.components.find((c) => c.id === 'adaptive')?.reason, 'requested');
});

test('a declared conflict refuses and names the pair; it is never resolved by picking a side', () => {
  const catalogue = synthetic([fake('left', { conflicts: ['right'] }), fake('right')]);
  refuses(() => resolveSelection(catalogue, { profile: 'custom', components: ['left', 'right'] }, makeFacts()),
    CODES.CONFLICT);
  try {
    resolveSelection(catalogue, { profile: 'custom', components: ['right', 'left'] }, makeFacts());
  } catch (error) {
    assert.deepEqual(/** @type {{ details: { pairs?: string[] } }} */ (error).details.pairs, ['left + right'],
      'the pair is reported in a stable order whichever way it was requested');
  }
});

test('asking for article-8 on a directory without git is HOST_UNSUPPORTED, not a silent skip', () => {
  refuses(() => resolveSelection(catalog, { profile: 'custom', components: ['article-8'] }, makeFacts()),
    CODES.HOST_UNSUPPORTED);
});

test('a dependency whose host requirement is unmet refuses rather than installing half a component', () => {
  const catalogue = synthetic([
    fake('leaf', { host: { requires: ['git'] } }),
    fake('trunk', { dependsOn: ['leaf'] }),
  ]);
  refuses(() => resolveSelection(catalogue, { profile: 'custom', components: ['trunk'] }, makeFacts()),
    CODES.HOST_UNSUPPORTED);
  const fine = resolveSelection(catalogue, { profile: 'custom', components: ['trunk'] }, makeFacts({ isGitRepo: true }));
  assert.deepEqual(idsOf(fine), ['leaf', 'trunk']);
});

test('adapters arrive only for a tool the target already uses, or when asked for by name', () => {
  const none = resolveSelection(catalog, { profile: 'minimal' }, makeFacts());
  assert.ok(!idsOf(none).includes('claude-code-adapter'));
  assert.ok(!idsOf(none).includes('cursor-adapter'));
  const claude = resolveSelection(catalog, { profile: 'minimal' }, makeFacts({ tools: { claude: true, cursor: false } }));
  assert.equal(claude.components.find((c) => c.id === 'claude-code-adapter')?.reason, 'condition claude');
  assert.ok(!idsOf(claude).includes('cursor-adapter'), 'one tool detected must not install the other adapter');
  const asked = resolveSelection(catalog, { profile: 'minimal', components: ['cursor-adapter'] }, makeFacts());
  assert.equal(asked.components.find((c) => c.id === 'cursor-adapter')?.reason, 'requested');
});

test('the same request resolves to the identical document every time', () => {
  const facts = makeFacts({ isGitRepo: true, tools: { claude: true, cursor: true } });
  const first = resolveSelection(catalog, { profile: 'full' }, facts);
  const second = resolveSelection(catalog, { profile: 'full' }, facts);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('a request that cannot be read refuses with the code the contract maps to exit 1', () => {
  refuses(() => resolveSelection(catalog, {}, makeFacts()), CODES.USAGE);
  refuses(() => resolveSelection(catalog, { profile: 'custom' }, makeFacts()), CODES.USAGE);
  refuses(() => resolveSelection(catalog, { profile: 'everything' }, makeFacts()), CODES.UNKNOWN_PROFILE);
  refuses(() => resolveSelection(catalog, { components: ['not-a-component'] }, makeFacts()), CODES.UNKNOWN_COMPONENT);
  refuses(() => resolveSelection({ ok: false }, { profile: 'minimal' }, makeFacts()), CODES.BAD_MANIFEST);
});

test('a target path that escapes or hides is refused before any planning sees it', () => {
  for (const path of ['../x', '/etc/passwd', 'a\u0000b', 'a\\b', './x', 'ok.md\n  all gates green']) {
    const result = validateFacts({ ...makeFacts(), existingFiles: [path] });
    assert.equal(result.ok, false, `existingFiles must refuse ${JSON.stringify(path)}`);
    refuses(() => resolveSelection(catalog, { profile: 'minimal' }, { ...makeFacts(), existingFiles: [path] }),
      CODES.BAD_FACTS);
  }
  assert.equal(validateFacts({ ...makeFacts(), existingFiles: ['docs/ok.md'] }).ok, true);
  assert.equal(validateFacts({ ...makeFacts(), hookMachinery: 'invented' }).ok, false);
  assert.equal(validateFacts({ ...makeFacts(), surprise: 1 }).ok, false);
});
