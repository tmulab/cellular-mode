// The plan's one promise: an existing file is never created. Each test below is one branch of
// that promise, plus the integrations and the refusals that go with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { expandSelection, loadCatalog } from './catalog.mjs';
import { diskSource } from './source-read.mjs';
import { CODES, EXIT_FOR, exitFor } from './errors.mjs';
import { makeFacts } from './target-facts.mjs';
import { resolveSelection } from './resolve.mjs';
import { buildPlan } from './plan.mjs';
import { renderPlan } from './render-plan.mjs';
import { GITIGNORE, INSTALL_MANIFEST, PLANNER, SCRATCH_DIR } from './plan-constants.mjs';
import { missingForProfile, partition, unavailableFor } from './fixtures/availability.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const source = diskSource(ROOT);
const catalog = loadCatalog(ROOT, source);
assert.equal(catalog.ok, true, 'the real catalog must load before planning can be tested');
// Expansion goes through the PRODUCT path (`expandSelection`), so a profile naming a component
// this checkout cannot install refuses here exactly as it does in `preparePlan`. `absent` names the
// profiles whose present-world claims cannot be made in a checkout that deleted an optional module
// — a removal rehearsal creates one on purpose — and each affected test branches on it explicitly.
const part = partition(catalog, source);
/** @param {string} profile @returns {ReadonlyArray<string>} */
const absent = (profile) => missingForProfile(profile, part);

/** @param {Partial<import('./target-facts.mjs').TargetFacts>} overrides @param {string} [profile] */
function planFor(overrides = {}, profile = 'minimal') {
  const facts = makeFacts(overrides);
  const selection = resolveSelection(catalog, { profile }, facts);
  const expanded = expandSelection(catalog.ok ? catalog.byId : {},
    selection.components.map(({ id }) => id), source);
  return buildPlan({ catalog, selection, facts, expanded });
}
/** @param {import('./plan.mjs').Plan} plan @param {string} path */
const at = (plan, path) => plan.actions.filter((entry) => entry.path === path);
/** @param {() => unknown} run @param {string} code @param {number} exit @returns {void} */
function refuses(run, code, exit) {
  assert.throws(run, (/** @type {{ code?: string, exitCode?: number }} */ error) => {
    assert.equal(error.code, code);
    assert.equal(error.exitCode, exit);
    return true;
  });
}

test('an empty repository gets only creations, no conflict and nothing left untouched', () => {
  const plan = planFor({ isGitRepo: true });
  assert.equal(plan.schema, 'cellular-mode/install-plan');
  assert.equal(plan.version, 1);
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.untouchedCount, 0);
  assert.ok(plan.actions.every((entry) => entry.kind === 'create'));
  assert.deepEqual(at(plan, INSTALL_MANIFEST).map((a) => [a.component, a.kind, a.mode]),
    [[PLANNER, 'create', 'generate']], 'the install record is always planned');
  assert.equal(at(plan, SCRATCH_DIR).length, 1, 'the git-ignored scratch directory is always planned');
});

test('an existing AGENTS.md or .gitignore is modified by an appended block, and that needs approval', () => {
  const plan = planFor({ isGitRepo: true, existingFiles: ['AGENTS.md', GITIGNORE, 'README.md'] });
  for (const path of ['AGENTS.md', GITIGNORE]) {
    assert.deepEqual(at(plan, path).map((entry) => entry.kind), ['modify-block'], `${path} must be modified, not created`);
    assert.ok(plan.approvals.some((entry) => entry.action === `append a managed block to ${path}`),
      `${path} must appear in the approvals`);
    assert.deepEqual(plan.conflicts.filter((entry) => entry.path === path), [],
      'a managed block is understood, so it is an approval and not a conflict');
  }
  assert.equal(plan.untouchedCount, 1, 'README.md is neither touched nor claimed');
  assert.deepEqual(plan.untouched, ['README.md']);
});

test('an existing file that a component would have COPIED is a conflict, never an overwrite', () => {
  const plan = planFor({ isGitRepo: true, existingFiles: ['skills/cell/SKILL.md'] });
  assert.deepEqual(at(plan, 'skills/cell/SKILL.md').map((entry) => entry.kind), ['skip-existing']);
  assert.deepEqual(plan.conflicts, [{ path: 'skills/cell/SKILL.md', reason: 'exists — human review' }]);
  assert.ok(plan.actions.every((entry) => !(entry.kind === 'create' && entry.path === 'skills/cell/SKILL.md')));
});

test('an existing file that a component would have GENERATED is a proposed patch', () => {
  const plan = planFor({ isGitRepo: true, existingFiles: ['vault/verification.json'] });
  assert.deepEqual(at(plan, 'vault/verification.json').map((entry) => entry.kind), ['propose-patch']);
  assert.deepEqual(plan.conflicts, [], 'a generated artefact can be shown as a patch, so it is not a stop');
});

