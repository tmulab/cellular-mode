// The dry-run text. Two claims are load-bearing here, and both are tested rather than asserted
// in prose: a declared mode changes WORDING AND LENGTH ONLY, never the set of decisions a human
// is shown; and a hostile filename cannot forge a line of the report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { expandSelection, loadCatalog } from './catalog.mjs';
import { diskSource } from './source-read.mjs';
import { makeFacts } from './target-facts.mjs';
import { resolveSelection } from './resolve.mjs';
import { buildPlan } from './plan.mjs';
import { RENDER_MODES, renderPlan } from './render-plan.mjs';
import { MODE_CAPS } from './plan-constants.mjs';
import { capList, controlProblem, plural, sanitize } from './display.mjs';
import { missingForProfile, partition, unavailableFor } from './fixtures/availability.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const source = diskSource(ROOT);
const catalog = loadCatalog(ROOT, source);
assert.equal(catalog.ok, true, 'the real catalog must load before rendering can be tested');
/** A plan through the PRODUCT expansion path, so a profile naming a component this checkout
 * cannot install REFUSES here exactly as it does in `preparePlan`.
 * @param {string} profile @param {import('./target-facts.mjs').TargetFacts} facts */
function planForProfile(profile, facts) {
  const selection = resolveSelection(catalog, { profile }, facts);
  const expanded = expandSelection(catalog.ok ? catalog.byId : {},
    selection.components.map(({ id }) => id), source);
  return buildPlan({ catalog, selection, facts, expanded });
}

const FACTS = makeFacts({
  isGitRepo: true,
  existingFiles: ['AGENTS.md', '.gitignore', 'skills/cell/SKILL.md', 'README.md', 'src/main.ts'],
  tools: { claude: true, cursor: false },
  ci: ['github-actions'],
});
/** The rendering claims below are about the RENDERER and need a plan with rich content; `standard`
 * is that plan in this repository. In a checkout that deleted an optional module — which a removal
 * rehearsal creates on purpose — `standard` cannot be planned at all, so the subject falls back to
 * `minimal` and the refusal becomes its own test below. The fallback is never silent: the test
 * asserts the subject IS `standard` whenever the checkout is complete. */
const STANDARD_MISSING = missingForProfile('standard', partition(catalog, source));
const PLAN_PROFILE = STANDARD_MISSING.length === 0 ? 'standard' : 'minimal';
const PLAN = planForProfile(PLAN_PROFILE, FACTS);

test('render · an unavailable component refuses the profile, never a smaller plan', () => {
  if (STANDARD_MISSING.length === 0) {
    assert.equal(PLAN_PROFILE, 'standard', 'a complete checkout always renders the standard plan');
    return;
  }
  assert.throws(() => planForProfile('standard', FACTS), unavailableFor(String(STANDARD_MISSING[0])));
});

/** Every bullet in a rendered plan, as a set. A bullet is a plan-derived fact; a heading is
 * wording. Comparing bullets is therefore exactly the mode-invariance question.
 * @param {string} text @returns {ReadonlyArray<string>} */
const bulletsOf = (text) => text.split('\n')
  .map((line) => line.trim())
  .filter((line) => line.startsWith('- '))
  .map((line) => line.slice(2))
  .sort();

test('with every path shown, every mode renders exactly the same set of facts', () => {
  const sets = RENDER_MODES.map((mode) => bulletsOf(renderPlan(PLAN, { mode: /** @type {never} */ (mode), verbose: true })));
  for (const [index, set] of sets.entries()) {
    assert.deepEqual(set, sets[0], `mode ${RENDER_MODES[index]} must show the same bullets as ${RENDER_MODES[0]}`);
  }
  assert.ok(sets[0] !== undefined && sets[0].length > 0);
});

test('no mode may hide a path, a conflict, an approval, an integration or a command', () => {
  for (const mode of RENDER_MODES) {
    const text = renderPlan(PLAN, { mode: /** @type {never} */ (mode) });
    for (const entry of PLAN.approvals) {
      assert.ok(text.includes(entry.action), `${mode} must show the approval "${entry.action}"`);
    }
    for (const entry of PLAN.conflicts) assert.ok(text.includes(entry.path), `${mode} must show conflict ${entry.path}`);
    for (const entry of PLAN.actions.filter((a) => a.kind !== 'create')) {
      assert.ok(text.includes(entry.path), `${mode} must show the ${entry.kind} on ${entry.path}`);
    }
    for (const entry of PLAN.integrations) assert.ok(text.includes(entry.detail), `${mode} must show ${entry.kind}`);
    for (const entry of PLAN.commandsProposed) assert.ok(text.includes(entry.argv.join(' ')));
    for (const entry of PLAN.verification) assert.ok(text.includes(entry.id));
    assert.ok(text.includes(`(${PLAN.approvals.length}):`), `${mode} must count the approvals`);
    assert.ok(text.includes(String(PLAN.untouchedCount)), `${mode} must report the untouched count`);
  }
});

