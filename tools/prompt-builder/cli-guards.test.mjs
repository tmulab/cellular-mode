// What the Builder's CLI REFUSES, and what it never prints.
//
// RULE FOR THIS FILE: it writes exclusively inside the directory `mkdtemp` just created for it
// under `os.tmpdir()`, and removes exactly that directory after a prefix check. The repository's
// real `vault/` is never touched.
//
// THE SECRET-SHAPED SAMPLE IS ASSEMBLED FROM FRAGMENTS AT RUNTIME, so this file contains no
// literal credential — the discipline of answers.test.mjs and tests/leaks.test.mjs.
//
// THE LAST TWO TESTS ARE THE ONES THAT GENERALISE. One runs every command once and asserts the
// exit table covers every refusal the Builder can raise; the other asserts that NOTHING any
// command printed carries an absolute path. A relative path is the only thing a contract, a
// prompt or a terminal line may name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeSkeleton } from '../cellmode/state.mjs';
import { EXIT_FOR } from './cli-shared.mjs';
import { CODES } from './errors.mjs';
import { absoluteHits, freshRoot, runCli } from './fixtures/cli-harness.mjs';

const PREFIX = 'builder-guards-';
/** @type {string[]} */
const created = [];

test.after(() => {
  for (const root of created) {
    assert.ok(root.includes(PREFIX), `refusing to remove ${root}`);
    rmSync(root, { recursive: true, force: true });
  }
});

/** @returns {string} */
function freshVault() {
  const root = freshRoot(PREFIX, created);
  writeSkeleton(root);
  return root;
}

/** @type {(...parts: string[]) => string} */
const j = (...parts) => parts.join('');

test('cli · the exit table covers every refusal the Builder can raise', () => {
  const uncovered = Object.values(CODES).filter((code) => !(code in EXIT_FOR));
  assert.deepEqual(uncovered, [], `codes with no exit: ${uncovered.join(', ')}`);
  assert.deepEqual(
    [...new Set(Object.values(EXIT_FOR))].sort((a, b) => a - b),
    [1, 2, 3, 5],
    'the table uses only the documented exits',
  );
});

test('cli · no command, an unknown command and a bad --mode are usage errors', () => {
  const root = freshVault();
  assert.equal(runCli([], root).code, 1);
  const unknown = runCli(['definitely-not-a-command'], root);
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /unknown command: definitely-not-a-command/);
  assert.match(unknown.err, /Usage: node tools\/prompt-builder\/cli\.mjs/);
  assert.equal(runCli(['help'], root).code, 0);

  runCli(['start', 'new', '--name', 'Task List'], root);
  const mode = runCli(['status', '--mode', 'exhausted'], root);
  assert.equal(mode.code, 1);
  assert.match(mode.err, /--mode is one of ready, tired, focus, explore/);
  assert.match(mode.err, /never inferred/);
});

test('cli · a secret-shaped answer is refused, exit 1, without echoing the value', () => {
  const root = freshVault();
  runCli(['start', 'new', '--name', 'Task List'], root);
  const sample = j('AKI', 'AQWERTYUIOPASDFG1');
  const refused = runCli(['answer', 'technologies', `use ${sample} to log in`], root);
  assert.equal(refused.code, 1, refused.all);
  assert.match(refused.err, /looks like a cloud access key id/);
  assert.equal(refused.all.includes(sample), false, 'a refusal never repeats what it refused');

  const machinePath = j('C', ':', '\\', 'Users', '\\', 'someone', '\\', 'project');
  const path = runCli(['answer', 'environment', `it runs from ${machinePath}`], root);
  assert.equal(path.code, 1, path.all);
  assert.match(path.err, /use a path relative to the project/);
  assert.equal(path.all.includes(machinePath), false);
});

test('cli · commands that need a draft say which command creates one', () => {
  const root = freshVault();
  for (const command of ['status', 'next', 'approve']) {
    const result = runCli([command], root);
    assert.equal(result.code, 1, `${command}: ${result.all}`);
    assert.match(result.err, /no discovery draft yet — run `start new`/);
  }
  const cell = runCli(['cell'], root);
  assert.equal(cell.code, 1, cell.all);
  assert.match(cell.err, /no contract and no discovery draft yet/);
});

test('cli · an unimplemented adapter refuses instead of exporting something plausible', () => {
  const root = freshVault();
  runCli(['start', 'new', '--name', 'Task List'], root);
  const unknown = runCli(['prompt', '--adapter', 'nothing-like-it', '--draft'], root);
  assert.equal(unknown.code, 1, unknown.all);
  assert.match(unknown.err, /no such adapter/);
  const proposed = runCli(['prompt', '--adapter', 'cursor', '--draft'], root);
  assert.equal(proposed.code, 1, proposed.all);
  assert.match(proposed.err, /proposed, not implemented/);
  const unapproved = runCli(['prompt'], root);
  assert.equal(unapproved.code, 2, unapproved.all);
  assert.match(unapproved.err, /the contract is not approved/);
});

// The optional-module rule, from the other side: the temporary root has no `tools/adaptive/` and
// no `adaptive/policies/` at all, and every command above already ran inside it. The CLI reads a
// mode from `--mode` and from nowhere else, so there is nothing for it to miss.
test('cli · the Builder never looks for the optional adaptive module', () => {
  const root = freshVault();
  assert.equal(existsSync(join(root, 'tools')), false, 'the temporary root has no tools/');
  runCli(['start', 'new', '--name', 'Task List'], root);
  for (const mode of ['ready', 'tired', 'focus', 'explore']) {
    const result = runCli(['status', '--mode', mode], root);
    assert.equal(result.code, 0, `${mode}: ${result.all}`);
  }
});

test('cli · nothing any command prints carries an absolute path', () => {
  const root = freshVault();
  /** @type {string[]} */
  const printed = [];
  /** @type {(args: string[]) => void} */
  const say = (args) => { printed.push(runCli(args, root).all); };
  say(['start', 'new', '--name', 'Task List']);
  say(['answer', 'objective', 'A to-do list for one person.']);
  say(['answer', 'scope-in', 'add a task; list tasks']);
  say(['answer', 'sensitive-data', 'No. Only my own task titles.']);
  say(['answer', 'acceptance', 'I can add two tasks and see both']);
  say(['skip', 'users']);
  say(['status']);
  say(['next']);
  say(['decide', 'propose', '--question', 'Which runtime?', '--proposal', 'Node.js']);
  say(['decide', 'D1', 'reject', '--confirm']);
  say(['approve']);
  say(['approve', '--confirm']);
  say(['cell']);
  say(['cell', '--accept', '--confirm']);
  say(['prompt']);
  say(['prompt', '--adapter', 'claude-code']);
  say(['adapters']);
  say(['help']);
  say(['definitely-not-a-command']);
  say(['answer', 'nope', 'whatever']);
  /** @type {string[]} */
  const offenders = [];
  for (const text of printed) {
    for (const hit of absoluteHits(text)) offenders.push(hit.trim());
    if (text.includes(root)) offenders.push('the project root itself');
  }
  assert.deepEqual(offenders, [], `absolute paths printed: ${offenders.join(' · ')}`);
});
