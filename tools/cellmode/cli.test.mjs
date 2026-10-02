// cli.test.mjs — the real CLI, one fresh temp dir per test, fixed clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cellText, freshRoot, run, readState, readCellText, lines } from './helpers.mjs';

const SKELETON = ['log', 'index', 'current', 'parkingLot', 'cells/README.md'];

test('init creates the skeleton with headers and refuses a second time', () => {
  const root = freshRoot();
  const first = run(root, ['init']);
  assert.match(first.stdout, /Initialized cellular-mode state in vault\/state/);
  for (const key of SKELETON) assert.ok(readState(root, key), `missing ${key}`);
  assert.match(readState(root, 'log'), /^# Cell log/);
  assert.match(readState(root, 'log'), /APPEND-ONLY/);
  assert.match(readState(root, 'index'), /\| Cell \| Area \| Status \| Last visit \| Next step \(1 line\) \|/);
  assert.match(readState(root, 'current'), /No active cell · 0 paused/);
  assert.match(readState(root, 'parkingLot'), /^# Parking lot/);
  const second = run(root, ['init'], { expect: 1 });
  assert.match(second.stderr, /already exists/);
});

test('commands refuse to run before init', () => {
  const root = freshRoot();
  const result = run(root, ['status'], { expect: 1 });
  assert.match(result.stderr, /no cellular-mode state in vault\/state/);
});

test('unknown command and bad args exit 1 with usage', () => {
  const root = freshRoot();
  run(root, ['init']);
  const unknown = run(root, ['frobnicate'], { expect: 1 });
  assert.match(unknown.stderr, /unknown command: frobnicate/);
  assert.match(unknown.stderr, /Exit codes: 0 ok/);
  assert.match(run(root, ['open'], { expect: 1 }).stderr, /requires a cell name/);
  assert.match(run(root, ['status', '--bogus', 'x'], { expect: 1 }).stderr, /unknown option --bogus/);
  assert.match(run(root, ['plan', 'A'], { expect: 1 }).stderr, /requires a non-empty --area/);
});

test('open writes the cell file, the INDEX row and CURRENT-CELL, with no log entry', () => {
  const root = freshRoot();
  run(root, ['init']);
  const before = readState(root, 'log');
  const out = run(root, ['open', 'Index Parser', '--area', 'tools/cellmode',
    '--objective', 'parse INDEX.md', '--in', 'index-table.mjs', '--out', 'the CLI surface',
    '--done', 'build green + round-trip test']);
  assert.match(out.stdout, /Opened "Index Parser" \(index-parser\) · 🔵/);
  const cell = cellText(root, 'index-parser');
  assert.match(cell, /# Cell: Index Parser/);
  assert.match(cell, /\*\*Status:\*\* 🔵/);
  assert.match(cell, /\*\*Boundary:\*\* in: index-table\.mjs \| NOT in: the CLI surface/);
  assert.match(cell, /\*\*Done criterion \(binary\):\*\* build green \+ round-trip test/);
  assert.match(cell, /## ➜ NEXT STEP \(doable in <5 min, without thinking\)/);
  assert.match(readState(root, 'index'), /\| \[Index Parser\]\(cells\/index-parser\.md\) \| tools\/cellmode \| 🔵 \| 2026-10-02 \| — \|/);
  assert.equal(readState(root, 'current'), cell);
  assert.equal(readState(root, 'log'), before, 'opening a cell must not write a log entry');
});

test('a second open is refused with exit 3 while a cell is active', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Alpha', '--area', 'a']);
  const refused = run(root, ['open', 'Beta', '--area', 'b'], { expect: 3 });
  assert.match(refused.stderr, /cell "Alpha" is active \(🔵\) — pause it first/);
  assert.equal(readCellText(root, 'beta'), null);
  run(root, ['resume', 'Alpha'], { expect: 3 });
});

test('pause requires --facts and a non-empty --next', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Alpha', '--area', 'a']);
  assert.match(run(root, ['pause', '--facts', 'did x'], { expect: 1 }).stderr, /requires a non-empty --next/);
  assert.match(run(root, ['pause', '--next', 'do y'], { expect: 1 }).stderr, /requires a non-empty --facts/);
  assert.match(run(root, ['pause', '--facts', 'x', '--next', '   '], { expect: 1 }).stderr, /--next/);
  assert.match(readState(root, 'index'), /🔵/);
  assert.equal(readState(root, 'log').includes('Cell: Alpha'), false);
});

test('pause with no active cell exits 1', () => {
  const root = freshRoot();
  run(root, ['init']);
  assert.match(run(root, ['pause', '--facts', 'x', '--next', 'y'], { expect: 1 }).stderr, /no active cell/);
});

test('pause writes the log entry, the INDEX row and the idle CURRENT-CELL', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Index Parser', '--area', 'tools']);
  const out = run(root, ['pause', '--facts', 'wrote tools/cellmode/index-table.mjs',
    '--next', 'run `node --test` and read the first error',
    '--decisions', 'linear scan, no regex over free text',
    '--build', 'red (TS2345 in cli.mjs)', '--note', 'tired, stopping here'],
  { now: '2026-10-02 18:30' });
  assert.match(out.stdout, /Cells know how to wait\./);
  const log = readState(root, 'log');
  assert.match(log, /## 2026-10-02 18:30 · Cell: Index Parser/);
  assert.match(log, /\*\*Status:\*\* ⏸/);
  assert.match(log, /\*\*Facts:\*\* wrote tools\/cellmode\/index-table\.mjs/);
  assert.match(log, /\*\*Build:\*\* red \(TS2345 in cli\.mjs\)/);
  assert.match(log, /\*\*Next step:\*\* run `node --test` and read the first error/);
  assert.match(log, /\*\*Personal note \(optional\):\*\* tired, stopping here/);
  assert.match(readState(root, 'index'), /⏸ \| 2026-10-02 \| run `node --test` and read the first error \|/);
  assert.match(readState(root, 'current'), /No active cell · 1 paused — see INDEX\.md/);
  assert.match(readState(root, 'current'), /- \*\*Index Parser\*\* → run `node --test`/);
  assert.match(cellText(root, 'index-parser'), /\*\*Status:\*\* ⏸/);
  assert.match(cellText(root, 'index-parser'), /\*\*Last fact:\*\* wrote tools\/cellmode\/index-table\.mjs/);
  run(root, ['check']);
});

test('resume matches exactly, matches fuzzily, and reports ambiguity with exit 4', () => {
  const root = freshRoot();
  run(root, ['init']);
  for (const name of ['API Cache', 'API Router']) {
    run(root, ['open', name, '--area', 'api']);
    run(root, ['pause', '--facts', `started ${name}`, '--next', `continue ${name}`]);
  }
  const exact = run(root, ['resume', 'API Cache']);
  assert.match(exact.stdout, /Cell: API Cache \(api\) · 🔵/);
  assert.ok(lines(exact.stdout).length <= 5);
  run(root, ['pause', '--facts', 'f', '--next', 'n']);
  const fuzzy = run(root, ['resume', 'router']);
  assert.match(fuzzy.stdout, /Cell: API Router/);
  run(root, ['pause', '--facts', 'f', '--next', 'n']);
  const ambiguous = run(root, ['resume', 'api'], { expect: 4 });
  assert.match(ambiguous.stderr, /matches more than one paused cell/);
  assert.match(ambiguous.stderr, /- API Cache/);
  assert.match(ambiguous.stderr, /- API Router/);
  assert.match(run(root, ['resume', 'nothing'], { expect: 1 }).stderr, /no paused cell matches/);
  run(root, ['check']);
});

test('plan then open is an opening: 📋 -> 🔵 with no log entry until pause', () => {
  const root = freshRoot();
  run(root, ['init']);
  const planned = run(root, ['plan', 'Key Audit', '--area', 'tools', '--objective', 'audit keys']);
  assert.match(planned.stdout, /📋 — no log entry: a planned cell never ran/);
  assert.match(readState(root, 'index'), /\| 📋 \| — \| — \|/);
  assert.match(cellText(root, 'key-audit'), /\*\*Status:\*\* 📋/);
  const logAfterPlan = readState(root, 'log');
  run(root, ['plan', 'key audit', '--area', 'tools'], { expect: 1 });
  const opened = run(root, ['open', 'Key Audit']);
  assert.match(opened.stdout, /promoted from 📋 \(an opening, not a resume\)/);
  assert.match(readState(root, 'index'), /\| 🔵 \|/);
  assert.match(cellText(root, 'key-audit'), /\*\*Objective:\*\* audit keys/);
  assert.match(cellText(root, 'key-audit'), /\*\*Area:\*\* tools/);
  assert.equal(readState(root, 'log'), logAfterPlan, 'no log entry for an opening');
  run(root, ['pause', '--facts', 'scaffolded tools/key-audit/cli.mjs', '--next', 'add one test']);
  assert.match(readState(root, 'log'), /Cell: Key Audit/);
  run(root, ['check']);
});

test('complete refuses without --confirm (exit 5) and keeps the cell file with it', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Alpha', '--area', 'a']);
  const refused = run(root, ['complete', '--facts', 'all gates green'], { expect: 5 });
  assert.match(refused.stderr, /human confirmation required/);
  assert.match(readState(root, 'index'), /🔵/);
  const done = run(root, ['complete', '--facts', 'all gates green', '--confirm', '--build', 'green']);
  assert.match(done.stdout, /Completed "Alpha" · ✔/);
  assert.match(readState(root, 'log'), /\*\*Status:\*\* ✔/);
  assert.match(readState(root, 'log'), /\*\*Next step:\*\* —/);
  assert.match(readState(root, 'index'), /\| ✔ \| 2026-10-02 \| — \|/);
  assert.match(cellText(root, 'alpha'), /\*\*Status:\*\* ✔/);
  assert.match(readState(root, 'current'), /No active cell · 0 paused/);
  assert.match(run(root, ['open', 'Alpha'], { expect: 1 }).stderr, /✔ is terminal/);
  run(root, ['check']);
});

test('park appends to the parking lot with the current cell as context', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['park', 'ship a watch mode']);
  run(root, ['open', 'Alpha', '--area', 'a']);
  run(root, ['park', 'split the parser in two']);
  const text = readState(root, 'parkingLot');
  assert.match(text, /- \[2026-10-02\] ship a watch mode \(context: no active cell\)/);
  assert.match(text, /- \[2026-10-02\] split the parser in two \(context: cell Alpha\)/);
});

test('status prints at most 5 lines for an active cell, else the waiting list', () => {
  const root = freshRoot();
  run(root, ['init']);
  assert.match(run(root, ['status']).stdout, /No active cell · 0 paused · 0 planned/);
  run(root, ['open', 'Alpha', '--area', 'tools']);
  run(root, ['pause', '--facts', 'wrote a.mjs', '--next', 'run `node --test`', '--build', 'green']);
  run(root, ['resume', 'Alpha']);
  const out = run(root, ['status']);
  const got = lines(out.stdout);
  assert.ok(got.length <= 5, `status printed ${got.length} lines:\n${out.stdout}`);
  assert.match(String(got[0]), /^Cell: Alpha \(tools\) · 🔵$/);
  assert.match(out.stdout, /Last fact: wrote a\.mjs/);
  assert.match(out.stdout, /Build\/typecheck: green/);
  assert.match(out.stdout, /NEXT STEP: run `node --test`/);
});
