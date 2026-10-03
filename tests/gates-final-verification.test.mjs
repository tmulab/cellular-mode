// Article 8 — verification at the final state. The regression this file exists for is
// REAL: commit 523cb44 of this repository was pushed with a failing test because a vault
// entry was written AFTER the suite had been run (policy/relaxations.md R-4).
//
// So the central test is (b): a successful verification followed by one appended line in
// `vault/state/log.md` must leave the repository UNAUTHORIZED. Every other case here is a
// variant of the same question over the other controlled file kinds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprintOf, fingerprintRepo, hashText, repoState } from '../tools/gates/fingerprint.mjs';
import {
  FINAL_EVIDENCE_PATH, findAuthorization, parseRecords, sanitizeSummary, verdict,
} from '../tools/gates/final-evidence.mjs';
import { runFinalVerification } from '../tools/gates/verify-final.mjs';
import { authorized } from '../tools/gates/authorization.mjs';
import { cleanup, hasGit, makeRepo, stubSuite, write } from './git-fixture.mjs';

const GIT = hasGit();
const skip = GIT ? false : 'git is not available on this machine';

/** @param {string} root @param {{ exits?: ReadonlyArray<number>, during?: (root: string) => void }} [options] */
const verify = (root, options) => runFinalVerification({ root, suite: stubSuite(options) });

/** @param {string} root @returns {ReadonlyArray<import('../tools/gates/final-evidence.mjs').FinalRecord>} */
function records(root) {
  const full = join(root, FINAL_EVIDENCE_PATH);
  return existsSync(full) ? parseRecords(readFileSync(full, 'utf8')) : [];
}

test('fingerprint · the pure core is order-independent and content-sensitive', () => {
  const a = [{ path: 'b.md', hash: hashText('two') }, { path: 'a.md', hash: hashText('one') }];
  const b = [{ path: 'a.md', hash: hashText('one') }, { path: 'b.md', hash: hashText('two') }];
  assert.equal(fingerprintOf(a), fingerprintOf(b), 'the file order must not matter');
  assert.match(fingerprintOf(a), /^[0-9a-f]{64}$/);
  const changed = [{ path: 'a.md', hash: hashText('one!') }, { path: 'b.md', hash: hashText('two') }];
  assert.notEqual(fingerprintOf(a), fingerprintOf(changed));
  const renamed = [{ path: 'a2.md', hash: hashText('one') }, { path: 'b.md', hash: hashText('two') }];
  assert.notEqual(fingerprintOf(a), fingerprintOf(renamed), 'a rename is a state change');
});

test('verdict · PASS needs every check green AND the fingerprint unchanged', () => {
  const green = [{ name: 'one', exit: 0 }, { name: 'two', exit: 0 }];
  assert.equal(verdict({ checks: green, before: 'aa', after: 'aa' }).ok, true);
  const moved = verdict({ checks: green, before: 'aa', after: 'bb' });
  assert.equal(moved.ok, false);
  assert.match(moved.reason, /changed during verification/);
  const red = verdict({ checks: [{ name: 'one', exit: 2 }], before: 'aa', after: 'aa' });
  assert.equal(red.ok, false);
  assert.match(red.reason, /one/);
});

test('sanitizeSummary · an absolute machine path never reaches the evidence file', () => {
  const dirty = 'error in D:\\\\Work\\\\secret\\\\file.mjs and /home/person/other.mjs';
  const clean = sanitizeSummary(dirty);
  assert.ok(!clean.includes('secret'), clean);
  assert.ok(!clean.includes('/home/person/'), clean);
  assert.match(clean, /<path>/);
});

test('(a) a successful verification authorizes the exact state', { skip }, () => {
  const root = makeRepo();
  try {
    const result = verify(root);
    assert.equal(result.ok, true, result.reason);
    const state = repoState(root);
    assert.equal(result.record.fingerprint, state.fingerprint);
    assert.equal(result.record.tree, state.tree);
    const auth = authorized(root);
    assert.equal(auth.ok, true, auth.reason);
    assert.equal(auth.evidence?.fingerprint, state.fingerprint);
  } finally {
    cleanup(root);
  }
});

