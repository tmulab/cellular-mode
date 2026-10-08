// Contract H5 — consent shows content — plus the two truncations the trial found.
//
// B-03: the managed-block TEXT was never rendered, although the plan's own `why:` promised "the
// block is shown before it is written". So the plan now carries the EXACT bytes `appendBlock`
// would write, and this file ties them to the template files on disk rather than to a copy of
// them: every line of `bootstrap/templates/*` must appear in the plan, and the `--json` form's
// block text must be the text the human reads, line for line.
// B-04: one dry run printed TWO different approval lists, neither complete. There is now ONE, and
// the text and the JSON must carry the same ids in the same order.
// B-12: `uninstall --dry-run --verbose` hid 44 of 52 deletions. A destructive plan is reviewable.
// A-13: the one "Not applied" limitation printed truncated mid-command.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './main.mjs';
import { EXEC_BIT_LIMITATION } from './integrate-hooks.mjs';
import { PATH_CAP } from './status.mjs';
import { initGit } from './fixtures/projects.mjs';
import { cleanup, makeProject } from './fixtures/temp.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });

/** @param {string} name @returns {string[]} the non-empty lines of one template, as written */
const templateLines = (name) => readFileSync(join(ROOT, 'bootstrap', 'templates', name), 'utf8')
  .split('\n').filter((line) => line.trim() !== '');

/** The approval ids a TEXT plan shows, read from the one approval section only: the Adoption
 * report's conflicts use the same `- [kind]` shape, and counting those would hide the defect.
 * @param {string} text @returns {string[]} */
function approvalIdsIn(text) {
  const start = text.indexOf('Approvals');
  const section = start === -1 ? '' : text.slice(start);
  return [...section.matchAll(/^ {2}- \[([a-z0-9-]+)\] /gm)].map((found) => String(found[1]));
}

/** @param {string[]} args @returns {{ code: number, all: string }} */
function run(args) {
  let all = '';
  const write = (/** @type {string} */ text) => { all += text; return true; };
  return { code: main(['node', 'cli.mjs', ...args], { stdout: { write }, stderr: { write }, env: { ...ENV } }), all };
}

/** A target holding the two files Bootstrap may append a managed block to. @param {string} tag
 * @returns {{ root: string, target: string }} */
function managedTarget(tag) {
  const made = makeProject(tag);
  writeFileSync(join(made.target, 'AGENTS.md'), '# Their rules\n\nTheirs.\n');
  writeFileSync(join(made.target, '.gitignore'), 'node_modules/\n');
  return made;
}

