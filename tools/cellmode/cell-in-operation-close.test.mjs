// cell-in-operation-close.test.mjs — the closing half of a cell inside an operation:
// `pause [name]` / `complete [name]`, the CURRENT-CELL.md projection of several active
// cells, the operation-aware `check`, and the proof that a vault with NO operation file
// behaves exactly as it did before the layer existed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cellText, freshRoot, run, readState, lines, overwrite,
} from './helpers.mjs';

const FINISH = 'ship the v2 rules; publish the guide';
const OPEN = ['op', 'open', 'Go Live', '--finish-line', FINISH,
  '--pack', 'spend ceiling: 2k tokens; max-active-cells: 2',
  '--bar', 'every claim carries an epistemic label', '--cells', 'Login, Enrolment'];
const HEADER = '# Operation: Go Live · 🔵 · spend —/2k tokens\n'
  + 'Finish line: 1. ship the v2 rules · 2. publish the guide\n\n';

/** @param {string} root @param {string} name @param {string} area */
const openCell = (root, name, area) => run(root,
  ['open', name, '--area', area, '--in', `src/${area}.ts`, '--out', 'everything else']);

/** @param {number} cells @returns {string} */
function opened(cells = 0) {
  const root = freshRoot();
  run(root, ['init']);
  run(root, OPEN);
  if (cells > 0) openCell(root, 'Login', 'auth');
  if (cells > 1) openCell(root, 'Enrolment', 'enrol');
  return root;
}