test('a directory the plan would generate, already holding files, stops for review', () => {
  const plan = planFor({ isGitRepo: true, existingFiles: ['vault/state/log.md'] });
  assert.deepEqual(at(plan, 'vault/state/').map((entry) => entry.kind), ['skip-existing']);
  assert.ok(plan.conflicts.some((entry) => entry.path === 'vault/state/'));
  assert.equal(plan.untouchedCount, 0, 'a file under a planned directory is claimed, not silently untouched');
});

test('an installation already recorded in the target refuses with EXISTING_INSTALL', () => {
  refuses(() => planFor({ isGitRepo: true, hasInstallManifest: true }), CODES.EXISTING_INSTALL, 3);
});

test('existing hook machinery means the scripts are copied and NOT activated', () => {
  const plan = planFor({ isGitRepo: true, hookMachinery: 'husky' });
  const hooks = plan.integrations.find((entry) => entry.kind === 'hooks');
  assert.equal(hooks?.status, 'propose-only');
  assert.match(String(hooks?.detail), /husky/);
  assert.deepEqual(plan.commandsProposed, [], 'nothing may be proposed that would change how git runs hooks');
  assert.ok(!plan.approvals.some((entry) => entry.action.includes('core.hooksPath')),
    'there is no activation to approve when the target already has machinery');
  assert.ok(plan.actions.some((entry) => entry.path === '.githooks/pre-commit' && entry.kind === 'create'),
    'the scripts are still copied: they are inert until a hook path points at them');
});

test('a repository with no hook machinery may be offered core.hooksPath, with approval', () => {
  const plan = planFor({ isGitRepo: true });
  assert.equal(plan.integrations.find((entry) => entry.kind === 'hooks')?.status, 'apply-with-confirm');
  assert.deepEqual(plan.commandsProposed.map((entry) => entry.argv),
    [['git', 'config', 'core.hooksPath', '.githooks']]);
  assert.ok(plan.commandsProposed.every((entry) => entry.status === 'PROPOSED'));
  assert.ok(plan.approvals.some((entry) => entry.action === 'set core.hooksPath to .githooks'));
});

test('without article-8 there is no hook plan at all, and CI is only ever proposed', () => {
  const missing = absent('standard');
  if (missing.length > 0) {
    assert.throws(() => planFor({}, 'standard'), unavailableFor(String(missing[0])),
      'a profile naming a component this checkout lacks must REFUSE, never plan a smaller install');
    return;
  }
  const plan = planFor({}, 'standard');
  assert.equal(plan.integrations.find((entry) => entry.kind === 'hooks')?.status, 'skip');
  assert.equal(plan.integrations.find((entry) => entry.kind === 'ci')?.status, 'propose-only');
  const ci = planFor({ isGitRepo: true, ci: ['github-actions'] }, 'standard');
  assert.equal(ci.integrations.find((entry) => entry.kind === 'ci')?.status, 'propose-only');
  assert.match(String(ci.integrations.find((entry) => entry.kind === 'ci')?.detail), /github-actions/);
});

test('a detected tool adds its adapter integration, and that integration needs confirmation', () => {
  const plan = planFor({ isGitRepo: true, tools: { claude: true, cursor: false } });
  const adapters = plan.integrations.filter((entry) => entry.kind === 'adapter');
  assert.deepEqual(adapters.map((entry) => entry.status), ['apply-with-confirm']);
  assert.match(String(adapters[0]?.detail), /claude-code-adapter/);
});

test('the untouched list is capped for reading while the count stays whole', () => {
  const many = Array.from({ length: 35 }, (_, i) => `src/file-${String(i).padStart(2, '0')}.ts`);
  const plan = planFor({ isGitRepo: true, existingFiles: many });
  assert.equal(plan.untouchedCount, 35);
  assert.equal(plan.untouched.length, 20);
  assert.deepEqual([...plan.untouched], [...plan.untouched].sort());
});

test('the same inputs build the identical plan and render identically', () => {
  const build = () => planFor({ isGitRepo: true, existingFiles: ['AGENTS.md'], tools: { claude: true, cursor: true } }, 'full');
  const missing = absent('full');
  if (missing.length > 0) {
    assert.throws(build, unavailableFor(String(missing[0])));
    return;
  }
  const first = build();
  const second = build();
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(renderPlan(first), renderPlan(second));
});

test('every refusal code maps to a declared exit status, and an unmapped one is never success', () => {
  for (const code of Object.values(CODES)) {
    assert.equal(typeof exitFor(code), 'number', `${code} must have an exit status`);
    assert.notEqual(exitFor(code), 0, `${code} is a refusal: it may never exit 0`);
  }
  assert.deepEqual([...new Set(Object.values(EXIT_FOR))].sort(), [1, 2, 3, 5]);
  assert.equal(exitFor('INVENTED_LATER'), 2);
  assert.equal(exitFor(undefined), 2);
  refuses(() => buildPlan({
    catalog: { ok: false }, facts: makeFacts(),
    selection: { profile: 'minimal', components: [], added: [], skipped: [], conflicts: [] },
  }), CODES.BAD_MANIFEST, 2);
});
