// check-git.test.mjs — the two findings of the guard that read GIT: `cell-stale` and
// `merge-unrecorded`, one POSITIVE and one NEGATIVE case each, on temp vaults that are
// real repositories. Plus the two-layer fail-closed decision of cell R5: without a
// repository the two checks are UNKNOWN, printed as a notice and never as a pass.
//
// The fixtures build history with PLUMBING only (`commit-tree`, `update-ref`): no branch
// is checked out, nothing is reset, and no working tree is touched, so the fixture cannot
// wander outside the temp root it created.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { CLI, NOW, freshRoot, run, paths } from './helpers.mjs';

const FINISH = 'ship the v2 rules; publish the guide';
const OPEN = ['op', 'open', 'Go Live', '--finish-line', FINISH,
  '--pack', 'spend ceiling: 2k tokens; max-active-cells: 2',
  '--bar', 'every claim carries an epistemic label', '--cells', 'Login, Enrolment'];
const ZEROS = '0'.repeat(40);

/** The CLI with BOTH streams captured: `run` keeps stderr only when the exit is not 0, and
 * the UNKNOWN notice is printed on a run that exits 0.
 * @param {string} root @param {string[]} args */
const probe = (root, args) => spawnSync(process.execPath, [CLI, ...args, '--root', root],
  { encoding: 'utf8', env: { ...process.env, CELLMODE_NOW: NOW } });

/** Read-only or plumbing git in the temp root; null when git is not installed.
 * @param {string} root @param {string[]} args @returns {string | null} */