// THE REGRESSION. One appended vault line after a green suite must invalidate it.
test('(b) a vault log line appended AFTER verification revokes authorization', { skip }, () => {
  const root = makeRepo();
  try {
    assert.equal(verify(root).ok, true);
    appendFileSync(join(root, 'vault', 'state', 'log.md'), '\n## entry two · written too late\n', 'utf8');
    const auth = authorized(root);
    assert.equal(auth.ok, false, 'the stale authorization must not survive the late write');
    assert.match(auth.reason, /no .*evidence|stale|not authorized/i);
    assert.equal(records(root).length, 1, 'the evidence record itself is append-only, not rewritten');
  } finally {
    cleanup(root);
  }
});

/** @type {ReadonlyArray<[string, (root: string) => void]>} */
const LATE_WRITES = Object.freeze([
  ['a doc', (root) => write(root, 'docs/guide.md', '# Guide\n\nTwo paragraphs.\n')],
  ['a test file', (root) => write(root, 'src/unit.test.mjs', '// edited\nexport const ok = false;\n')],
  ['a release checklist', (root) => write(root, 'RELEASE_CHECKLIST.md', '- [x] one item\n')],
  ['a cell contract', (root) => write(root, 'vault/state/cells/new.md', '# New cell\n')],
  ['an untracked new file', (root) => write(root, 'tools/extra.mjs', 'export const x = 1;\n')],
  ['a deletion', (root) => rmSync(join(root, 'docs', 'guide.md'))],
]);

for (const [label, mutate] of LATE_WRITES) {
  test(`(c) ${label} written after verification revokes authorization`, { skip }, () => {
    const root = makeRepo();
    try {
      assert.equal(verify(root).ok, true);
      mutate(root);
      assert.equal(authorized(root).ok, false, `${label} must invalidate the authorization`);
    } finally {
      cleanup(root);
    }
  });
}

test('(d) a suite that modifies the repository mid-run fails and writes no authorization', { skip }, () => {
  const root = makeRepo();
  try {
    const result = verify(root, {
      during: (dir) => appendFileSync(join(dir, 'vault', 'state', 'log.md'), '\n## mid-run\n', 'utf8'),
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /changed during verification/);
    assert.deepEqual(result.diff.changed, ['vault/state/log.md']);
    assert.equal(authorized(root).ok, false);
    const written = records(root);
    assert.equal(written.length, 1, 'the failure is still recorded');
    assert.equal(written[0]?.ok, false, 'but never as an authorization');
  } finally {
    cleanup(root);
  }
});

test('(e) a failing check writes no authorization for the state it failed on', { skip }, () => {
  const root = makeRepo();
  try {
    const result = verify(root, { exits: [0, 2] });
    assert.equal(result.ok, false);
    const state = repoState(root);
    assert.equal(findAuthorization(records(root), state.fingerprint), null,
      'no ok record may exist for a state whose suite went red');
    assert.equal(authorized(root).ok, false);
    assert.equal(records(root).length, 1);
    assert.equal(records(root)[0]?.ok, false);
  } finally {
    cleanup(root);
  }
});

test('(f) the evidence file is outside the state it certifies', { skip }, () => {
  const root = makeRepo();
  try {
    const before = fingerprintRepo(root);
    assert.ok(!before.entries.some((e) => e.path.startsWith('.cellular/')),
      'ignored evidence must never be part of the controlled set');
    assert.equal(verify(root).ok, true);
    const after = fingerprintRepo(root);
    assert.equal(after.fingerprint, before.fingerprint,
      'writing the record must not change the fingerprint it records');
    assert.ok(existsSync(join(root, FINAL_EVIDENCE_PATH)), 'the record is written all the same');
  } finally {
    cleanup(root);
  }
});

test('(k) ignored directories do not affect the fingerprint', { skip }, () => {
  const root = makeRepo();
  try {
    const before = fingerprintRepo(root).fingerprint;
    write(root, 'node_modules/left-pad/index.js', 'module.exports = 1;\n');
    write(root, '.cellular/evidence/other.json', '{}\n');
    assert.equal(fingerprintRepo(root).fingerprint, before);
    write(root, 'kept.md', '# counted\n');
    assert.notEqual(fingerprintRepo(root).fingerprint, before);
  } finally {
    cleanup(root);
  }
});
