// Byte equivalence — "the state that was verified" and "the state git would commit" must be
// the SAME bytes, not two things a filter happens to relate.
//
// The defect this file exists for is real: on 2026-10-04 this repository's working copies of
// sixteen files carried CRLF while their committed blobs carried LF (`.gitattributes` says
// `* text=auto eol=lf`). `fingerprint.mjs` hashes the WORKING bytes, so the final-verification
// suite ran on bytes that would never be committed, while the recorded `tree` was the
// normalised one. A green run therefore certified a state that did not exist anywhere — and CI
// found it, failing two tests that passed locally.
//
// So the check is: for every controlled file, the blob id of the raw working bytes must equal
// the blob id git would store for that path with its attributes applied. Anything else is a
// REFUSAL before the suite runs — a suite over the wrong bytes is worse than no suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CORRECTIVE_ACTION, checkByteEquivalence, compareIds, unsafeForStdin,
} from '../tools/gates/byte-equivalence.mjs';
import { FINAL_EVIDENCE_PATH, findTreeAuthorization, parseRecords } from '../tools/gates/final-evidence.mjs';
import { runFinalVerification } from '../tools/gates/verify-final.mjs';
import { authorized, treeAuthorized } from '../tools/gates/authorization.mjs';
import { stagedTreeId } from '../tools/gates/fingerprint.mjs';
import { cleanup, git, hasGit, makeRepo, write } from './git-fixture.mjs';

const skip = hasGit() ? false : 'git is not available on this machine';

/** The same two rules this repository declares: normalise every text file to LF, and leave the
 * vendored artefact alone — so the fixture exercises both sides on any operating system,
 * whatever `core.autocrlf` says locally. */
const ATTRIBUTES = '* text=auto eol=lf\napps/observer/vendor/** -text\n';
const VENDOR = 'apps/observer/vendor/three/three.core.min.js';

/** @param {string} root @returns {string} */
function evidenceText(root) {
  return readFileSync(join(root, FINAL_EVIDENCE_PATH), 'utf8');
}

