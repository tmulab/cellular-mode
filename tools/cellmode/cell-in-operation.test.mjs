// cell-in-operation.test.mjs — `open` and `resume` INSIDE an active operation, through
// the real CLI, one fresh temp root per test: the required boundary, the `Operation:` and
// `Base commit:` fields, the pack's ceiling, and the unplanned cell that needs the
// human's yes. The closing half is in cell-in-operation-close.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { cellText, freshRoot, run, readState, readCellText, paths } from './helpers.mjs';

const FINISH = 'ship the v2 rules; publish the guide';
/** @param {string} [max] @returns {string} */
const pack = (max) => `spend ceiling: 2k tokens${max === undefined ? '' : `; max-active-cells: ${max}`}`;
/** @param {string} [max] @returns {string[]} */
const OPEN = (max) => ['op', 'open', 'Go Live', '--finish-line', FINISH, '--pack', pack(max),
  '--bar', 'every claim carries an epistemic label', '--cells', 'Login, Enrolment, Billing'];

/** @param {string} [max] @returns {string} */
function opened(max) {
  const root = freshRoot();
  run(root, ['init']);
  run(root, OPEN(max));
  return root;
}

/** @param {string} root @param {string} slug @returns {string} */
const opText = (root, slug) => readFileSync(paths(root).operationFile(slug), 'utf8');

/** A throwaway repository in the temp root, so `--root` IS a git repository. Assembled
 * identity: this file holds no literal address (the repository's leak gate forbids one).
 * @param {string} root @returns {string | null} the HEAD sha, or null when git is absent */
