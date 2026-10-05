// The Builder's CLI, end to end on a throwaway vault: one idea becomes an approved contract, a
// 📋 planned first cell and an exported prompt.
//
// RULE FOR THIS FILE: it writes exclusively inside the directory `mkdtemp` just created for it
// under `os.tmpdir()`, bootstrapped with cellmode's OWN `writeSkeleton`, and removes exactly
// that directory after a prefix check — the discipline of accept.test.mjs and
// tools/gates/removal-rehearsal.mjs. The repository's real `vault/` is never touched.
//
// THE TWO ASSERTIONS THAT MATTER MOST are both about what the CLI does NOT do: `approve` without
// `--confirm` exits 5 and writes no contract, and `cell --accept --confirm` leaves `log.md`
// byte-identical with no 🔵 row — a planned cell never ran and is not active.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseIndex } from '../cellmode/index-table.mjs';
import { writeSkeleton } from '../cellmode/state.mjs';
import { freshRoot, hashTree, runCli } from './fixtures/cli-harness.mjs';
import { simpleNew } from './fixtures/index.mjs';

const PREFIX = 'builder-cli-';
/** @type {string[]} */
const created = [];

test.after(() => {
  for (const root of created) {
    assert.ok(root.includes(PREFIX), `refusing to remove ${root}`);
    rmSync(root, { recursive: true, force: true });
  }
});

/** A temporary root with an empty cellmode vault in it. @returns {string} */
function freshVault() {
  const root = freshRoot(PREFIX, created);
  writeSkeleton(root);
  return root;
}

/** @type {(root: string, ...names: string[]) => string} */
const read = (root, ...names) => readFileSync(join(root, ...names), 'utf8');

/** The index as ROWS. The skeleton's own legend line names every status, so a search of the
 * whole file would find a 🔵 that is documentation. @type {(root: string) => string[]} */
const statuses = (root) => parseIndex(read(root, 'vault', 'state', 'INDEX.md'))
  .map((row) => row.status);

/** Every scripted answer of the easy scenario, through the CLI. A list answer separates its
 * items with ";", because a shell argument is one line. @param {string} root @returns {void} */
function playSimpleNew(root) {
  for (const answer of simpleNew.answers) {
    const step = runCli(['answer', answer.questionId, answer.text.replaceAll('\n', '; ')], root);
    assert.equal(step.code, 0, `${answer.questionId}: ${step.all}`);
  }
}

/** @returns {string} a root whose contract is approved */
function approvedVault() {
  const root = freshVault();
  assert.equal(runCli(['start', 'new', '--name', 'Task List'], root).code, 0);
  playSimpleNew(root);
  assert.equal(runCli(['approve', '--confirm'], root).code, 0);
  return root;
}

test('cli · a new project walks from the first question to an approved contract', () => {
  const root = freshVault();
  const start = runCli(['start', 'new', '--name', 'Task List'], root);
  assert.equal(start.code, 0, start.all);
  assert.match(start.out, /\[objective\]/);
  assert.match(start.out, /vault\/builder\/draft\.json/);
  assert.equal(existsSync(join(root, 'vault', 'builder', 'draft.json')), true);

  playSimpleNew(root);
  const status = runCli(['status'], root);
  assert.equal(status.code, 0, status.all);
  assert.match(status.out, /Blockers \(0\):/);
  assert.match(status.out, /Known: \d+ DECLARED/);

  const asked = runCli(['approve'], root);
  assert.equal(asked.code, 5, asked.all);
  assert.match(asked.out, /Readiness: ready/);
  assert.match(asked.out, /Publication check: passed/);
  assert.equal(existsSync(join(root, 'vault', 'project-contract.json')), false,
    'approve without --confirm must write nothing');

  const done = runCli(['approve', '--confirm'], root);
  assert.equal(done.code, 0, done.all);
  assert.match(done.out, /Approval does not authorize committing vault\/project-contract\.json/);
  assert.equal(JSON.parse(read(root, 'vault', 'project-contract.json')).approval.approved, true);
});

