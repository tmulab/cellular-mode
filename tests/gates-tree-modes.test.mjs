// The Article 8 tree id must record the MODES git would commit, not only the bytes on disk.
//
// The defect this file pins down, found on 2026-10-07 while staging the hook-executability fix:
// `workingTreeId()` seeded its throwaway index with `git read-tree HEAD`, so a STAGED mode-only
// change — `git update-index --chmod=+x`, the only way to record `100755` on a machine where
// `core.filemode=false` — was invisible to it. HEAD said `100644`, the working tree carries no exec
// bit to contradict that, `git add -A` therefore changed nothing, and verify:final authorised a tree
// (7bcc6bd9…) that differed from the staged one (51a74c23…); `authorization.mjs commit` then refused
// the very commit the verification was run for. The fix seeds that index from a COPY of the real
// index file, so modes survive and content still comes from the working tree.
//
// Every assertion here is made against git itself, in a throwaway repository from
// `tests/git-fixture.mjs` with `core.filemode=false` set LOCALLY — never globally, and never in the
// repository this test lives in. It is deterministic on Windows and on POSIX alike.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, git, hasGit, makeRepo, write } from './git-fixture.mjs';
import { stagedTreeId, workingTreeId } from '../tools/gates/fingerprint.mjs';

const skip = hasGit() ? false : 'git is not available on this machine';

const HOOK = '.githooks/pre-commit';

/** @param {string} path @returns {string} */
const hashFile = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** A repository where `core.filemode=false` is the local truth and one tracked hook exists,
 * committed `100644`. That is the exact shape the defect needed.
 * @returns {string} the repository root */
function repoWithHook() {
  const root = makeRepo();
  const configured = git(root, ['config', '--local', 'core.filemode', 'false']);
  assert.equal(configured.status, 0, `${configured.stdout}${configured.stderr}`);
  write(root, HOOK, '#!/bin/sh\nexit 0\n');
  assert.equal(git(root, ['add', '-A']).status, 0);
  assert.equal(git(root, ['commit', '-q', '-m', 'add hook']).status, 0);
  return root;
}

/** The mode git records for `rel` in a given tree.
 * @param {string} root @param {string} tree @param {string} rel @returns {string} */
function treeMode(root, tree, rel) {
  const listed = git(root, ['ls-tree', '-r', tree, '--', rel]);
  assert.equal(listed.status, 0, `${listed.stdout}${listed.stderr}`);
  const row = listed.stdout.split('\n').find((line) => line.trim() !== '');
  assert.ok(row, `${rel} is absent from tree ${tree}`);
  return row.split(/\s+/)[0] ?? '';
}

test('tree id · a staged mode-only change is in the working tree id', { skip }, () => {
  const root = repoWithHook();
  try {
    assert.match(git(root, ['ls-files', '-s', HOOK]).stdout, /^100644 /,
      'the hook must start non-executable, or the fixture no longer reproduces the defect');

    const chmod = git(root, ['update-index', '--chmod=+x', HOOK]);
    assert.equal(chmod.status, 0, `${chmod.stdout}${chmod.stderr}`);
    assert.match(git(root, ['ls-files', '-s', HOOK]).stdout, /^100755 /);

    const tree = workingTreeId(root);
    assert.equal(tree, stagedTreeId(root),
      'the authorised tree must be the tree a commit would record');
    assert.equal(treeMode(root, tree, HOOK), '100755',
      'the exec bit staged with --chmod=+x must survive into the tree id');
  } finally {
    cleanup(root);
  }
});

test('tree id · computing it leaves the real index file byte-identical', { skip }, () => {
  const root = repoWithHook();
  try {
    assert.equal(git(root, ['update-index', '--chmod=+x', HOOK]).status, 0);
    const located = git(root, ['rev-parse', '--git-path', 'index']);
    assert.equal(located.status, 0, `${located.stdout}${located.stderr}`);
    const indexFile = join(root, located.stdout.trim());

    const before = hashFile(indexFile);
    workingTreeId(root);
    assert.equal(hashFile(indexFile), before, 'workingTreeId() must only READ the real index');
  } finally {
    cleanup(root);
  }
});

test('tree id · content still comes from the working tree, not from the index', { skip }, () => {
  const root = repoWithHook();
  try {
    appendFileSync(join(root, 'README.md'), 'an unstaged line\n');
    const working = workingTreeId(root);
    assert.notEqual(working, stagedTreeId(root),
      'an unstaged edit must change the working tree id, as it always did');

    const blob = git(root, ['hash-object', '--', join(root, 'README.md')]);
    assert.equal(blob.status, 0, `${blob.stdout}${blob.stderr}`);
    const row = git(root, ['ls-tree', '-r', working, '--', 'README.md']).stdout;
    assert.ok(row.includes(blob.stdout.trim()),
      `the tree must carry the working bytes of README.md: ${row}`);
  } finally {
    cleanup(root);
  }
});

test('tree id · a fresh repository with no commit still answers', { skip }, () => {
  const root = makeRepo({ commit: false });
  try {
    const tree = workingTreeId(root);
    assert.match(tree, /^[0-9a-f]{40}$/);
    assert.equal(treeMode(root, tree, 'README.md'), '100644');
  } finally {
    cleanup(root);
  }
});