test('with ONE active cell the name stays optional, as it is today', () => {
  const root = opened(1);
  const out = run(root, ['pause', '--facts', 'wrote src/auth.ts', '--next', 'run the test']);
  assert.match(out.stdout, /Paused "Login" · ⏸/);
  assert.match(out.stdout, /Cells know how to wait\./);
  assert.match(readState(root, 'log'), /## 2026-10-02 09:00 · Cell: Login/);
  assert.match(cellText(root, 'login'), /\*\*Status:\*\* ⏸/);
  run(root, ['check']);
});

test('with TWO active cells pause and complete require the name', () => {
  const root = opened(2);
  const pause = run(root, ['pause', '--facts', 'f', '--next', 'n'], { expect: 1 });
  assert.match(pause.stderr, /2 cells are 🔵 — name the one to pause:\n- Login\n- Enrolment/);
  const done = run(root, ['complete', '--facts', 'f', '--confirm'], { expect: 1 });
  assert.match(done.stderr, /2 cells are 🔵 — name the one to complete:/);
  const ambiguous = run(root, ['pause', 'n', '--facts', 'f', '--next', 'n'], { expect: 4 });
  assert.match(ambiguous.stderr, /"n" matches more than one active cell — be specific:/);
  assert.match(run(root, ['pause', 'ghost', '--facts', 'f', '--next', 'n'], { expect: 1 }).stderr,
    /no active cell matches "ghost"/);
  assert.equal(readState(root, 'index').match(/\| 🔵 \|/g)?.length, 2, 'nothing closed');
  run(root, ['check']);
});

test('pause --spend fills the cell Spend and keeps Operation and Base commit', () => {
  const root = opened(2);
  run(root, ['pause', 'Login', '--facts', 'wrote the parser', '--next', 'run the test',
    '--spend', '300 tokens', '--build', 'green']);
  const cell = cellText(root, 'login');
  assert.match(cell, /\*\*Operation:\*\* Go Live/);
  assert.match(cell, /\*\*Base commit:\*\* UNKNOWN/);
  assert.match(cell, /\*\*Spend:\*\* 300 tokens/);
  assert.match(cell, /\*\*Build\/typecheck:\*\* green/);
  assert.match(run(root, ['pause', 'Enrolment', '--facts', 'f', '--next', 'n', '--spend', ''],
    { expect: 1 }).stderr, /requires a non-empty --spend/);
  run(root, ['check']);
});

test('complete inside an operation still needs --confirm and keeps the file', () => {
  const root = opened(2);
  const refused = run(root, ['complete', 'Login', '--facts', 'all gates green'], { expect: 5 });
  assert.match(refused.stderr, /human confirmation required/);
  const out = run(root, ['complete', 'Login', '--facts', 'all gates green', '--confirm',
    '--spend', '1.1k tokens']);
  assert.match(out.stdout, /Completed "Login" · ✔/);
  assert.match(out.stdout, /Completion RECORDED — not yet authorized/);
  assert.match(cellText(root, 'login'), /\*\*Status:\*\* ✔/);
  assert.match(cellText(root, 'login'), /\*\*Spend:\*\* 1\.1k tokens/);
  assert.match(readState(root, 'log'), /\*\*Status:\*\* ✔/);
  // The other cell is still 🔵, so CURRENT-CELL must not claim the vault is idle.
  assert.match(readState(root, 'current'), /# Cell: Enrolment/);
  run(root, ['check']);
});

test('CURRENT-CELL: byte-identical to the R3 form with one cell, a table with two', () => {
  const root = opened(1);
  assert.equal(readState(root, 'current'), `${HEADER}${cellText(root, 'login')}`,
    'one active cell: the operation header plus the cell file, exactly as cell R3 wrote it');
  openCell(root, 'Enrolment', 'enrol');
  const two = readState(root, 'current');
  assert.equal(two.startsWith(HEADER), true, 'the header does not move');
  assert.match(two, /\| Cell \| Area \| Base commit \| Next step \|\n\|---\|---\|---\|---\|\n/);
  assert.match(two, /\| Login \| auth \| UNKNOWN \| — \|\n\| Enrolment \| enrol \| UNKNOWN \| — \|/);
  assert.equal(two.endsWith(cellText(root, 'enrolment')), true,
    'the most recently opened cell is projected in full below the table');
  run(root, ['check']);
  // Back to one 🔵 cell: the table goes away and the file is the R3 form again.
  run(root, ['pause', 'Enrolment', '--facts', 'f', '--next', 'n']);
  assert.equal(readState(root, 'current'), `${HEADER}${cellText(root, 'login')}`);
  run(root, ['check']);
});

test('check is clean with two active cells in an operation, over-ceiling above it', () => {
  const root = opened(2);
  assert.match(run(root, ['check']).stdout, /Integrity check passed · 2 active · 0 paused/);
  // A third 🔵 row, written by hand, is the finding — and it names the ceiling.
  overwrite(root, 'index', `${readState(root, 'index')}| Billing | bill | 🔵 | 2026-10-02 | — |\n`);
  const over = run(root, ['check'], { expect: 2 });
  assert.match(over.stderr, /\[over-ceiling\] 3 active cells \(🔵\) in operation "Go Live"/);
  assert.match(over.stderr, /max-active-cells: 2: Login, Enrolment, Billing/);
  // The guard blocks the transitions too, not only `check`.
  run(root, ['pause', 'Login', '--facts', 'f', '--next', 'n'], { expect: 2 });
});

test('check reports the old two-active finding when NO operation is 🔵', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Alpha', '--area', 'a']);
  assert.match(readState(root, 'current'), /^# Cell: Alpha/, 'no operation, no header');
  overwrite(root, 'index', `${readState(root, 'index')}| Beta | b | 🔵 | 2026-10-02 | — |\n`);
  const two = run(root, ['check'], { expect: 2 });
  assert.match(two.stderr, /\[two-active\] more than one active cell \(🔵\): Alpha, Beta/);
});

test('check sees a CURRENT-CELL that names none of the active cells', () => {
  const root = opened(2);
  overwrite(root, 'current', `${HEADER}# Cell: Ghost\n**ID:** ghost\n`);
  const out = run(root, ['check'], { expect: 2 });
  assert.match(out.stderr,
    /\[current-cell-mismatch\] CURRENT-CELL\.md points to "Ghost" but it is not one of the 2/);
});

test('a vault with no operation behaves exactly as before: the cli replay', () => {
  const root = freshRoot();
  run(root, ['init']);
  const open = run(root, ['open', 'Index Parser', '--area', 'tools/cellmode',
    '--objective', 'parse INDEX.md', '--in', 'index-table.mjs', '--out', 'the CLI surface',
    '--done', 'build green + round-trip test']);
  assert.match(open.stdout, /Opened "Index Parser" \(index-parser\) · 🔵/);
  assert.equal(lines(open.stdout).length, 2, 'two lines, as before the operation layer');
  assert.equal(readState(root, 'current'), cellText(root, 'index-parser'),
    'CURRENT-CELL is the cell file itself: no header, no table');
  const refused = run(root, ['open', 'Beta', '--area', 'b'], { expect: 3 });
  assert.match(refused.stderr, /cell "Index Parser" is active \(🔵\) — pause it first/);
  assert.match(run(root, ['pause', 'Index Parser', '--facts', 'f', '--next', 'n'],
    { expect: 1 }).stderr, /`pause` takes no positional arguments/);
  run(root, ['pause', '--facts', 'wrote index-table.mjs', '--next', 'run `node --test`']);
  assert.match(readState(root, 'current'), /No active cell · 1 paused — see INDEX\.md/);
  run(root, ['resume', 'index']);
  run(root, ['complete', '--facts', 'all gates green', '--confirm']);
  assert.match(readState(root, 'index'), /\| ✔ \| 2026-10-02 \| — \|/);
  run(root, ['check']);
});
