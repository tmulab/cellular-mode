// check-operation.test.mjs — the four OPERATION findings of the integrity guard, through
// the real CLI on temp vaults: one POSITIVE and one NEGATIVE case each, plus the property
// the layer exists under — a vault with no operation file produces byte for byte the
// output it produced before the layer was written. The two git findings are in
// check-git.test.mjs, which needs a repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { CLI, NOW, freshRoot, run, readState, overwrite, paths } from './helpers.mjs';

const FINISH = 'ship the v2 rules; publish the guide';
const PACK = 'spend ceiling: 2k tokens; max-active-cells: 2';
const PASSED = 'Integrity check passed · ';

/** The CLI with BOTH streams captured: `run` keeps stderr only when the exit is not 0, and
 * a claim about the bytes of a PASSING run has to read its stderr too.
 * @param {string} root @param {string[]} args */
const probe = (root, args) => spawnSync(process.execPath, [CLI, ...args, '--root', root],
  { encoding: 'utf8', env: { ...process.env, CELLMODE_NOW: NOW } });

/** @param {string} pack @returns {string[]} */
const OPEN = (pack) => ['op', 'open', 'Go Live', '--finish-line', FINISH, '--pack', pack,
  '--bar', 'every claim carries an epistemic label', '--cells', 'Login, Enrolment'];

/** A vault with ONE 🔵 operation and nothing else. @param {string} [pack] @returns {string} */
function opened(pack = PACK) {
  const root = freshRoot();
  run(root, ['init']);
  run(root, OPEN(pack));
  return root;
}

/** Hand-edits the operation file, the way a human edits the vault.
 * @param {string} root @param {RegExp | string} from @param {string} to */
function editOperation(root, from, to) {
  const file = paths(root).operationFile('go-live');
  const text = readFileSync(file, 'utf8');
  const next = text.replace(from, to);
  assert.notEqual(next, text, `the fixture edit matched nothing: ${String(from)}`);
  writeFileSync(file, next, 'utf8');
}

/** @param {string} root @param {string} name @param {string} spend */
function cellWithSpend(root, name, spend) {
  run(root, ['open', name, '--area', name.toLowerCase(),
    '--in', `src/${name.toLowerCase()}.ts`, '--out', 'everything else']);
  run(root, ['pause', name, '--facts', `wrote src/${name.toLowerCase()}.ts`,
    '--next', 'run the tests', '--spend', spend]);
}

test('a vault with NO operation file produces the same bytes as before this layer', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Alpha', '--area', 'a']);
  run(root, ['pause', '--facts', 'wrote a.mjs', '--next', 'run the tests']);
  const clean = probe(root, ['check']);
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stdout,
    `${PASSED}0 active · 1 paused · 0 planned · 0 done · 1 log entries\n`);
  assert.equal(clean.stderr, '', 'no operation file, no notice: the layer is silent');
  // And one of the four original findings, byte for byte, including the exit code.
  overwrite(root, 'index', `${readState(root, 'index')}| Beta | b | 🔵 | 2026-10-02 | — |\n`);
  const broken = run(root, ['check'], { expect: 2 });
  assert.equal(broken.stderr, 'integrity check failed — the log is truth, fix the '
    + 'projections:\n- [current-cell-mismatch] CURRENT-CELL.md shows no active cell but '
    + '"Beta" is 🔵 in INDEX.md\n');
});

test('finish-line-moved · POSITIVE: the Finish line now hashes to something else', () => {
  const root = opened();
  const clean = run(root, ['check']); // NEGATIVE: the operation nobody edited is silent
  assert.match(clean.stdout, /Integrity check passed/);
  assert.equal(clean.stdout.includes('finish line moved'), false);
  editOperation(root, '2. publish the guide', '2. publish the guide and the preprint');
  const out = run(root, ['check'], { expect: 2 });
  assert.match(out.stderr, /\[finish-line-moved\] finish line moved: operation "Go Live" keeps/);
  assert.match(out.stderr,
    /keeps fingerprint [0-9a-f]{12} but its Finish line now hashes to [0-9a-f]{12}$/m);
});

