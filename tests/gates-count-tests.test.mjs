// The weakness this file exists for: `verify-final` recorded the tests check as its FIRST
// output line, which for `node --test` is a file name — so the record said "tests passed"
// without ever saying HOW MANY. A count-free pass is unfalsifiable: a suite that silently
// ran zero tests, or skipped the whole polyglot conformance row, produced the same record
// as a full green run. These tests pin the parser that fixes it, and the rule that a
// SKIPPED test is VISIBLE (listed, counted, reported) and never a failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countsProblem, countsSummary, parseCountsValue, parseTestCounts, skipLines,
} from '../tools/gates/count-tests.mjs';
import { finalRecord, parseFinalRecord } from '../tools/gates/final-evidence.mjs';
import { runFinalVerification } from '../tools/gates/verify-final.mjs';
import { cleanup, hasGit, makeRepo } from './git-fixture.mjs';

/** Real `node --test` output, copied from a run with one pass, one skip and one todo. */
const SAMPLE = [
  '✔ alpha (0.5381ms)',
  '﹣ beta skipped (0.0841ms) # no toolchain here',
  '✔ gamma (0.0813ms) # TODO',
  'ℹ tests 3',
  'ℹ suites 0',
  'ℹ pass 1',
  'ℹ fail 0',
  'ℹ cancelled 0',
  'ℹ skipped 1',
  'ℹ todo 1',
  'ℹ duration_ms 95.9151',
].join('\n');

/** The counts SAMPLE reports. Every outcome node can report is here, so the six add up. */
const SAMPLE_COUNTS = Object.freeze({ tests: 3, pass: 1, fail: 0, skipped: 1, cancelled: 0, todo: 1 });

test('counts · the six numbers are read from the summary lines', () => {
  assert.deepEqual(parseTestCounts(SAMPLE), SAMPLE_COUNTS);
});

test('counts · carriage returns and surrounding noise do not hide the numbers', () => {
  const windows = `tests\\x.test.mjs\r\n${SAMPLE.split('\n').join('\r\n')}\r\n`;
  assert.deepEqual(parseTestCounts(windows), SAMPLE_COUNTS);
});

test('counts · an incomplete or unparsable summary is null, never a zero', () => {
  assert.equal(parseTestCounts('ℹ tests 3\nℹ pass 3\nℹ fail 0'), null, 'skipped is missing');
  assert.equal(parseTestCounts('ℹ tests many\nℹ pass 1\nℹ fail 0\nℹ skipped 0'), null);
  assert.equal(parseTestCounts('ℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0\nℹ todo 0'), null,
    'cancelled is missing: the field that hid the CI failure is not optional');
  assert.equal(parseTestCounts(''), null);
  assert.equal(parseTestCounts(undefined), null);
});

// WHY THIS RULE EXISTS: the first remote CI run reported "989 passed, 2 failed, 993 total".
// 989 + 2 is 991, not 993 — two results were neither passed nor failed, and nothing in the
// report said so. They were CANCELLED tests (the advisor deadline defect). A total that does
// not equal the sum of its parts is a report with a hole in it, and a hole is where a defect
// hides, so from here on it is a FAILURE.
test('counts · a total that does not equal the sum of its parts is a failure', () => {
  assert.equal(countsProblem(SAMPLE_COUNTS), null, 'these add up');
  assert.match(
    String(countsProblem({ tests: 993, pass: 989, fail: 2, skipped: 0, cancelled: 0, todo: 0 })),
    /counts do not add up/,
  );
  assert.match(String(countsProblem(null)), /counts do not add up/,
    'counts that could not be read are UNKNOWN, and UNKNOWN is never green');
});

test('counts · a CANCELLED test is a failure: it did not run, so it proved nothing', () => {
  const cancelled = { tests: 993, pass: 991, fail: 0, skipped: 0, cancelled: 2, todo: 0 };
  assert.match(String(countsProblem(cancelled)), /2 test\(s\) CANCELLED/);
  // Skipped and todo are visible and legitimate; they are not failures.
  assert.equal(countsProblem({ tests: 3, pass: 1, fail: 0, skipped: 1, cancelled: 0, todo: 1 }), null);
});

test('counts · a count-free record is still legal, so old records stay readable', () => {
  const record = finalRecord({
    at: '2026-10-03T00:00:00.000Z',
    fingerprint: 'a'.repeat(64),
    tree: 'b'.repeat(40),
    head: null,
    checks: [{ name: 'tests', exit: 0, summary: 'ok' }],
    ok: true,
    reason: 'fine',
  });
  const parsed = parseFinalRecord(JSON.parse(JSON.stringify(record)));
  assert.notEqual(parsed, null);
  assert.equal(parsed?.checks[0]?.counts, undefined);
});