test('cli · a proposed decision is pending until the human confirms a verdict', () => {
  const root = freshVault();
  runCli(['start', 'new', '--name', 'Reading Group'], root);
  runCli(['answer', 'objective', 'A place to share notes about one text.'], root);
  // "I do not know" records a PROPOSED recommendation; a decision is how it may be promoted.
  runCli(['answer', 'technologies', 'I do not know'], root);
  const recommended = JSON.parse(read(root, 'vault', 'builder', 'draft.json'))
    .contract.technologies.proposed[0];
  assert.equal(recommended.status, 'PROPOSED');
  const proposed = runCli(['decide', 'propose', '--question', 'Which runtime?',
    '--proposal', recommended.value, '--field', 'technologies.proposed'], root);
  assert.equal(proposed.code, 0, proposed.all);
  assert.match(proposed.out, /decision D1 as pending/);
  assert.match(runCli(['status'], root).out, /Pending decisions \(1\):/);

  assert.equal(runCli(['decide', 'D1', 'approve'], root).code, 5, 'a verdict needs --confirm');
  const settled = runCli(['decide', 'D1', 'approve', '--confirm'], root);
  assert.equal(settled.code, 0, settled.all);
  const draft = JSON.parse(read(root, 'vault', 'builder', 'draft.json'));
  assert.equal(draft.contract.decisions[0].status, 'approved');
  assert.deepEqual(draft.contract.technologies.approved.map((/** @type {any} */ e) => e.basis),
    ['decision:D1']);
});

test('cli · the first cell is previewed, then planned 📋 — never opened', () => {
  const root = approvedVault();
  const logBefore = read(root, 'vault', 'state', 'log.md');
  const preview = runCli(['cell'], root);
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /# PROPOSED — not approved, not active/);
  assert.match(preview.out, /Nothing was written\./);
  assert.deepEqual(statuses(root), [], 'a preview creates no row');

  assert.equal(runCli(['cell', '--accept'], root).code, 5, 'planning a cell needs --confirm');
  const planned = runCli(['cell', '--accept', '--confirm'], root);
  assert.equal(planned.code, 0, planned.all);
  assert.match(planned.out, /Planned, not active\. To start it: node tools\/cellmode\/cli\.mjs open/);
  assert.match(planned.out, /vault\/state\/cells\/.+\.md/);

  assert.deepEqual(statuses(root), ['📋'], 'one planned row, nothing active');
  assert.equal(read(root, 'vault', 'state', 'log.md'), logBefore,
    'a planned cell never ran, so log.md is byte-identical');
});

test('cli · prompt prints to stdout for both implemented adapters and writes nothing', () => {
  const root = approvedVault();
  const before = hashTree(root);
  const neutral = runCli(['prompt'], root);
  assert.equal(neutral.code, 0, neutral.all);
  assert.match(neutral.out, /^# Cell prompt — Cellular Mode/);
  assert.match(neutral.out, /AGENTS\.md/);

  const claude = runCli(['prompt', '--adapter', 'claude-code'], root);
  assert.equal(claude.code, 0, claude.all);
  assert.match(claude.out, /\.claude\/skills\//);
  assert.notEqual(claude.out, neutral.out, 'an adapter points somewhere else');

  assert.deepEqual(hashTree(root), before, '`prompt` is an export, not a write');
  const listed = runCli(['adapters'], root);
  assert.match(listed.out, /^neutral · implemented/m);
  assert.match(listed.out, /cursor · proposed/);
});

test('cli · tired status is at most five lines and next drops the help line', () => {
  const root = approvedVault();
  const status = runCli(['status', '--mode', 'tired'], root);
  assert.equal(status.code, 0, status.all);
  const lines = status.out.trimEnd().split('\n');
  assert.ok(lines.length <= 5, `tired status printed ${lines.length} lines:\n${status.out}`);

  const fresh = freshVault();
  runCli(['start', 'new', '--name', 'Task List'], fresh);
  const plenty = runCli(['next'], fresh);
  const short = runCli(['next', '--mode', 'tired'], fresh);
  assert.equal(short.out.trimEnd().split('\n').length, 1, short.out);
  assert.equal(plenty.out.trimEnd().split('\n')[0], short.out.trimEnd(), 'same question');
  assert.ok(plenty.out.length > short.out.length, 'ready mode carries the help line');
});
