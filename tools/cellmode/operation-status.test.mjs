// operation-status.test.mjs — the second half of the `op` family through the real CLI:
// the refusals that read the cell layer, the ambiguous `[name]`, `op status`, and the
// proof that `check` — which knows nothing about operations — stays green on a log that
// carries their entries. Split from operation-commands.test.mjs for the 200-line limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
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

/** Hand-writes the cell's `**Operation:**` field: the cell layer does not set it yet
 * (R4), and the refusal must still see it. @param {string} root @param {string} slug */
function linkCellToOperation(root, slug, name = 'Go Live') {
  const file = paths(root).cellFile(slug);
  const text = readFileSync(file, 'utf8');
  const line = `**Operation:** ${name}`;
  writeFileSync(file, /\*\*Operation:\*\*.*/.test(text)
    ? text.replace(/\*\*Operation:\*\*.*/, line)
    : text.replace('**Area:**', `${line}\n**Area:**`), 'utf8');
}

test('op pause and op complete are refused while a cell of the operation is 🔵', () => {
  const root = openedProject(freshRoot());
  run(root, ['open', 'Login', '--area', 'auth', '--in', 'src/login.ts', '--out', 'the router', '--next', 'run `npm test`']);
  linkCellToOperation(root, 'login');
  const paused = run(root, ['op', 'pause', '--facts', 'f', '--next', 'n'], { expect: 3 });
  assert.match(paused.stderr,
    /cell "Login" is 🔵 in operation "Go Live" — pause the cell first, then pause the operation/);
  const done = run(root, ['op', 'complete', '--facts', 'f', '--confirm'], { expect: 3 });
  assert.match(done.stderr, /pause the cell first, then complete the operation/);
  assert.match(opText(root, 'go-live'), /\*\*Status:\*\* 🔵/);
  // A cell of ANOTHER operation does not block it.
  linkCellToOperation(root, 'login', 'Something Else');
  run(root, ['op', 'pause', '--facts', 'f', '--next', 'n']);
  assert.match(opText(root, 'go-live'), /\*\*Status:\*\* ⏸/);
});

test('op pause without a name is exit 4 when more than one operation is 🔵', () => {
  const root = openedProject(freshRoot());
  writeFileSync(paths(root).operationFile('side-quest'),
    opText(root, 'go-live').replace('# Operation: Go Live', '# Operation: Side Quest')
      .replace('**ID:** go-live', '**ID:** side-quest'), 'utf8');
  const out = run(root, ['op', 'pause', '--facts', 'f', '--next', 'n'], { expect: 4 });
  assert.match(out.stderr, /more than one operation is 🔵 — name the one to pause:/);
  assert.match(out.stderr, /- Go Live \(go-live\)\n- Side Quest \(side-quest\)/);
  run(root, ['op', 'pause', 'side', '--facts', 'f', '--next', 'n']);
  assert.match(opText(root, 'side-quest'), /\*\*Status:\*\* ⏸/);
  assert.match(run(root, ['op', 'pause', 'nothing-like-it', '--facts', 'f', '--next', 'n'],
    { expect: 1 }).stderr, /no active operation matches "nothing-like-it"/);
});

test('op status: the active operation, the waiting list, or neither', () => {
  const root = freshRoot();
  run(root, ['init']);
  assert.match(run(root, ['op', 'status']).stdout, /No active operation · 0 paused/);
  assert.match(run(root, ['op', 'status', 'extra'], { expect: 1 }).stderr,
    /`op status` takes no positional arguments/);
  run(root, OPEN);
  const active = run(root, ['op', 'status']).stdout;
  assert.match(active, /Operation: Go Live \(go-live\) · 🔵/);
  assert.match(active, /Finish line: 1\. ship the v2 rules · 2\. publish the guide/);
  assert.match(active, /Fingerprint: [0-9a-f]{64}/);
  assert.match(active, /Pack: spend ceiling: 2k tokens · batches: deploy → 1 per day/);
  assert.match(active, /Spend so far: — \/ 2k tokens/);
  assert.match(active, /Quality bar: every claim carries an epistemic label/);
  assert.match(active, /Planned cells: login, enrolment/);
  run(root, ['op', 'pause', '--facts', 'f', '--next', 'n']);
  const idle = run(root, ['op', 'status']).stdout;
  assert.match(idle, /No active operation · 1 paused/);
  assert.match(idle, /- Go Live \(go-live\) · ⏸ · 2 finish-line items/);
});

test('check stays green on a log that carries operation entries', () => {
  const root = openedProject(freshRoot());
  run(root, ['open', 'Login', '--area', 'auth', '--in', 'src/login.ts', '--out', 'the router']);
  linkCellToOperation(root, 'login');
  run(root, ['pause', '--facts', 'wrote the parser', '--next', 'run `npm test`']);
  run(root, ['op', 'pause', '--facts', 'cell 1 of 2 closed', '--next', 'open Enrolment']);
  const out = run(root, ['check']);
  assert.match(out.stdout,
    /Integrity check passed · 0 active · 1 paused · 0 planned · 0 done · 1 log entries/);
  assert.equal(readState(root, 'log').match(/· Operation: /g)?.length, 2,
    'the operation entries are in the log and invisible to the cell parser');
});