test('counts · a record carries the counts and the skip lines through a round trip', () => {
  const record = finalRecord({
    at: '2026-10-03T00:00:00.000Z',
    fingerprint: 'a'.repeat(64),
    tree: 'b'.repeat(40),
    head: null,
    checks: [{
      name: 'tests',
      exit: 0,
      summary: 'ok',
      counts: { tests: 3, pass: 1, fail: 0, skipped: 1, cancelled: 0, todo: 1 },
      skips: ['beta skipped # no toolchain here'],
    }],
    ok: true,
    reason: 'fine',
  });
  const parsed = parseFinalRecord(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(parsed?.checks[0]?.counts, SAMPLE_COUNTS);
  assert.deepEqual(parsed?.checks[0]?.skips, ['beta skipped # no toolchain here']);
});

test('counts · a malformed counts field is dropped, not trusted', () => {
  assert.equal(parseCountsValue({ tests: 3, pass: 1, fail: 0 }), null, 'incomplete');
  assert.equal(parseCountsValue({ ...SAMPLE_COUNTS, skipped: -1 }), null, 'negative');
  assert.equal(parseCountsValue({ ...SAMPLE_COUNTS, tests: 1.5 }), null, 'fractional');
  assert.equal(parseCountsValue({ tests: 3, pass: 1, fail: 0, skipped: 1 }), null,
    'a record from before cancelled was counted is not trusted: it cannot be audited');
  assert.equal(parseCountsValue('3 tests'), null);
  assert.deepEqual(parseCountsValue({ ...SAMPLE_COUNTS, extra: 9 }), SAMPLE_COUNTS,
    'unknown fields are ignored, the six are kept');
});

test('counts · skipped tests are LISTED, with their reason, and capped', () => {
  assert.deepEqual(skipLines(SAMPLE), ['beta skipped (0.0841ms) # no toolchain here']);
  const many = Array.from({ length: 40 }, (_, i) => `﹣ case ${i}`).join('\n');
  const listed = skipLines(many, 12);
  assert.equal(listed.length, 12, 'the list is capped so a record cannot grow without bound');
  assert.equal(listed[0], 'case 0');
  assert.deepEqual(skipLines('✔ nothing skipped here'), []);
});

test('counts · the printed summary states every number, including skipped', () => {
  const line = countsSummary({ tests: 719, pass: 715, fail: 0, skipped: 2, cancelled: 0, todo: 2 });
  assert.equal(line, '719 tests · 715 pass · 0 fail · 2 skipped · 0 cancelled · 2 todo');
  assert.equal(countsSummary(null), 'counts UNKNOWN (the output did not report them)');
});

test('counts · skipped is visible, never a failure: the verdict reads exit codes only', () => {
  // The guarantee in one assertion: a run with skips and exit 0 is a pass whose record
  // SAYS there were skips. Nothing in the counts can flip the verdict — that is the exit
  // code's job — and nothing in the verdict can hide the skips.
  const counts = parseTestCounts(SAMPLE);
  assert.ok(counts !== null && counts.skipped > 0);
  assert.equal(counts.fail, 0);
  assert.match(countsSummary(counts), /1 skipped · 0 cancelled · 1 todo$/);
});

test('counts · verify-final records and PRINTS the counts it observed', { skip: hasGit() ? false : 'git is absent' }, () => {
  const root = makeRepo();
  try {
    /** @type {string[]} */
    const printed = [];
    const suite = [{
      name: 'tests',
      run: () => ({
        exit: 0,
        output: ['✔ alpha (1ms)', '﹣ java · no JDK on this machine (0ms) # skipped',
          'ℹ tests 2', 'ℹ pass 1', 'ℹ fail 0', 'ℹ skipped 1',
          'ℹ cancelled 0', 'ℹ todo 0'].join('\n'),
      }),
    }];
    const result = runFinalVerification({ root, suite, onProgress: (line) => printed.push(line) });
    assert.equal(result.ok, true);
    const check = result.record.checks[0];
    assert.deepEqual(check?.counts,
      { tests: 2, pass: 1, fail: 0, skipped: 1, cancelled: 0, todo: 0 });
    assert.equal(check?.summary,
      '2 tests · 1 pass · 0 fail · 1 skipped · 0 cancelled · 0 todo');
    // The byte-equivalence check reports FIRST, because it decides whether the suite runs at
    // all (tools/gates/byte-equivalence.mjs); the counts of the suite itself come next.
    assert.match(String(printed[0]), /^✅ byte equivalence — \d+ file\(s\) compared, 0 differing$/);
    assert.ok(printed[1]?.includes('1 skipped'), `counts must be printed: ${printed.join(' | ')}`);
    assert.ok(printed.some((line) => line.includes('no JDK on this machine')),
      'a skipped test must be listed, not merely counted');
  } finally {
    cleanup(root);
  }
});
