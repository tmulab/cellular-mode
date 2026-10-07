// `uninstall` END TO END, the reversibility claim — install, uninstall, and prove the target is the
// directory it was before, file by file and byte by byte.
//
// THE WITNESS IS A DIGEST PER FILE, taken before the install and again after the uninstall, `.git`
// excluded because a hook configuration is exactly what an uninstall is supposed to change there —
// and that change is asserted separately, by asking git. `--dry-run` is checked against the FULL
// tree hash, `.git` included, because "it writes nothing" has to include the index.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from './main.mjs';
import { gitHooksPath } from './exec.mjs';
import { HOOKS_DIR } from './plan-constants.mjs';
import { sha256 } from './writer.mjs';
import { cleanup, listFiles, makeProject, treeHash } from './fixtures/temp.mjs';
import { initGit } from './fixtures/projects.mjs';

const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });

/** @param {string[]} args @returns {{ code: number, out: string, err: string, all: string }} */
function run(args) {
  let out = '';
  let err = '';
  const code = main(['node', 'cli.mjs', ...args], {
    stdout: { write: (text) => { out += text; return true; } },
    stderr: { write: (text) => { err += text; return true; } },
    env: { ...ENV },
  });
  return { code, out, err, all: `${out}${err}` };
}

/** Every file of a tree with its digest, `.git` excluded. @param {string} dir
 * @returns {Map<string, string>} */
function digests(dir) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const rel of listFiles(dir)) {
    if (rel.startsWith('.git/')) continue;
    out.set(rel, sha256(readFileSync(join(dir, ...rel.split('/')))));
  }
  return out;
}

test('uninstall · a minimal install removed leaves the directory it found, byte for byte', () => {
  const { root, target } = makeProject('round-trip');
  try {
    // A project that is "new" but not empty: a README, a docs page and a real repository.
    writeFileSync(join(target, 'README.md'), '# demo-app\n\nMine.\n');
    mkdirSync(join(target, 'docs'));
    writeFileSync(join(target, 'docs', 'notes.md'), 'kept\n');
    assert.equal(initGit(target).ok, true, 'this test needs a real repository');
    const before = digests(target);

    const install = run(['new', target, '--profile', 'minimal', '--confirm', '--approve', 'first-cell,hooks']);
    assert.equal(install.code, 0, install.all);
    assert.equal(gitHooksPath(target, { ...ENV }), HOOKS_DIR, 'the install must have set the hook path');
    assert.ok(digests(target).size > before.size + 20, 'the install must really have written files');

    const removed = run(['uninstall', target, '--confirm']);
    assert.equal(removed.code, 0, removed.all);
    assert.match(removed.out, /Uninstalled Cellular Mode from demo-app/);
    assert.match(removed.out, /Hooks: unset/);
    assert.match(removed.out, /removed last, as the record of an install that is now fully removed/);
    assert.deepEqual([...digests(target).entries()].sort(), [...before.entries()].sort(),
      'the target is not the directory the install found');
    assert.equal(gitHooksPath(target, { ...ENV }), null, 'core.hooksPath must be unset again');
    assert.doesNotMatch(removed.all, /[A-Za-z]:[\\/]/);
    assert.ok(!removed.all.includes(tmpdir()));
  } finally {
    cleanup(root);
  }
});

test('uninstall · --dry-run writes nothing at all, and no --confirm is exit 5', () => {
  const { root, target } = makeProject('dry-run');
  try {
    initGit(target, { commit: false });
    assert.equal(run(['new', target, '--profile', 'minimal', '--confirm', '--approve', 'first-cell']).code, 0);
    const before = treeHash(target);

    const dry = run(['uninstall', target, '--dry-run']);
    assert.equal(dry.code, 0, dry.all);
    assert.match(dry.out, /Uninstall plan — \d+ recorded paths/);
    assert.match(dry.out, /Dry run: nothing was removed, nothing was written\./);
    assert.equal(treeHash(target), before, '--dry-run wrote into the target');

    const asked = run(['uninstall', target]);
    assert.equal(asked.code, 5, asked.all);
    assert.match(asked.err, /Nothing was removed\. Re-run with --confirm/);
    assert.equal(treeHash(target), before, 'the plan without --confirm wrote into the target');

    // --force-modified alone does nothing, and says so.
    const forced = run(['uninstall', target, '--force-modified', 'AGENTS.md']);
    assert.equal(forced.code, 5, forced.all);
    assert.match(forced.err, /had NO effect/);
    assert.equal(treeHash(target), before);
  } finally {
    cleanup(root);
  }
});

test('uninstall · twice is not an error: the second run reports "not installed" and exits 0', () => {
  const { root, target } = makeProject('idempotent');
  try {
    initGit(target, { commit: false });
    assert.equal(run(['new', target, '--profile', 'minimal', '--confirm', '--approve', 'first-cell']).code, 0);
    assert.equal(run(['uninstall', target, '--confirm']).code, 0);
    const second = run(['uninstall', target, '--confirm']);
    assert.equal(second.code, 0, second.all);
    assert.match(second.out, /Not installed/);
    assert.deepEqual(listFiles(target).filter((rel) => !rel.startsWith('.git/')), [],
      'a full uninstall leaves no file of its own behind');
  } finally {
    cleanup(root);
  }
});