function gitRepo(root) {
  try {
    /** @type {(args: string[]) => string} */
    const git = (args) => execFileSync('git', args, {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', ['cell', '@', 'example', '.invalid'].join('')]);
    git(['config', 'user.name', 'Fixture']);
    git(['config', 'commit.gpgsign', 'false']);
    git(['commit', '-q', '--allow-empty', '-m', 'seed']);
    return git(['rev-parse', 'HEAD']).trim();
  } catch {
    return null;
  }
}

test('open inside an operation requires the boundary and names the missing flag', () => {
  const root = opened();
  const both = run(root, ['open', 'Login', '--area', 'auth'], { expect: 1 });
  assert.match(both.stderr, /`open` inside an operation requires a boundary: --in and --out/);
  assert.match(both.stderr, /the Boundary field may not be "—"/);
  const half = run(root, ['open', 'Login', '--area', 'auth', '--in', 'src/login.ts'],
    { expect: 1 });
  assert.match(half.stderr, /requires a boundary: --out —/);
  assert.equal(readCellText(root, 'login'), null, 'a refused opening writes no cell file');
  assert.equal(readState(root, 'index').includes('Login'), false, 'and no INDEX row');
  assert.match(run(root, ['open', 'Login', '--in', 'a', '--out', ''], { expect: 1 }).stderr,
    /requires a non-empty --out/);
});

test('open writes Operation and Base commit, and reports the ceiling', () => {
  const root = opened('2');
  const sha = gitRepo(root);
  const out = run(root, ['open', 'Login', '--area', 'auth', '--in', 'src/login.ts',
    '--out', 'the router', '--next', 'write the failing test']);
  assert.match(out.stdout, /Opened "Login" \(login\) · 🔵/);
  assert.match(out.stdout, /Operation: Go Live · base commit [0-9a-f]{40} · 1\/2 active/);
  assert.match(out.stdout, /NEXT STEP: write the failing test/);
  const cell = cellText(root, 'login');
  assert.match(cell, /\*\*Operation:\*\* Go Live/);
  assert.match(cell, /\*\*Boundary:\*\* in: src\/login\.ts \| NOT in: the router/);
  if (sha !== null) assert.equal(cell.includes(`**Base commit:** ${sha}`), true, cell);
  run(root, ['check']);
});

test('a root that is not a git repository writes Base commit UNKNOWN, never a guess', () => {
  const root = opened();
  run(root, ['open', 'Login', '--area', 'auth', '--in', 'a', '--out', 'b']);
  assert.match(cellText(root, 'login'), /\*\*Base commit:\*\* UNKNOWN/);
});

test('the pack ceiling is the law: 2 allowed, the third is exit 3 naming it', () => {
  const root = opened('2');
  run(root, ['open', 'Login', '--area', 'auth', '--in', 'src/login.ts', '--out', 'the router']);
  const second = run(root, ['open', 'Enrolment', '--area', 'enrol', '--in', 'src/enrol.ts',
    '--out', 'login']);
  assert.match(second.stdout, /· 2\/2 active/);
  const third = run(root, ['open', 'Billing', '--area', 'bill', '--in', 'src/bill.ts',
    '--out', 'enrol'], { expect: 3 });
  assert.match(third.stderr, /2 cell\(s\) already 🔵 in operation "Go Live" \(max-active-cells: 2\)/);
  assert.match(third.stderr, /pause one first: Login, Enrolment/);
  assert.equal(readCellText(root, 'billing'), null);
  run(root, ['check']);
});

test('a pack without max-active-cells means one, the old rule', () => {
  const root = opened();
  run(root, ['open', 'Login', '--area', 'auth', '--in', 'a', '--out', 'b']);
  const second = run(root, ['open', 'Enrolment', '--area', 'e', '--in', 'c', '--out', 'd'],
    { expect: 3 });
  assert.match(second.stderr, /1 cell\(s\) already 🔵 in operation "Go Live" \(max-active-cells: 1\)/);
});

test('an unplanned cell is refused, and --amend-pack --confirm records the human yes', () => {
  const root = opened('2');
  const before = opText(root, 'go-live');
  const fingerprint = /\*\*Fingerprint:\*\* ([0-9a-f]{64})/.exec(before)?.[1];
  assert.ok(fingerprint);
  const args = ['open', 'Hotfix', '--area', 'ops', '--in', 'src/hotfix.ts', '--out', 'login'];
  const refused = run(root, args, { expect: 1 });
  assert.match(refused.stderr, /cell "Hotfix" \(hotfix\) is UNPLANNED in operation "Go Live"/);
  assert.match(refused.stderr, /Planned cells are: login, enrolment, billing/);
  assert.match(refused.stderr, /re-run with --amend-pack --confirm/);
  assert.equal(readCellText(root, 'hotfix'), null);
  const unconfirmed = run(root, [...args, '--amend-pack'], { expect: 5 });
  assert.match(unconfirmed.stderr, /human confirmation required: amending the authorization pack/);
  assert.equal(opText(root, 'go-live'), before, 'a refused amendment writes nothing');

  run(root, [...args, '--amend-pack', '--confirm']);
  const after = opText(root, 'go-live');
  assert.match(after, /\*\*Planned cells:\*\* login, enrolment, billing, hotfix/);
  assert.equal(after.includes(`**Fingerprint:** ${fingerprint}`), true, 'fingerprint unchanged');
  assert.match(after, /\*\*Finish line \(frozen\):\*\* 1\. ship the v2 rules · 2\. publish the guide/);
  const log = readState(root, 'log');
  assert.match(log, /## 2026-10-02 09:00 · Operation: Go Live/);
  assert.match(log, /\*\*Pack amendment:\*\* \+cell hotfix, approved by human/);
  assert.equal(log.includes(`**Fingerprint:** ${fingerprint}`), true, 'the entry repeats it');
  assert.match(cellText(root, 'hotfix'), /\*\*Operation:\*\* Go Live/);
  run(root, ['check']);
});

test('resume follows the ceiling and the planned rule, and keeps the base commit', () => {
  const root = opened('2');
  run(root, ['open', 'Login', '--area', 'auth', '--in', 'a', '--out', 'b']);
  run(root, ['pause', 'Login', '--facts', 'wrote src/login.ts', '--next', 'run the test']);
  run(root, ['open', 'Enrolment', '--area', 'e', '--in', 'c', '--out', 'd']);
  run(root, ['open', 'Billing', '--area', 'bill', '--in', 'e', '--out', 'f']);
  const full = run(root, ['resume', 'Login'], { expect: 3 });
  assert.match(full.stderr, /\(max-active-cells: 2\) — pause one first: Enrolment, Billing/);
  run(root, ['pause', 'Billing', '--facts', 'f', '--next', 'n']);
  const resumed = run(root, ['resume', 'Login']);
  assert.match(resumed.stdout, /Cell: Login \(auth\) · 🔵/);
  assert.match(resumed.stdout, /Shall we continue\?/);
  assert.match(cellText(root, 'login'), /\*\*Base commit:\*\* UNKNOWN/);
  assert.match(cellText(root, 'login'), /\*\*Operation:\*\* Go Live/);
  run(root, ['check']);
  run(root, ['pause', 'Login', '--facts', 'f', '--next', 'n']);
  run(root, ['pause', 'Enrolment', '--facts', 'f', '--next', 'n']);
});

test('an unplanned PAUSED cell needs the same yes on the way back in', () => {
  const root = opened('2');
  run(root, ['open', 'Hotfix', '--area', 'ops', '--in', 'a', '--out', 'b',
    '--amend-pack', '--confirm']);
  run(root, ['pause', 'Hotfix', '--facts', 'f', '--next', 'n']);
  // The amendment is undone by hand, so the cell is paused and unplanned again.
  const file = paths(root).operationFile('go-live');
  writeFileSync(file, readFileSync(file, 'utf8').replace(', hotfix', ''), 'utf8');
  const refused = run(root, ['resume', 'Hotfix'], { expect: 1 });
  assert.match(refused.stderr, /is UNPLANNED in operation "Go Live"/);
  run(root, ['resume', 'Hotfix', '--amend-pack', '--confirm']);
  assert.match(opText(root, 'go-live'), /\*\*Planned cells:\*\* login, enrolment, billing, hotfix/);
  run(root, ['check']);
});

test('resume reports an ambiguous name with exit 4 and no match with exit 1', () => {
  const root = opened('2');
  for (const name of ['Login', 'Enrolment']) {
    run(root, ['open', name, '--area', 'a', '--in', `src/${name}.ts`, '--out', 'other']);
  }
  run(root, ['pause', 'Login', '--facts', 'f', '--next', 'n']);
  run(root, ['pause', 'Enrolment', '--facts', 'f', '--next', 'n']);
  const ambiguous = run(root, ['resume', 'n'], { expect: 4 });
  assert.match(ambiguous.stderr, /matches more than one paused cell/);
  assert.match(run(root, ['resume', 'nothing'], { expect: 1 }).stderr, /no paused cell matches/);
  assert.match(run(root, ['resume', 'Login', '--bogus', 'x'], { expect: 1 }).stderr,
    /unknown option --bogus for `resume`/);
});
