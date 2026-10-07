// The DRY-RUN AND IDEMPOTENCE MATRIX: every command that claims to write nothing, proved against a
// hash of the whole target INCLUDING `.git`, and every command run twice, proved identical.
//
// Why `.git` is in the hash. A plain `git status` refreshes and REWRITES `.git/index`, so a tool
// that merely LOOKS at a repository can change it — and a "nothing was written" claim that excluded
// the one directory most likely to move would be the claim nobody checked. `exec.readOnlyGitEnv`
// exists for this, and this file is where that decision is actually tested.
//
// Why identical OUTPUT matters as much as identical disk. An analysis a human reads twice and gets
// two answers from is not an analysis; and a second install that silently repaired something would
// make "refused, here is your state" a lie. The clock is injected (`CELLMODE_NOW`), so a difference
// between two runs is a difference in the tool, never in the time.
//
// The matrix, in order: READ-ONLY (four profiles of `new --dry-run`, `existing --analyze`,
// `existing --dry-run`, `uninstall --dry-run`, `status`) · REPEATED (analysis twice, status twice)
// · REFUSED (install, then `new` and `existing` again) · REVERSIBLE (uninstall twice).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './main.mjs';
import { TREES, initGit, materialize } from './fixtures/projects.mjs';
import { cleanup, makeProject, treeHash } from './fixtures/temp.mjs';

const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });

/** Runs the CLI in process. @param {string[]} args @returns {{ code: number, out: string }} */
function run(args) {
  let out = '';
  const code = main(['node', 'cli.mjs', ...args], {
    stdout: { write: (text) => { out += text; return true; } },
    stderr: { write: (text) => { out += text; return true; } },
    env: { ...ENV },
  });
  return { code, out };
}

/** A target that is a real git repository holding a small node project, so the read-only claims are
 * made against the directory that is hardest to leave alone.
 * @param {string} tag @returns {{ root: string, target: string, git: boolean }} */
function gitProject(tag) {
  const { root, target } = makeProject(tag);
  materialize(target, TREES.node ?? {});
  const git = initGit(target).ok;
  return { root, target, git };
}

/** `new --dry-run`, one row per profile. `new` refuses a directory that already holds a project, so
 * these run against an EMPTY git repository — which is still the hard case for `.git`.
 * @type {ReadonlyArray<{ label: string, args: ReadonlyArray<string> }>} */
const NEW_ROWS = Object.freeze([
  { label: 'new --dry-run minimal', args: ['new', '@', '--profile', 'minimal', '--dry-run'] },
  { label: 'new --dry-run standard', args: ['new', '@', '--profile', 'standard', '--dry-run'] },
  { label: 'new --dry-run full', args: ['new', '@', '--profile', 'full', '--dry-run'] },
  { label: 'new --dry-run custom', args: ['new', '@', '--profile', 'custom', '--components', 'method-core,verification', '--dry-run'] },
  { label: 'new without --confirm', args: ['new', '@', '--profile', 'minimal'] },
]);

/** The adoption and management commands, against a populated git repository.
 * @type {ReadonlyArray<{ label: string, args: ReadonlyArray<string> }>} */
const EXISTING_ROWS = Object.freeze([
  { label: 'existing --analyze', args: ['existing', '@', '--analyze'] },
  { label: 'existing --analyze --json', args: ['existing', '@', '--analyze', '--json'] },
  { label: 'existing --dry-run minimal', args: ['existing', '@', '--profile', 'minimal', '--dry-run'] },
  { label: 'existing --dry-run full', args: ['existing', '@', '--profile', 'full', '--dry-run'] },
  { label: 'existing without --confirm', args: ['existing', '@', '--profile', 'standard'] },
  { label: 'status', args: ['status', '@'] },
]);

test('idempotence · every read-only command leaves the target byte-identical, .git included', () => {
  const empty = makeProject('readonlynew');
  const populated = gitProject('readonlyexisting');
  try {
    initGit(empty.target, { commit: false });
    assert.equal(existsSync(join(populated.target, '.git')), populated.git,
      'the fixture must agree with itself about git');
    for (const [dir, rows] of [[empty.target, NEW_ROWS], [populated.target, EXISTING_ROWS]]) {
      const before = treeHash(String(dir));
      for (const { label, args } of /** @type {typeof NEW_ROWS} */ (rows)) {
        const result = run(args.map((arg) => (arg === '@' ? String(dir) : arg)));
        assert.ok([0, 2, 5].includes(result.code), `${label} exited ${result.code}: ${result.out}`);
        assert.equal(treeHash(String(dir)), before, `${label} wrote into the target`);
      }
    }
  } finally {
    cleanup(populated.root);
    cleanup(empty.root);
  }
});

