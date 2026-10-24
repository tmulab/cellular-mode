// operation-commands.test.mjs — the `op` family through the real CLI, one fresh temp
// root per test, fixed clock. Operation files are read from disk, never from a mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { freshRoot, run, readState, paths } from './helpers.mjs';

const FINISH = 'ship the v2 rules; publish the guide';
const PACK = 'spend ceiling: 2k tokens; batches: deploy → 1 per day; requires-yes: push to main';
const OPEN = ['op', 'open', 'Go Live', '--finish-line', FINISH, '--pack', PACK,
  '--bar', 'every claim carries an epistemic label', '--cells', 'Login, Enrolment'];

/** @param {string} root @param {string} slug @returns {string} */
const opText = (root, slug) => readFileSync(paths(root).operationFile(slug), 'utf8');

/** @param {string} root @returns {string} */
function openedProject(root) {
  run(root, ['init']);
  run(root, OPEN);
  return root;
}

test('init creates operations/README.md', () => {
  const root = freshRoot();
  run(root, ['init']);
  const readme = readFileSync(paths(root).operationFile('README'), 'utf8');
  assert.match(readme, /^# Operations/);
  assert.match(readme, /At most one operation is 🔵 at a time/);
});

test('op open requires the name and all four flags, naming the missing one', () => {
  const root = freshRoot();
  run(root, ['init']);
  assert.match(run(root, ['op'], { expect: 1 }).stderr, /`op` needs a sub-command/);
  assert.match(run(root, ['op', 'frobnicate'], { expect: 1 }).stderr,
    /unknown `op` sub-command: frobnicate/);
  assert.match(run(root, ['op', 'open'], { expect: 1 }).stderr,
    /`op open` requires an operation name/);
  /** @type {Array<[string, string]>} */
  const flags = [['finish-line', FINISH], ['pack', PACK], ['bar', 'b'], ['cells', 'c']];
  for (const [missing] of flags) {
    const args = ['op', 'open', 'Go Live'];
    for (const [flag, value] of flags) if (flag !== missing) args.push(`--${flag}`, value);
    const out = run(root, args, { expect: 1 });
    assert.match(out.stderr, new RegExp(`requires a non-empty --${missing}`));
  }
  assert.match(run(root, [...OPEN, '--bogus', 'x'], { expect: 1 }).stderr,
    /unknown option --bogus for `op open`/);
});

test('op open writes the operation file, the log entry and the CURRENT-CELL header', () => {
  const root = freshRoot();
  run(root, ['init']);
  const out = run(root, OPEN);
  assert.match(out.stdout, /Opened operation "Go Live" \(go-live\) · 🔵/);
  assert.match(out.stdout, /Finish line frozen \(2 items\) · fingerprint [0-9a-f]{64}/);
  assert.match(out.stdout, /Planned cells: login, enrolment/);

  const file = opText(root, 'go-live');
  assert.match(file, /^# Operation: Go Live/);
  assert.match(file, /\*\*ID:\*\* go-live · \*\*Opened:\*\* 2026-10-02 · \*\*Status:\*\* 🔵/);
  assert.match(file, /\*\*Finish line \(frozen\):\*\* 1\. ship the v2 rules · 2\. publish the guide/);
  assert.match(file, /\*\*Authorization pack:\*\* spend ceiling: 2k tokens · batches: deploy → 1 per day · requires-yes: push to main/);
  const hash = /\*\*Fingerprint:\*\* ([0-9a-f]{64})/.exec(file);
  assert.ok(hash, 'the operation file must carry a 64-hex fingerprint');

  const log = readState(root, 'log');
  assert.match(log, /## 2026-10-02 09:00 · Operation: Go Live\n\*\*Status:\*\* 🔵/);
  assert.match(log, /\*\*Finish line:\*\* 1\. ship the v2 rules · 2\. publish the guide/);
  assert.match(log, new RegExp(`\\*\\*Fingerprint:\\*\\* ${hash[1]}`));
  assert.match(log, /\*\*Pack:\*\* spend ceiling: 2k tokens/);
  assert.match(log, /\*\*Quality bar:\*\* every claim carries an epistemic label/);
  assert.match(log, /\*\*Planned cells:\*\* login, enrolment/);

  const current = readState(root, 'current');
  assert.match(current, /^# Operation: Go Live · 🔵 · spend —\/2k tokens\n/);
  assert.match(current, /Finish line: 1\. ship the v2 rules · 2\. publish the guide/);
});

test('a second op open is refused with exit 3 while an operation is 🔵', () => {
  const root = openedProject(freshRoot());
  const out = run(root, ['op', 'open', 'Other', '--finish-line', 'x', '--pack', '—',
    '--bar', 'b', '--cells', 'c'], { expect: 3 });
  assert.match(out.stderr, /operation "Go Live" is 🔵 — pause or complete it first/);
  assert.ok(!existsSync(paths(root).operationFile('other')), 'the refusal must write nothing');
});

test('a bad pack is a usage error carrying the model\'s named error', () => {
  const root = freshRoot();
  run(root, ['init']);
  /** @type {Array<[string, RegExp]>} */
  const bad = [
    ['teleport: yes', /PACK_UNKNOWN_GRANT: teleport/],
    ['skip-gate: just this once', /PACK_FORBIDDEN_GRANT: skip-gate/],
    ['batches: deploy', /PACK_BATCH_WITHOUT_LIMIT: deploy/],
  ];
  for (const [pack, expected] of bad) {
    const out = run(root, ['op', 'open', 'Go Live', '--finish-line', 'x',
      '--pack', pack, '--bar', 'b', '--cells', 'c'], { expect: 1 });
    assert.match(out.stderr, expected);
  }
});

test('op pause appends a ⏸ entry, and op open resumes the same operation', () => {
  const root = openedProject(freshRoot());
  const out = run(root, ['op', 'pause', '--facts', 'the rules are written',
    '--next', 'open the Enrolment cell']);
  assert.match(out.stdout, /Paused operation "Go Live" · ⏸/);
  assert.match(out.stdout, /NEXT STEP: open the Enrolment cell/);
  assert.match(out.stdout, /nothing was cascaded/);
  assert.match(opText(root, 'go-live'), /\*\*Status:\*\* ⏸/);
  const log = readState(root, 'log');
  assert.equal(log.match(/· Operation: Go Live/g)?.length, 2, 'one entry per closure');
  assert.match(log, /\*\*Status:\*\* ⏸\n\*\*Facts:\*\* the rules are written/);
  assert.match(log, /\*\*Next step:\*\* open the Enrolment cell/);
  // The header leaves CURRENT-CELL.md as soon as no operation is 🔵.
  assert.match(readState(root, 'current'), /^# Current cell/);

  const again = run(root, OPEN);
  assert.match(again.stdout, /Resumed operation "Go Live" \(go-live\) · 🔵/);
  assert.match(opText(root, 'go-live'), /\*\*Status:\*\* 🔵/);
  assert.match(opText(root, 'go-live'), /\*\*Opened:\*\* 2026-10-02/);
});

test('resuming may not move the frozen finish line', () => {
  const root = openedProject(freshRoot());
  run(root, ['op', 'pause', '--facts', 'f', '--next', 'n']);
  const out = run(root, ['op', 'open', 'Go Live', '--finish-line', 'ship the v2 rules',
    '--pack', PACK, '--bar', 'b', '--cells', 'c'], { expect: 1 });
  assert.match(out.stderr, /the finish line of "Go Live" was frozen at opening/);
  assert.match(opText(root, 'go-live'), /\*\*Status:\*\* ⏸/);
});

test('op complete needs --confirm and then writes a ✔ entry with the spend', () => {
  const root = openedProject(freshRoot());
  const refused = run(root, ['op', 'complete', '--facts', 'shipped'], { expect: 5 });
  assert.match(refused.stderr, /human confirmation required/);
  assert.match(opText(root, 'go-live'), /\*\*Status:\*\* 🔵/);
  const out = run(root, ['op', 'complete', '--facts', 'shipped and published', '--confirm']);
  assert.match(out.stdout, /Completed operation "Go Live" · ✔/);
  assert.match(out.stdout, /Fingerprint unchanged: [0-9a-f]{64}/);
  assert.match(opText(root, 'go-live'), /\*\*Status:\*\* ✔/);
  const log = readState(root, 'log');
  assert.match(log, /\*\*Status:\*\* ✔\n\*\*Facts:\*\* shipped and published/);
  assert.match(log, /\*\*Spend so far:\*\* —/);
  // ✔ is terminal for the operation too.
  assert.match(run(root, OPEN, { expect: 1 }).stderr, /is done \(✔\) — ✔ is terminal/);
});