test('a mode changes only how much of the one capped list is printed', () => {
  const creates = new Set(PLAN.actions.filter((entry) => entry.kind === 'create').map((entry) => entry.path));
  assert.ok(creates.size > MODE_CAPS.explore, 'the fixture must be big enough for capping to mean something');
  /** @param {string} text @returns {number} */
  const shownCreates = (text) => bulletsOf(text).filter((line) => creates.has(line.split('  ')[0] ?? '')).length;
  assert.equal(shownCreates(renderPlan(PLAN, { mode: 'tired' })), MODE_CAPS.tired);
  assert.equal(shownCreates(renderPlan(PLAN, { mode: 'ready' })), MODE_CAPS.ready);
  assert.equal(shownCreates(renderPlan(PLAN, { mode: 'explore' })), MODE_CAPS.explore);
  assert.equal(shownCreates(renderPlan(PLAN, { mode: 'tired', verbose: true })), creates.size);
  assert.ok(renderPlan(PLAN, { mode: 'tired' }).length < renderPlan(PLAN, { mode: 'ready' }).length);
  assert.match(renderPlan(PLAN, { mode: 'tired' }), /… and \d+ more paths/);
});

test('no mode declared, or a mode nobody implements, renders the default — never an inference', () => {
  assert.equal(renderPlan(PLAN), renderPlan(PLAN, { mode: 'ready' }));
  assert.equal(renderPlan(PLAN, { mode: /** @type {never} */ ('exhausted') }), renderPlan(PLAN, { mode: 'ready' }));
});

test('a filename carrying a newline is rendered inert, and cannot add a line to the report', () => {
  /** @type {import('./plan.mjs').Plan} */
  const forged = {
    ...PLAN,
    actions: Object.freeze([Object.freeze({
      path: 'ok.md\n  - every gate is green', component: 'method-core',
      kind: /** @type {'create'} */ ('create'), mode: /** @type {'copy'} */ ('copy'), reason: 'new file',
    })]),
    conflicts: Object.freeze([]), approvals: Object.freeze([]), commandsProposed: Object.freeze([]),
  };
  const text = renderPlan(forged, { verbose: true });
  assert.ok(!text.split('\n').some((line) => line.trim().startsWith('- every gate is green')),
    'the injected text must not become a bullet of its own');
  assert.ok(text.includes('\\u000a'), 'the newline must be shown as an escape');
  assert.equal(text.split('\n').filter((line) => line.trim().startsWith('- ok.md')).length, 1);
});

test('the display helpers escape, cap and count the same way everywhere', () => {
  assert.equal(sanitize('a\u0000b'), 'a\\u0000b');
  assert.equal(sanitize('a‮b'), 'a\\u202eb');
  assert.equal(sanitize('x'.repeat(300)).length, 160);
  assert.equal(sanitize('x'.repeat(300), 10), `${'x'.repeat(9)}…`);
  assert.equal(sanitize(undefined), 'undefined');
  assert.equal(controlProblem('plain/path.md'), null);
  assert.match(String(controlProblem('line\nbreak')), /\\u000a/);
  assert.match(String(controlProblem(7)), /string/);
  assert.deepEqual(capList([1, 2, 3], 2), { shown: [1, 2], hidden: 1 });
  assert.deepEqual(capList([1, 2, 3], -1), { shown: [1, 2, 3], hidden: 0 });
  assert.equal(plural(1, 'file'), '1 file');
  assert.equal(plural(0, 'file'), '0 files');
});

test('the minimal profile on an empty repository renders a plan a human can read at a glance', () => {
  const facts = makeFacts({ isGitRepo: true });
  const plan = planForProfile('minimal', facts);
  const text = renderPlan(plan);
  assert.match(text, /^Cellular Mode — installation plan\. This is a dry run: nothing is written\.$/m);
  assert.match(text, /^Selected profile: minimal$/m);
  assert.match(text, /^ {2}- article-8 — condition git$/m);
  assert.match(text, /^Conflicts needing a human \(0\):$/m);
  assert.match(text, /^ {2}- hooks \[apply-with-confirm\]/m);
  assert.match(text, /^ {2}- git config core\.hooksPath \.githooks \[PROPOSED\]$/m);
  assert.ok(!text.includes(ROOT), 'a plan never carries an absolute path from the machine that built it');
});