test('H5 · the exact managed-block text is in the plan, before any --confirm', () => {
  const { root, target } = managedTarget('consent-text');
  try {
    const result = run(['new', target, '--profile', 'minimal']);
    assert.equal(result.code, 5, 'no --confirm is exit 5');
    assert.match(result.all, /the exact text to append, with --approve gitignore-block/);
    assert.match(result.all, /the exact text to append, with --approve agents-block/);
    assert.match(result.all, /^ {6}\+ # cellular-mode:begin \(bootstrap\)$/m);
    assert.match(result.all, /^ {6}\+ <!-- cellular-mode:begin method-core -->$/m);
    for (const name of ['gitignore-block.txt', 'agents-block.md']) {
      for (const line of templateLines(name)) {
        assert.ok(result.all.includes(`      + ${line}`), `the plan omits a line of ${name}: ${line}`);
      }
    }
  } finally {
    cleanup(root);
  }
});

test('H5 · the --json plan carries the same block text, line for line', () => {
  const { root, target } = managedTarget('consent-json');
  try {
    const text = run(['new', target, '--profile', 'minimal']);
    const json = run(['new', target, '--profile', 'minimal', '--json']);
    assert.equal(json.code, 5);
    const plan = JSON.parse(json.all);
    assert.deepEqual(plan.blocks.map((/** @type {{ path: string }} */ b) => b.path).sort(),
      ['.gitignore', 'AGENTS.md']);
    for (const block of plan.blocks) {
      assert.match(block.text, /cellular-mode:begin/);
      assert.match(block.text, /cellular-mode:end/);
      for (const line of String(block.text).replace(/\n+$/, '').split('\n')) {
        assert.ok(text.all.includes(`      + ${line}`), `the text form omits ${block.path}: ${line}`);
      }
    }
    assert.deepEqual(plan.blocks.map((/** @type {{ approval: string }} */ b) => b.approval).sort(),
      ['agents-block', 'gitignore-block']);
  } finally {
    cleanup(root);
  }
});

test('H5 · ONE complete approval list, identical in the text and the JSON', () => {
  const { root, target } = managedTarget('consent-one-list');
  try {
    const json = JSON.parse(run(['new', target, '--profile', 'minimal', '--json']).all);
    const ids = json.approvals.map((/** @type {{ id: string }} */ entry) => entry.id);
    assert.deepEqual(ids, ['agents-block', 'gitignore-block', 'first-cell', 'ci-workflow']);
    for (const entry of json.approvals) assert.ok(String(entry.why).length > 10, `${entry.id} has no why`);
    const text = run(['new', target, '--profile', 'minimal']).all;
    assert.deepEqual(approvalIdsIn(text), ids, 'the text and the JSON disagree about the approval list');
    assert.equal((text.match(/Approvals/g) ?? []).length, 1, 'more than one approval list was printed');
  } finally {
    cleanup(root);
  }
});

test('H5 · adopting an existing project also prints exactly one approval list, with baseline-checks', () => {
  const { root, target } = managedTarget('consent-existing');
  try {
    initGit(target);
    const text = run(['existing', target, '--profile', 'minimal', '--dry-run']).all;
    assert.equal((text.match(/Approvals this run can use/g) ?? []).length, 1);
    assert.equal((text.match(/Approvals required/g) ?? []).length, 0,
      'the report printed a second, different approval list (B-04)');
    const json = JSON.parse(run(['existing', target, '--profile', 'minimal', '--dry-run', '--json']).all);
    const ids = json.approvals.map((/** @type {{ id: string }} */ entry) => entry.id);
    assert.ok(ids.includes('baseline-checks'), 'the one list is not the complete one');
    assert.deepEqual(approvalIdsIn(text), ids);
  } finally {
    cleanup(root);
  }
});

test('A-13 · the hooks limitation is printed whole, never cut mid-command', () => {
  const { root, target } = makeProject('limitation-full');
  try {
    const started = initGit(target, { commit: false });
    if (!started.ok) return;
    const result = run(['new', target, '--profile', 'minimal', '--confirm', '--approve', 'hooks']);
    assert.equal(result.code, 0, result.all);
    assert.ok(result.all.includes(EXEC_BIT_LIMITATION),
      'the limitation was not printed in full, so its command is not actionable');
    assert.match(result.all, /git update-index --chmod=\+x \.githooks\/pre-commit \.githooks\/commit-msg \.githooks\/pre-push/);
    assert.doesNotMatch(result.all, /git update-…/);
  } finally {
    cleanup(root);
  }
});

test('B-12 · uninstall --dry-run --verbose lists every planned action; the default says how', () => {
  const { root, target } = makeProject('uninstall-verbose');
  try {
    assert.equal(run(['new', target, '--profile', 'minimal', '--confirm']).code, 0);
    const recorded = JSON.parse(readFileSync(join(target, 'vault', 'install-manifest.json'), 'utf8'));
    const removable = recorded.files.filter((/** @type {{ mode: string }} */ f) => f.mode !== 'reference');
    assert.ok(removable.length > PATH_CAP, 'this fixture is too small to prove anything about the cap');
    const capped = run(['uninstall', target, '--dry-run']);
    assert.equal(capped.code, 0);
    assert.match(capped.all, /… and \d+ more — re-run with --verbose to list every one/);
    const full = run(['uninstall', target, '--dry-run', '--verbose']);
    assert.equal(full.code, 0);
    assert.doesNotMatch(full.all, /… and \d+ more/, 'a destructive plan still hid steps');
    for (const file of removable) {
      assert.ok(full.all.includes(`      ${file.path} —`), `--verbose omitted ${file.path}`);
    }
  } finally {
    cleanup(root);
  }
});