/** @returns {string} the repository root */
function repoWithAttributes() {
  const root = makeRepo();
  write(root, '.gitattributes', ATTRIBUTES);
  write(root, VENDOR, 'x=1\r\ny=2\r\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'attributes']);
  return root;
}

/** A suite that records whether it was ever asked to run, so "refused BEFORE the suite" is an
 * assertion rather than a hope.
 * @returns {{ ran: string[], suite: Array<{ name: string, run: () => { exit: number, output: string } }> }} */
function spySuite() {
  /** @type {string[]} */
  const ran = [];
  return {
    ran,
    suite: [{
      name: 'spy',
      run: () => {
        ran.push('spy');
        return { exit: 0, output: '' };
      },
    }],
  };
}

test('compareIds · PURE: equal ids are equivalence, a difference is named', () => {
  const paths = ['a.md', 'b.md', 'c.md'];
  const same = compareIds(paths, ['1', '2', '3'], ['1', '2', '3']);
  assert.deepEqual(same, { equivalent: true, checked: 3, differing: [] });
  const drifted = compareIds(paths, ['1', 'x', 'y'], ['1', '2', '3']);
  assert.equal(drifted.equivalent, false);
  assert.deepEqual(drifted.differing, ['b.md', 'c.md'], 'the paths, never "something changed"');
  assert.equal(compareIds([], [], []).equivalent, true);
});

test('compareIds · FAIL CLOSED: git answering a different number of ids is an error', () => {
  assert.throws(() => compareIds(['a.md', 'b.md'], ['1'], ['1', '2']), /2 path\(s\)/);
  assert.throws(() => compareIds(['a.md'], ['1'], []), /0 filtered/);
});

test('unsafeForStdin · a path git cannot be asked about line by line is refused, not skipped', () => {
  assert.deepEqual(unsafeForStdin(['ok.md', 'two\nlines.md', 'cr\r.md']), ['two\nlines.md', 'cr\r.md']);
  assert.deepEqual(unsafeForStdin(['ok.md', 'dir/also ok.md']), []);
});

test('the corrective action names a command a human can actually run', () => {
  assert.match(CORRECTIVE_ACTION, /git checkout -- /);
  assert.match(CORRECTIVE_ACTION, /verify:final/);
});

test('a clean checkout is equivalent, and the vendored -text file is no false positive', { skip }, () => {
  const root = repoWithAttributes();
  try {
    const result = checkByteEquivalence(root);
    assert.equal(result.equivalent, true, result.differing.join(', '));
    assert.deepEqual(result.differing, []);
    assert.ok(result.checked >= 7, `${result.checked} controlled files were compared`);
    writeFileSync(join(root, VENDOR), 'x=1\r\ny=2\r\nz=3\r\n', 'utf8');
    const stillFine = checkByteEquivalence(root);
    assert.deepEqual(stillFine.differing, [], 'a -text file is equal by construction: no filter runs');
    assert.equal(stillFine.equivalent, true);
  } finally {
    cleanup(root);
  }
});

test('CRLF working bytes under eol=lf are reported, by path', { skip }, () => {
  const root = repoWithAttributes();
  try {
    writeFileSync(join(root, 'docs', 'guide.md'), '# Guide\r\n\r\nOne paragraph.\r\n', 'utf8');
    const result = checkByteEquivalence(root);
    assert.equal(result.equivalent, false);
    assert.deepEqual(result.differing, ['docs/guide.md']);
    assert.equal(result.differing.includes(VENDOR), false, 'the untouched vendor file is not implicated');
  } finally {
    cleanup(root);
  }
});

test('verify:final REFUSES before the suite runs, then authorizes once LF is restored', { skip }, () => {
  const root = repoWithAttributes();
  try {
    const crlf = '# Guide\r\n\r\nOne paragraph.\r\n';
    writeFileSync(join(root, 'docs', 'guide.md'), crlf, 'utf8');
    const refused = spySuite();
    const first = runFinalVerification({ root, suite: refused.suite });
    assert.equal(first.ok, false);
    assert.deepEqual(refused.ran, [], 'the suite must not run on bytes that would never be committed');
    assert.match(first.reason, /docs\/guide\.md/);
    assert.match(first.reason, /git would commit/);
    assert.equal(first.record.equivalent, false);
    assert.deepEqual(first.record.drifted, ['docs/guide.md'], 'the record names what was wrong');
    assert.deepEqual(first.record.checks, [], 'no check may be recorded as having run');
    assert.equal(authorized(root).ok, false);
    assert.ok(evidenceText(root).includes('"equivalent":false'), 'the refusal is recorded');

    writeFileSync(join(root, 'docs', 'guide.md'), crlf.split('\r\n').join('\n'), 'utf8');
    const accepted = spySuite();
    const second = runFinalVerification({ root, suite: accepted.suite });
    assert.equal(second.ok, true, second.reason);
    assert.deepEqual(accepted.ran, ['spy']);
    assert.equal(second.record.equivalent, true);
    assert.equal(authorized(root).ok, true, authorized(root).reason);
  } finally {
    cleanup(root);
  }
});

test('a record with no `equivalent` field stays readable but authorizes nothing', { skip }, () => {
  const root = repoWithAttributes();
  try {
    assert.equal(runFinalVerification({ root, suite: spySuite().suite }).ok, true);
    assert.equal(authorized(root).ok, true);
    const full = join(root, FINAL_EVIDENCE_PATH);
    const older = evidenceText(root).split('\n').filter((l) => l.trim() !== '')
      .map((line) => {
        const record = /** @type {Record<string, unknown>} */ (JSON.parse(line));
        delete record['equivalent'];
        delete record['drifted'];
        return JSON.stringify(record);
      }).join('\n');
    writeFileSync(full, `${older}\n`, 'utf8');
    const records = parseRecords(evidenceText(root));
    assert.equal(records.length, 1, 'an older record is still PARSED — the history stays readable');
    assert.equal(records[0]?.ok, true);
    assert.equal(records[0]?.equivalent, undefined);
    assert.equal(authorized(root).ok, false, 'but it may not authorize a new commit');
    assert.equal(findTreeAuthorization(records, records[0]?.tree ?? ''), null);
    const answer = treeAuthorized(root, records[0]?.tree ?? '');
    assert.equal(answer.ok, false);
    assert.match(answer.reason, /no byte-equivalence result/, 'the refusal says WHY, not just no');
  } finally {
    cleanup(root);
  }
});

test('a change staged AFTER verification is still refused (the staged tree moved)', { skip }, () => {
  const root = repoWithAttributes();
  try {
    const result = runFinalVerification({ root, suite: spySuite().suite });
    assert.equal(result.ok, true, result.reason);
    write(root, 'docs/guide.md', '# Guide\n\nTwo paragraphs.\n');
    git(root, ['add', '-A']);
    const records = parseRecords(evidenceText(root));
    assert.equal(findTreeAuthorization(records, stagedTreeId(root)), null);
    assert.equal(authorized(root).ok, false);
  } finally {
    cleanup(root);
  }
});
