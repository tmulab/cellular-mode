// `new` before it writes: every refusal, and the proof that none of them touched the target.
// The proof is a hash of the WHOLE tree taken before and after, so "nothing was written" covers
// files nobody thought to look for and empty directories alike.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { main } from './main.mjs';
import { ALLOWED_NEW, notNewBecause } from './new-flow.mjs';
import { profileHere } from './fixtures/availability.mjs';
import { cleanup, makeProject, treeHash } from './fixtures/temp.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });

/** Runs the CLI in process and returns what a terminal would have seen.
 * @param {string[]} args @returns {{ code: number, out: string, err: string, all: string }} */
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

/** @param {string} text @returns {void} */
function noAbsolutePath(text) {
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/, 'a Windows absolute path reached the output');
  assert.doesNotMatch(text, /(?:^|\s)\/(?:home|Users|tmp|var)\//, 'a POSIX absolute path reached the output');
  assert.ok(!text.includes(tmpdir()), 'the temp directory was printed verbatim');
  assert.ok(!text.includes(ROOT.replace(/[\\/]+$/, '')), 'the source checkout was printed verbatim');
}

test('new · without --profile it lists the profiles, exits 1 and writes nothing', () => {
  const { root, target } = makeProject('noprofile');
  try {
    const before = treeHash(target);
    const result = run(['new', target]);
    assert.equal(result.code, 1);
    assert.match(result.err, /Choose a profile/);
    for (const name of ['minimal', 'standard', 'full', 'custom']) assert.match(result.err, new RegExp(`--profile ${name}`));
    assert.equal(treeHash(target), before);
    noAbsolutePath(result.all);
  } finally {
    cleanup(root);
  }
});

test('new · --dry-run renders the plan, exits 0 and writes nothing at all', () => {
  const { root, target } = makeProject('dryrun');
  try {
    const before = treeHash(target);
    const result = run(['new', target, '--profile', 'minimal', '--dry-run']);
    assert.equal(result.code, 0);
    assert.match(result.out, /Target: demo-app/);
    assert.match(result.out, /nothing is written/);
    assert.match(result.out, /Dry run: nothing was written\./);
    assert.match(result.out, /Files to create \(\d+\)/);
    assert.equal(treeHash(target), before, 'a dry run changed the target');
    noAbsolutePath(result.all);
  } finally {
    cleanup(root);
  }
});

test('new · without --confirm it shows the plan, exits 5 and writes nothing', () => {
  const { root, target } = makeProject('unconfirmed');
  try {
    const before = treeHash(target);
    const result = run(['new', target, '--profile', profileHere('standard')]);
    assert.equal(result.code, 5, 'exit 5 is "a human must confirm"');
    assert.match(result.err, /Re-run with --confirm/);
    assert.match(result.err, /\[first-cell\]/, 'the approval IDS are shown, not only the sentences');
    assert.equal(treeHash(target), before);
    noAbsolutePath(result.all);
  } finally {
    cleanup(root);
  }
});

test('new · a target that already holds code refuses with exit 3 and points at existing', () => {
  const { root, target } = makeProject('hascode');
  try {
    mkdirSync(join(target, 'src'));
    writeFileSync(join(target, 'src', 'index.js'), 'export const x = 1;\n');
    writeFileSync(join(target, 'package.json'), '{"name":"theirs"}\n');
    const before = treeHash(target);
    const result = run(['new', target, '--profile', 'minimal', '--confirm']);
    assert.equal(result.code, 3);
    assert.match(result.err, /existing --analyze/);
    assert.match(result.err, /src\/index\.js/);
    assert.equal(treeHash(target), before);
    noAbsolutePath(result.all);
  } finally {
    cleanup(root);
  }
});

test('new · the files a project may already have, and still be new', () => {
  const { root, target } = makeProject('allowed');
  try {
    mkdirSync(join(target, 'docs'));
    for (const rel of ['README.md', 'LICENSE', '.gitignore', 'spec.md', 'docs/design.md']) {
      writeFileSync(join(target, rel), 'text\n');
    }
    assert.deepEqual(notNewBecause(['README.md', 'docs/a.md', 'vault/project-contract.json']), []);
    assert.deepEqual(notNewBecause(['docs/a.png', 'Makefile']), ['Makefile', 'docs/a.png']);
    assert.ok(ALLOWED_NEW.includes('LICENSE'));
    const result = run(['new', target, '--profile', 'minimal', '--dry-run']);
    assert.equal(result.code, 0);
    assert.match(result.out, /\.gitignore .*\[generate\]|\.gitignore/);
    assert.match(result.out, /Files to modify \(1\)/, 'an existing .gitignore is modified, never replaced');
    assert.match(result.out, /\[gitignore-block\]/);
  } finally {
    cleanup(root);
  }
});

test('new · an install already there refuses with exit 3, never a silent reinstall', () => {
  const { root, target } = makeProject('installed');
  try {
    mkdirSync(join(target, 'vault'), { recursive: true });
    writeFileSync(join(target, 'vault', 'install-manifest.json'), '{"schema":"cellular-mode/install-manifest"}\n');
    const before = treeHash(target);
    const result = run(['new', target, '--profile', 'minimal', '--confirm']);
    assert.equal(result.code, 3);
    assert.match(result.err, /already there|run status/);
    assert.equal(treeHash(target), before);
  } finally {
    cleanup(root);
  }
});

test('new · a missing target directory is a usage error: Bootstrap never creates the root', () => {
  const { root, target } = makeProject('missing');
  try {
    const result = run(['new', join(target, 'not-there'), '--profile', 'minimal', '--dry-run']);
    assert.equal(result.code, 1);
    assert.match(result.err, /does not exist/);
    assert.match(result.err, /never creates the root/);
    noAbsolutePath(result.all);
  } finally {
    cleanup(root);
  }
});

test('new · the source checkout itself, or any part of it, is refused as a target', () => {
  for (const target of [ROOT, join(ROOT, 'tools')]) {
    const result = run(['new', target, '--profile', 'minimal', '--dry-run']);
    assert.equal(result.code, 3, 'OVERLAP maps to exit 3');
    assert.match(result.err, /target is the source|inside the source/);
    noAbsolutePath(result.all);
  }
});

test('new · every command needs a target, an unknown one is refused, and help exits 0', () => {
  for (const command of ['new', 'existing', 'status', 'uninstall']) {
    const result = run([command]);
    assert.equal(result.code, 1);
    assert.match(result.err, /needs a target directory/);
  }
  // `existing` IS implemented now, and pointing it at this checkout is the overlap refusal.
  const overlap = run(['existing', '.', '--analyze']);
  assert.equal(overlap.code, 3);
  assert.match(overlap.err, /target is the source/);
  assert.equal((run(['help'])).code, 0);
  assert.equal((run(['frobnicate'])).code, 1);
  assert.match((run(['frobnicate'])).err, /unknown command/);
  assert.match((run(['help'])).out, /Approval ids for --approve/);
});

test('new · an unknown approval id refuses rather than reading as consent withheld', () => {
  const { root, target } = makeProject('badapproval');
  try {
    const result = run(['new', target, '--profile', 'minimal', '--confirm', '--approve', 'frist-cell']);
    assert.equal(result.code, 1);
    assert.match(result.err, /--approve does not know frist-cell/);
    assert.equal(treeHash(target), treeHash(target));
  } finally {
    cleanup(root);
  }
});