test('finish-line-moved: the Fingerprint field disagrees with the opening entry', () => {
  const root = opened();
  editOperation(root, /\*\*Fingerprint:\*\* [0-9a-f]{64}/, `**Fingerprint:** ${'a'.repeat(64)}`);
  const out = run(root, ['check'], { expect: 2 });
  assert.match(out.stderr, /\[finish-line-moved\] finish line moved: operation "Go Live" carries/);
  assert.match(out.stderr,
    /carries fingerprint aaaaaaaaaaaa but its opening entry \(2026-10-02 09:00\) recorded [0-9a-f]{12}/);
});

test('finish-line-moved: a ✔ operation is history, never a finding', () => {
  const root = opened();
  run(root, ['op', 'complete', '--facts', 'shipped', '--confirm']);
  editOperation(root, '2. publish the guide', '2. publish something else');
  const out = probe(root, ['check']);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Integrity check passed/);
  assert.equal(out.stderr, '', 'every operation ✔: git is not asked, so there is no notice');
});

test('pack-missing · POSITIVE: an active operation whose pack grants nothing', () => {
  const out = run(opened('—'), ['check'], { expect: 2 });
  assert.match(out.stderr, /\[pack-missing\] pack missing: operation "Go Live" is 🔵 but its /);
  assert.match(out.stderr,
    /Authorization pack is empty \(—\) — an operation with no pack authorizes nothing$/m);
});

test('pack-missing · NEGATIVE: a pack with one grant is a pack', () => {
  const out = run(opened('max-active-cells: 2'), ['check']);
  assert.match(out.stdout, /Integrity check passed/);
  assert.equal(out.stdout.includes('pack missing'), false);
});

test('pack-grants-forbidden · POSITIVE: the model\'s own named error, not a crash', () => {
  /** @type {Array<[string, RegExp]>} */
  const bad = [
    ['teleport: yes', /rejects: PACK_UNKNOWN_GRANT: teleport$/m],
    ['skip-gate: just this once', /rejects: PACK_FORBIDDEN_GRANT: skip-gate$/m],
    ['batches: deploy', /rejects: PACK_BATCH_WITHOUT_LIMIT: deploy$/m],
  ];
  for (const [pack, expected] of bad) {
    const root = opened();
    editOperation(root, /\*\*Authorization pack:\*\* .*/, `**Authorization pack:** ${pack}`);
    const out = run(root, ['check'], { expect: 2 });
    assert.match(out.stderr, /\[pack-grants-forbidden\] pack grants forbidden: operation "Go Live" \(go-live\) has an Authorization pack the closed vocabulary/);
    assert.match(out.stderr, expected);
  }
});

test('pack-grants-forbidden · NEGATIVE: every grant of the CLOSED vocabulary passes', () => {
  const root = opened('spend ceiling: 2k tokens · publisher: the maintainer · batches: deploy '
    + '→ 1 per day · requires-yes: push to main · denied: rewriting the log · max-active-cells: 2');
  const out = run(root, ['check']);
  assert.match(out.stdout, /Integrity check passed/);
  assert.equal(out.stdout.includes('pack grants forbidden'), false);
});

test('spend-over-ceiling · POSITIVE: the cells sum past a numeric ceiling', () => {
  const root = opened('spend ceiling: 2000; max-active-cells: 2');
  cellWithSpend(root, 'Login', '1500');
  cellWithSpend(root, 'Enrolment', '1100');
  const out = run(root, ['check'], { expect: 2 });
  assert.match(out.stderr, /\[spend-over-ceiling\] spend over ceiling: operation "Go Live" has /);
  assert.match(out.stderr,
    /has spent 2600 against a spend ceiling of 2000 \(2 cell\(s\) summed: 2600 · Spend so far: —\)$/m);
});

test('spend-over-ceiling · NEGATIVE: under the ceiling, and a ceiling that is not a number', () => {
  const under = opened('spend ceiling: 2000; max-active-cells: 2');
  cellWithSpend(under, 'Login', '1500');
  assert.match(run(under, ['check']).stdout, /Integrity check passed/);
  // `2k tokens` is not a number and the guard does not decide what it means: a check that
  // guessed the ceiling it enforces would be inventing the authorization.
  const vague = opened();
  cellWithSpend(vague, 'Login', '1500');
  cellWithSpend(vague, 'Enrolment', '1100');
  const out = run(vague, ['check']);
  assert.match(out.stdout, /Integrity check passed/);
  assert.equal(out.stdout.includes('spend over ceiling'), false);
});
