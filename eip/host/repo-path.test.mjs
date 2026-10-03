// A19 — the repository PATH RULE, pure: which names denote a readable file and which are
// refused, with the guard that answered named in every case.
//
// Split from repo-read-port.test.mjs for the reason the gates themselves are split: a rule
// that needs no disk should be testable with no disk. A test satisfied by any
// PERMISSION_DENIED would stay green with the whole exclusion list deleted, so each case
// asserts the exact refusal message.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRepoPath, assertRepoSegment } from './repo-read-port.mjs';
import { kernelError } from '../kernel/assertions.mjs';

/** @type {(error: unknown, message?: string) => boolean} */
const denied = (error, message) => {
  const named = kernelError(error);
  assert.equal(named.code, 'PERMISSION_DENIED');
  assert.equal(named.details[0]?.path, 'name');
  if (message !== undefined) assert.equal(named.details[0]?.message, message);
  return true;
};

test('A19 every escape shape is refused by a NAMED guard', () => {
  /** @type {Array<[unknown, string]>} */
  const cases = [
    ['', 'a repository path must be a non-empty string'],
    [7, 'a repository path must be a non-empty string'],
    ['a\u0000b', 'a repository path may not contain a NUL byte'],
    ['eip\\sdk\\index.mjs', 'a repository path uses forward slashes only'],
    ['../outside.md', 'parent-directory traversal is refused'],
    ['eip/../../outside.md', 'parent-directory traversal is refused'],
    ['/etc/passwd', 'absolute paths are refused'],
    // Assembled from fragments so this file never CONTAINS a drive-letter path: the leak
    // test forbids one in any source, and a test that needed an exception would be a
    // worse test. The value the guard sees is the same.
    [['C', ':', '/Windows/system.ini'].join(''), 'absolute paths are refused'],
    ['docs/logo.png', 'this port reads text, not binary files'],
    ['node_modules/x.mjs', 'this path is on the gates\' exclusion list'],
    ['.git/config', 'this path is on the gates\' exclusion list'],
    ['.cellular/evidence/trilateral.json', 'this path is on the gates\' exclusion list'],
  ];
  for (const [rel, message] of cases) {
    assert.throws(() => assertRepoPath(rel), (error) => denied(error, message), String(rel));
  }
  // The one widening, stated as a test: a single leading dot is allowed, `.` and `..` are not.
  assert.deepEqual(assertRepoPath('.claude/skills/cell/SKILL.md'), ['.claude', 'skills', 'cell', 'SKILL.md']);
  assert.equal(assertRepoSegment('.gitignore'), '.gitignore');
  assert.equal(assertRepoSegment('three@0.180.0'), 'three@0.180.0');
  for (const segment of ['.', '..', '...', 'a/b', 'a@b']) {
    assert.throws(() => assertRepoSegment(segment), (error) => denied(error), segment);
  }
});