test('idempotence · uninstall --dry-run writes nothing, installed or not', () => {
  const { root, target } = gitProject('uninstalldry');
  try {
    const empty = treeHash(target);
    const absent = run(['uninstall', target, '--dry-run']);
    assert.ok([0, 2].includes(absent.code), absent.out);
    assert.equal(treeHash(target), empty, 'a dry uninstall of nothing wrote something');
    assert.equal(run(['existing', target, '--profile', 'minimal', '--confirm']).code, 0);
    const installed = treeHash(target);
    const dry = run(['uninstall', target, '--dry-run']);
    assert.equal(dry.code, 0, dry.out);
    assert.equal(treeHash(target), installed, 'a dry uninstall of an install wrote something');
    // And without --confirm it is exit 5, still writing nothing: confirmation is the gate.
    const asked = run(['uninstall', target]);
    assert.equal(asked.code, 5);
    assert.equal(treeHash(target), installed);
  } finally {
    cleanup(root);
  }
});

test('idempotence · the same analysis twice is the same text, and the same JSON', () => {
  const { root, target } = gitProject('twice');
  try {
    const first = run(['existing', target, '--analyze']);
    const second = run(['existing', target, '--analyze']);
    assert.equal(first.code, second.code);
    assert.equal(first.out, second.out, 'two analyses of one unchanged repository disagreed');
    const a = run(['existing', target, '--analyze', '--json']);
    const b = run(['existing', target, '--analyze', '--json']);
    assert.equal(a.out, b.out, 'two JSON analyses disagreed');
    assert.deepEqual(JSON.parse(a.out.slice(a.out.indexOf('{'))), JSON.parse(b.out.slice(b.out.indexOf('{'))));
    // The plan is pure too: rendering it twice is the same plan.
    const p1 = run(['new', target, '--profile', 'standard', '--dry-run']);
    const p2 = run(['new', target, '--profile', 'standard', '--dry-run']);
    assert.equal(p1.out, p2.out, 'two renderings of one plan disagreed');
  } finally {
    cleanup(root);
  }
});

test('idempotence · a second install is REFUSED with exit 3 and changes nothing', () => {
  const { root, target } = gitProject('second');
  try {
    const install = run(['existing', target, '--profile', 'minimal', '--confirm', '--approve', 'first-cell']);
    assert.equal(install.code, 0, install.out);
    const after = treeHash(target);
    for (const args of [
      ['new', target, '--profile', 'minimal', '--confirm'],
      ['new', target, '--profile', 'full', '--confirm'],
      ['existing', target, '--profile', 'standard', '--confirm'],
      ['existing', target, '--profile', 'minimal', '--dry-run'],
    ]) {
      const again = run(args);
      assert.equal(again.code, 3, `${args.slice(0, 4).join(' ')} did not refuse: ${again.out}`);
      assert.match(again.out, /already|installed/i, 'the refusal must name the state it found');
      assert.equal(treeHash(target), after, `${args.join(' ')} changed the target anyway`);
    }
  } finally {
    cleanup(root);
  }
});

test('idempotence · status twice is the same report, before and after an install', () => {
  const { root, target } = gitProject('status');
  try {
    const bare1 = run(['status', target]);
    const bare2 = run(['status', target]);
    assert.equal(bare1.out, bare2.out, 'status of a repository with no install is not stable');
    assert.equal(run(['existing', target, '--profile', 'minimal', '--confirm']).code, 0);
    const after = treeHash(target);
    const one = run(['status', target]);
    const two = run(['status', target]);
    assert.equal(one.code, 0, one.out);
    assert.equal(one.out, two.out, 'status of a healthy install is not stable');
    assert.match(one.out, /healthy/i);
    assert.equal(treeHash(target), after, 'status wrote into the target');
  } finally {
    cleanup(root);
  }
});

test('idempotence · uninstall twice: the second run reports "not installed" and writes nothing', () => {
  const { root, target } = gitProject('twiceremove');
  try {
    const projectOnly = treeHash(target);
    assert.equal(run(['existing', target, '--profile', 'minimal', '--confirm']).code, 0);
    const first = run(['uninstall', target, '--confirm']);
    assert.equal(first.code, 0, first.out);
    const afterFirst = treeHash(target);
    const second = run(['uninstall', target, '--confirm']);
    assert.equal(second.code, 0, second.out);
    assert.match(second.out, /not installed|no installation|nothing/i);
    assert.equal(treeHash(target), afterFirst, 'the second uninstall changed the target');
    assert.equal(existsSync(join(target, 'vault', 'install-manifest.json')), false);
    // The project's own files are exactly as they were: an uninstall removes what it created and
    // nothing else, so the tree is back to the hash it had before the install.
    assert.equal(existsSync(join(target, 'package.json')), true);
    assert.equal(existsSync(join(target, 'skills', 'cell', 'SKILL.md')), false);
    assert.equal(afterFirst, projectOnly,
      'the target did not return to the state it was in before the install');
    assert.equal(run(['status', target]).code, 0, 'status after a full uninstall is not an error');
  } finally {
    cleanup(root);
  }
});
