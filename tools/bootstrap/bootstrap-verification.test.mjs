// The three things Cell 5 lets an install DO to a target's tooling, each tested at the boundary
// where it decides: the verification contract (what may become mandatory), the git hooks (one
// local config key, under five conditions) and the additive CI workflow (one new file, never an
// edit). The gate-side validation of the contract lives in `tests/verification-contract.test.mjs`,
// which is the one file allowed to import both sides.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './main.mjs';
import { HOOKS_ARGV, activateHooks, compositionPlan } from './integrate-hooks.mjs';
import { PROVIDER_SNIPPETS, proposeWorkflow, runLineFor, stepsFor } from './integrate-ci.mjs';
import { contractDetail } from './apply-integrations.mjs';
import { contractLines } from './verification.mjs';
import { CI_WORKFLOW_FILE } from './plan-constants.mjs';
import { cleanup, makeTarget } from './fixtures/temp.mjs';
import { makeFixture } from './fixtures/projects.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });
const readTemplate = (/** @type {string} */ rel) => readFileSync(join(ROOT, ...rel.split('/')), 'utf8');

/** @param {string[]} args @returns {{ code: number, all: string }} */
function run(args) {
  let all = '';
  const write = (/** @type {string} */ text) => { all += text; return true; };
  return { code: main(['node', 'cli.mjs', ...args], { stdout: { write }, stderr: { write }, env: { ...ENV } }), all };
}

/** The five conditions, as one call. @param {object} [over] */
const hooks = (over = {}) => activateHooks({
  targetRoot: 'nowhere', machinery: 'none', chosen: new Set(['article-8']),
  approvals: new Set(['hooks']), confirm: true,
  workTree: () => true, hooksPath: () => null,
  exec: () => ({ ok: true, status: 0, stdout: '', stderr: '', truncated: false, errorCode: null }),
  ...over,
});

test('hooks · core.hooksPath is set only when all five conditions hold at once', () => {
  /** @type {string[][]} */
  const ran = [];
  const record = (/** @type {ReadonlyArray<string>} */ argv) => {
    ran.push([...argv]);
    return { ok: true, status: 0, stdout: '', stderr: '', truncated: false, errorCode: null };
  };
  const applied = hooks({ exec: record });
  assert.equal(applied.status, 'applied');
  assert.match(applied.detail, /core\.hooksPath=\.githooks \(previously unset\)/);
  assert.deepEqual(ran, [[...HOOKS_ARGV]], 'one local git config key, as an argv, and nothing else');
  assert.match(String(applied.limitations[0]), /git update-index --chmod=\+x/);
  // Each condition, removed one at a time.
  assert.equal(hooks({ chosen: new Set() }).status, 'skipped');
  for (const over of [{ approvals: new Set() }, { confirm: false }, { workTree: () => false }]) {
    const outcome = hooks(over);
    assert.equal(outcome.status, 'proposed', JSON.stringify(over));
    assert.match(outcome.detail, /git config core\.hooksPath \.githooks/, 'the command is still shown');
  }
  assert.equal(hooks({ exec: () => ({ ok: false, status: 1, stdout: '', stderr: '', truncated: false, errorCode: null }) }).status, 'proposed');
});

test('hooks · an existing hook setup is never overwritten, and gets a composition plan', () => {
  const taken = hooks({ hooksPath: () => '.husky/_' });
  assert.equal(taken.status, 'proposed');
  assert.match(taken.detail, /already set to "\.husky\/_"/);
  for (const machinery of ['husky', 'lefthook', 'pre-commit', 'native', 'unknown']) {
    const outcome = hooks({ machinery });
    assert.equal(outcome.status, 'proposed');
    assert.match(outcome.detail, /Composition plan/);
    assert.match(outcome.detail, /authorization\.mjs/, `${machinery} must say which command to compose`);
  }
  assert.match(compositionPlan('husky'), /\.husky\/pre-commit/);
  assert.match(compositionPlan('lefthook'), /lefthook\.yml/);
  assert.match(compositionPlan('nothing-like-this'), /was not identified/);
});

test('ci · an argv becomes a quoted run line, or it is refused', () => {
  assert.equal(runLineFor(['npm', 'test']), '"\'npm\' \'test\'"');
  assert.equal(runLineFor(['node', 'tools/cellmode/cli.mjs', 'check']), '"\'node\' \'tools/cellmode/cli.mjs\' \'check\'"');
  assert.equal(runLineFor(['sh', '-c', 'rm -rf /']), null, 'a space in an argument is refused, not quoted');
  assert.equal(runLineFor(['npm', 'test"; rm -rf /']), null);
  assert.equal(runLineFor([]), null);
  const steps = stepsFor([{ id: 'unit', argv: ['npm', 'test'] }, { id: 'bad', argv: ['x y'] }]);
  assert.deepEqual([...steps.refused], ['bad']);
  assert.match(steps.text, /^ {6}- name: unit\n {8}run: "'npm' 'test'"\n$/);
  assert.equal(stepsFor([]).text, '');
  assert.ok(Object.keys(PROVIDER_SNIPPETS).includes('gitlab-ci'));
});