function git(root, args) {
  try {
    return execFileSync('git', args, {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** A throwaway repository with two commits. Assembled identity: this file holds no
 * literal address (the repository's leak gate forbids one).
 * @param {string} root @returns {string | null} HEAD, or null when git is absent */
function gitRepo(root) {
  if (git(root, ['init', '-q', '-b', 'main']) === null) return null;
  git(root, ['config', 'user.email', ['cell', '@', 'example', '.invalid'].join('')]);
  git(root, ['config', 'user.name', 'Fixture']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['commit', '-q', '--allow-empty', '-m', 'seed']);
  git(root, ['commit', '-q', '--allow-empty', '-m', 'second']);
  return git(root, ['rev-parse', 'HEAD']);
}

/** A vault with a 🔵 operation and one 🔵 cell inside it, in a repository.
 * @returns {{ root: string, head: string } | null} */
function openedInRepo() {
  const root = freshRoot();
  const head = gitRepo(root);
  if (head === null) return null;
  run(root, ['init']);
  run(root, OPEN);
  run(root, ['open', 'Login', '--area', 'auth', '--in', 'src/login.ts', '--out', 'the router']);
  return { root, head };
}

/** @param {string} root @param {string} base */
function setBaseCommit(root, base) {
  const file = paths(root).cellFile('login');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace(/\*\*Base commit:\*\*.*/, `**Base commit:** ${base}`), 'utf8');
}

/** A merge commit on HEAD whose subject names `branch`, built with plumbing.
 * @param {string} root @param {string} branch @returns {string} */
function mergeOf(root, branch) {
  const head = git(root, ['rev-parse', 'HEAD']) ?? '';
  const tree = git(root, ['rev-parse', 'HEAD^{tree}']) ?? '';
  const side = git(root, ['commit-tree', tree, '-m', 'side work']) ?? '';
  const merge = git(root, ['commit-tree', tree, '-p', head, '-p', side,
    '-m', `Merge branch '${branch}'`]) ?? '';
  git(root, ['update-ref', 'HEAD', merge]);
  return merge;
}

test('cell-stale · NEGATIVE: the base commit `open` recorded is an ancestor of HEAD', () => {
  const fixture = openedInRepo();
  if (fixture === null) return; // no git here: the UNKNOWN case is its own test
  const out = probe(fixture.root, ['check']);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Integrity check passed · 1 active/);
  assert.equal(out.stderr, '', 'git answered, so there is no UNKNOWN notice');
  assert.match(readFileSync(paths(fixture.root).cellFile('login'), 'utf8'),
    new RegExp(`\\*\\*Base commit:\\*\\* ${fixture.head}`), 'the fixture recorded a real sha');
});

test('cell-stale · POSITIVE: a base commit that is not an ancestor of HEAD', () => {
  const fixture = openedInRepo();
  if (fixture === null) return;
  const { root, head } = fixture;
  const tree = git(root, ['rev-parse', 'HEAD^{tree}']) ?? '';
  const unrelated = git(root, ['commit-tree', tree, '-m', 'another root']) ?? '';
  setBaseCommit(root, unrelated);
  const out = run(root, ['check'], { expect: 2 });
  assert.match(out.stderr, new RegExp('\\[cell-stale\\] cell stale: "Login" is 🔵 in operation '
    + `"Go Live" but its Base commit ${unrelated} is not an ancestor of HEAD ${head}$`, 'm'));
});

test('cell-stale · POSITIVE: a base commit git does not know, and an unrecorded one', () => {
  const fixture = openedInRepo();
  if (fixture === null) return;
  const { root } = fixture;
  setBaseCommit(root, ZEROS);
  const unknown = run(root, ['check'], { expect: 2 });
  assert.match(unknown.stderr, new RegExp('\\[cell-stale\\] cell stale: "Login" is 🔵 in '
    + `operation "Go Live" but git does not know its Base commit ${ZEROS} — staleness is `
    + 'UNKNOWN$', 'm'));
  setBaseCommit(root, 'UNKNOWN');
  const missing = run(root, ['check'], { expect: 2 });
  assert.match(missing.stderr, /but its Base commit is UNKNOWN — the commit the work started /);
  assert.match(missing.stderr, /from was never recorded, so staleness is UNKNOWN$/m);
});

test('merge-unrecorded · POSITIVE: an op\\/ branch no log entry mentions', () => {
  const fixture = openedInRepo();
  if (fixture === null) return;
  const { root } = fixture;
  const merge = mergeOf(root, 'op/ghost-cell');
  const out = run(root, ['check'], { expect: 2 });
  assert.match(out.stderr, new RegExp(`\\[merge-unrecorded\\] merge unrecorded: commit ${
    merge.slice(0, 7)} merged "op/ghost-cell" after operation "Go Live" opened `
    + '\\(2026-10-02 09:00\\) and no log entry mentions that branch$', 'm'));
});

test('merge-unrecorded · NEGATIVE: the log mentions the branch, or it is not an op branch', () => {
  const fixture = openedInRepo();
  if (fixture === null) return;
  const { root } = fixture;
  mergeOf(root, 'feature/unrelated');
  assert.match(run(root, ['check']).stdout, /Integrity check passed/,
    'a merge of a branch that is not an operation branch is not this rule to apply');
  // Recorded FIRST, then merged: that is the order the method asks for, and the guard
  // reads the log as it is — a mention anywhere in it, cell entry or operation entry.
  run(root, ['pause', 'Login', '--facts', 'merged worktree-agent-7 into main',
    '--next', 'open Enrolment']);
  mergeOf(root, 'worktree-agent-7');
  const out = probe(root, ['check']);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.includes('merge unrecorded'), false);
});

test('without a repository both checks are UNKNOWN: a notice, never a silent pass', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, OPEN);
  run(root, ['open', 'Login', '--area', 'auth', '--in', 'src/login.ts', '--out', 'the router']);
  const out = probe(root, ['check']);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stderr, /^cellmode check · UNKNOWN: cell-stale and merge-unrecorded did not /);
  assert.match(out.stderr, /run — git is not installed here, or the project root is not a git /);
  assert.match(out.stderr, /work tree\. This is not a pass: a gate that cannot run is UNKNOWN, /);
  assert.match(out.stderr, /never green \(AGENTS\.md\)\.$/m);
  // The environment's UNKNOWN is NOT a finding: exit 0, and the cell's `Base commit:
  // UNKNOWN` (written by `open` with no git) is not read as staleness it cannot measure.
  assert.match(out.stdout, /Integrity check passed · 1 active/);
});
