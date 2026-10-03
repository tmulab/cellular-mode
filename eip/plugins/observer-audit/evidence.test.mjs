// A11, A12, A13 — the three legs the auditor cannot run, and the freshness of the record.
//
// This is the suite that guards against the project's own worst failure mode. Each assertion
// is written so that it would FAIL if the status were PASS — not merely "a finding exists" —
// because the whole value of these rules is the difference between "green" and "nobody
// looked". The summary is asserted too: a reader counts statuses, so the counter is part of
// the claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVIDENCE_PATH, evidenceRecord } from '../../../tools/gates/evidence.mjs';
import { EVIDENCE_COMMAND, freshnessChecks, legChecks } from './checks-evidence.mjs';
import { CODE_EXTENSIONS, isSource, newestSource } from './sources.mjs';
import { assignIds, summarise } from './statuses.mjs';

/** @type {(over?: { typecheck?: 'pass'|'fail'|'warn', build?: 'pass'|'fail'|'warn',
 *   tests?: 'pass'|'fail'|'warn', at?: string, head?: string | null }) => import('../../../tools/gates/evidence.mjs').Evidence} */
const record = ({ typecheck = 'pass', build = 'pass', tests = 'pass', at = '2026-10-02T10:00:00.000Z', head = 'a'.repeat(40) } = {}) => evidenceRecord({
  at,
  head,
  legs: {
    typecheck: { status: typecheck, text: 'typecheck: tsc — 0 error(s)', errors: 0 },
    build: { status: build, text: 'build: 120 modules imported', modules: 120 },
    tests: { status: tests, text: 'tests: 405 passed, 0 failed, 405 total', counts: { passed: 405, failed: 0, total: 405 } },
  },
});

/** @type {(drafts: ReadonlyArray<import('./types.mjs').Draft>) => string[]} */
const statuses = (drafts) => drafts.map((d) => d.status);

test('A11 with NO evidence the three legs are UNAVAILABLE — not PASS, and not counted as one', () => {
  const legs = legChecks(null);
  assert.deepEqual(legs.map((d) => d.rule), ['typecheck', 'build', 'tests']);
  assert.deepEqual(statuses(legs), ['UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE']);
  const summary = summarise(assignIds(legs));
  assert.equal(summary.UNAVAILABLE, 3);
  assert.equal(summary.PASS, 0, 'a leg nobody ran must never reach the green counter');
  assert.equal(summary.FAIL, 0, 'nor the red one: UNKNOWN is its own answer');
  for (const leg of legs) {
    assert.equal(leg.action, `run ${EVIDENCE_COMMAND}, then run the audit again.`);
    assert.ok(leg.evidence[0]?.startsWith(EVIDENCE_PATH), 'the evidence names the file it looked for');
  }
});

test('A12 pass is PASS, fail is FAIL, and the gate\'s own warn is UNAVAILABLE', () => {
  assert.deepEqual(statuses(legChecks(record())), ['PASS', 'PASS', 'PASS']);
  assert.deepEqual(statuses(legChecks(record({ tests: 'fail' }))), ['PASS', 'PASS', 'FAIL']);
  // The case this mapping exists for: `warn` is the GATE saying it could not verify. Reading
  // it as PASS would turn "no type checker resolved" into "the types are fine".
  const unknown = legChecks(record({ typecheck: 'warn' }));
  assert.deepEqual(statuses(unknown), ['UNAVAILABLE', 'PASS', 'PASS']);
  assert.notEqual(unknown[0]?.status, 'PASS');
  assert.match(String(unknown[0]?.explanation), /never green/);
  assert.equal(summarise(assignIds(unknown)).PASS, 2, 'exactly the two legs that really passed');
});

test('A12 the measured numbers travel with the leg, from the record and not from a sentence', () => {
  const [typecheck, build, tests] = legChecks(record());
  assert.ok(typecheck?.evidence.includes('0 error(s)'));
  assert.ok(build?.evidence.includes('120 module(s) imported'));
  assert.deepEqual(tests?.evidence.slice(2), ['405 passed', '0 failed', '405 total']);
  assert.equal(typecheck?.action, undefined, 'a PASS has nothing to suggest');
  assert.equal(legChecks(record({ build: 'fail' }))[1]?.action, 'fix the red leg, then re-run the gate so the record says so.');
});

test('A13 freshness: a different commit, a newer source file, or no record at all', () => {
  const head = 'a'.repeat(40);
  const fresh = freshnessChecks(record(), { head, newestSourceMs: Date.parse('2026-10-02T09:00:00.000Z') });
  assert.deepEqual(statuses(fresh), ['PASS']);

  const moved = freshnessChecks(record(), { head: 'b'.repeat(40), newestSourceMs: null });
  assert.deepEqual(statuses(moved), ['WARNING']);
  assert.match(String(moved[0]?.explanation), /STALE/);
  assert.ok(moved[0]?.evidence.some((line) => line.includes('!=')), 'the two commits are the evidence');

  const touched = freshnessChecks(record(), {
    head,
    newestSourceMs: Date.parse('2026-10-02T11:00:00.000Z'),
    newestSourcePath: 'eip/host/index.mjs',
  });
  assert.deepEqual(statuses(touched), ['WARNING']);
  assert.ok(touched[0]?.evidence.includes('newer: eip/host/index.mjs'));
  assert.equal(touched[0]?.action, `run ${EVIDENCE_COMMAND} to measure the tree as it is now.`);

  // Unknowable is also not PASS: fail closed, as the constitution requires.
  assert.deepEqual(statuses(freshnessChecks(record({ head: null }), { head, newestSourceMs: null })), ['WARNING']);
  assert.deepEqual(statuses(freshnessChecks(record(), { head: null, newestSourceMs: null })), ['WARNING']);
  assert.deepEqual(statuses(freshnessChecks(null, { head, newestSourceMs: null })), ['UNAVAILABLE']);
});

test('A13 source means CODE: a newer document does not make a test run stale', () => {
  assert.deepEqual([...CODE_EXTENSIONS], ['.mjs', '.js', '.cjs', '.ts']);
  assert.equal(isSource('eip/host/index.mjs'), true);
  assert.equal(isSource('docs/00-constitution.md'), false);
  assert.equal(isSource('api/openapi.json'), false);
  const listed = [
    { path: 'docs/late.md', size: 1, modifiedMs: 9000 },
    { path: 'a/x.mjs', size: 1, modifiedMs: 5000 },
    { path: 'a/y.mjs', size: 1, modifiedMs: 7000 },
  ];
  assert.equal(newestSource(listed)?.path, 'a/y.mjs');
  assert.equal(newestSource([{ path: 'README.md', size: 1, modifiedMs: 1 }]), null);
  // Ties break by path, so two files written in the same millisecond cannot reorder a report.
  assert.equal(newestSource([
    { path: 'b.mjs', size: 1, modifiedMs: 5 }, { path: 'a.mjs', size: 1, modifiedMs: 5 },
  ])?.path, 'a.mjs');
});