test('ci · the workflow is written only with the approval, and never over an existing file', () => {
  const target = makeTarget('ci');
  try {
    const base = { targetRoot: target, chosen: new Set(['article-8']), projectName: 'demo app',
      mandatory: [{ id: 'unit', argv: ['npm', 'test'] }], providers: ['gitlab-ci'], readTemplate };
    const refused = proposeWorkflow({ ...base, approvals: new Set(), confirm: true });
    assert.equal(refused.status, 'proposed');
    assert.deepEqual([...refused.files], []);
    assert.match(refused.detail, /gitlab-ci/, 'another provider gets a snippet, never a file');
    assert.deepEqual([...proposeWorkflow({ ...base, approvals: new Set(['ci-workflow']), confirm: false }).files], []);
    const made = proposeWorkflow({ ...base, approvals: new Set(['ci-workflow']), confirm: true });
    assert.equal(made.status, 'applied');
    const yaml = String(made.files[0]?.bytes);
    assert.equal(made.files[0]?.path, CI_WORKFLOW_FILE);
    assert.match(yaml, /permissions:\n {2}contents: read/);
    assert.match(yaml, /actions\/checkout@[0-9a-f]{40} # v/);
    assert.match(yaml, /actions\/setup-node@[0-9a-f]{40} # v/);
    assert.match(yaml, /run: "'npm' 'test'"/);
    assert.match(yaml, /run: "'node' 'tools\/gates\/ci-trailer\.mjs'"/);
    assert.equal(yaml.includes('${{'), false, 'no expression at all, so no secret and no fork input');
    assert.equal(yaml.includes('pull_request_target'), false);
    assert.match(made.detail, /1 mandatory check step/);
  } finally {
    cleanup(target);
  }
});

test('ci · a workflow that is already there is proposed, never replaced', () => {
  const target = makeFixture('node', { '.github/workflows/cellular-verify.yml': 'name: mine\n' });
  try {
    const outcome = proposeWorkflow({ targetRoot: target, chosen: new Set(['article-8']),
      approvals: new Set(['ci-workflow']), confirm: true, mandatory: [], projectName: 'demo',
      providers: ['github-actions'], readTemplate });
    assert.equal(outcome.status, 'proposed');
    assert.deepEqual([...outcome.files], []);
    assert.match(outcome.detail, /never replaces or edits a workflow/);
    assert.equal(readFileSync(join(target, '.github', 'workflows', 'cellular-verify.yml'), 'utf8'), 'name: mine\n');
  } finally {
    cleanup(target);
  }
});

test('contract · what the install reports about what it did and did not establish', () => {
  assert.match(contractDetail(undefined), /FAILS CLOSED/);
  const built = { checks: [{ status: 'VERIFIED', mandatory: true }, { status: 'INFERRED', mandatory: false }] };
  assert.match(contractDetail(built), /2 check\(s\), 1 VERIFIED .*, 1 mandatory by explicit human approval/);
  assert.match(contractDetail({ checks: [] }), /0 mandatory\. Final verification FAILS CLOSED/);
  const lines = contractLines({ checks: [{ id: 'unit', status: 'INFERRED', mandatory: false, argv: ['npm', 'test'] }] },
    'vault/verification.json').join('\n');
  assert.match(lines, /unit \[INFERRED\]: npm test/);
  assert.match(lines, /NEXT STEP/);
});

test('cli · --mandatory needs --confirm, and an id nobody discovered is a refusal', () => {
  const target = makeFixture('node');
  try {
    const five = run(['existing', target, '--profile', 'minimal', '--mandatory', 'npm-test']);
    assert.equal(five.code, 5, five.all);
    assert.match(five.all, /needs --confirm/);
    assert.equal(run(['existing', target, '--profile', 'minimal', '--mandatory', 'npm-test', '--dry-run']).code, 5,
      'a dry run is not an exception: the flag means an approval either way');
    const one = run(['existing', target, '--profile', 'minimal', '--mandatory', 'npm-deploy', '--confirm']);
    assert.equal(one.code, 1, one.all);
    assert.match(one.all, /npm-deploy/);
    assert.match(one.all, /npm-test/, 'the refusal names the ids that DO exist');
    const newer = run(['new', target, '--profile', 'minimal', '--mandatory', 'npm-test', '--confirm']);
    assert.equal(newer.code, 1, 'new discovers nothing, so it can approve nothing');
  } finally {
    cleanup(target);
  }
});
