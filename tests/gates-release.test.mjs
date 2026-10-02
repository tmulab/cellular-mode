// Tests for the RELEASE-READINESS gate (tools/gates/release.mjs).
//
// The question this gate answers is narrower than "are the gates green?": it is
// "is every documented relaxation and every pending exception resolved?". A
// relaxation that is honoured for development must still block a release, and the
// only way that claim is worth anything is if it is mechanically checkable.
//
// Every case is an in-memory fixture, like the other gate tests: a gate asserted
// against the shipped policy files can only prove "it is green today".
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { isPending, parseRelaxations, pendingApprovals, releaseBlockers, unresolved } from '../tools/gates/release.mjs';
import { ROOT, readPolicy } from '../tools/gates/scan.mjs';

/** @type {(blockers: ReadonlyArray<{ id: string }>) => string[]} */
const ids = (blockers) => blockers.map((b) => b.id);
const complete = (over = {}) => ({ path: 'a.mjs', rule: '*', rationale: 'why', approvedBy: 'A Human 2026-01-01', ...over });

// ------------------------------------------------------- pending approvals ------
test('release · an approvedBy of PENDING is pending, a named approver is not', () => {
  assert.equal(isPending('PENDING HUMAN APPROVAL'), true);
  assert.equal(isPending('pending human approval'), true, 'case must not be a loophole');
  assert.equal(isPending('  PENDING '), true, 'whitespace must not be a loophole');
  assert.equal(isPending('A Human 2026-01-01'), false);
  assert.equal(isPending(''), true, 'an empty approver is not an approval');
  assert.equal(isPending(undefined), true, 'a missing approver is not an approval');
});

test('release · pendingApprovals reports only the pending entries, with their source', () => {
  const entries = [complete(), complete({ path: 'b.mjs', approvedBy: 'PENDING HUMAN APPROVAL' })];
  const found = pendingApprovals(entries, 'policy/secrets-allowlist.json');
  assert.equal(found.length, 1);
  assert.equal(found[0]?.path, 'b.mjs');
  assert.equal(found[0]?.source, 'policy/secrets-allowlist.json');
  assert.deepEqual(pendingApprovals([], 'x'), [], 'an empty policy is the healthy state');
  assert.deepEqual(pendingApprovals('not an array', 'x'), []);
});

// ---------------------------------------------------- relaxation statuses -------
const RELAXATIONS = [
  '# Relaxations',
  '',
  '## R-1 — typecheck reported as UNAVAILABLE',
  '',
  '- **Status:** ACCEPTED (development only) A Human 2026-10-02 — release-blocking',
  '',
  '## R-2 — allowlist entries without an approver',
  '',
  '- **Status:** PENDING HUMAN APPROVAL',
  '',
  '## R-3 — something settled',
  '',
  '- **Status:** APPROVED A Human 2026-10-02',
  '',
  '## R-4 — something dropped',
  '',
  '- **Status:** WITHDRAWN',
].join('\n');

test('release · every relaxation and its status is parsed out of the document', () => {
  const parsed = parseRelaxations(RELAXATIONS);
  assert.deepEqual(parsed.map((r) => r.id), ['R-1', 'R-2', 'R-3', 'R-4']);
  assert.match(String(parsed[0]?.status), /^ACCEPTED \(development only\)/);
  assert.equal(parsed[1]?.status, 'PENDING HUMAN APPROVAL');
  assert.deepEqual(parseRelaxations(''), [], 'no relaxations is the healthy state');
});

test('release · only APPROVED and WITHDRAWN are resolved - ACCEPTED-for-dev is not', () => {
  assert.deepEqual(unresolved(parseRelaxations(RELAXATIONS)).map((r) => r.id), ['R-1', 'R-2']);
  assert.deepEqual(unresolved(parseRelaxations('## R-9 — x\n- **Status:** APPROVED A Human 2026-01-01')), []);
  const silent = parseRelaxations('## R-9 — a relaxation with no status line at all\n\nprose only');
  assert.deepEqual(unresolved(silent).map((r) => r.status), ['UNKNOWN'], 'a missing status fails closed');
});

// ------------------------------------------------------------- blockers ---------
const CLEAN = {
  secretsAllowlist: [],
  sizeExceptions: [],
  allowedDependencies: { allowed: [] },
  relaxationsText: '## R-3 — settled\n- **Status:** APPROVED A Human 2026-10-02',
  typecheckAvailable: true,
};

test('release · GREEN only when nothing is pending and typecheck really runs', () => {
  assert.deepEqual(releaseBlockers(CLEAN), []);
});

test('release · RED when the typecheck leg is not actually available (R-1)', () => {
  const blockers = releaseBlockers({ ...CLEAN, typecheckAvailable: false });
  assert.deepEqual(ids(blockers), ['release:typecheck-unavailable']);
  assert.match(String(blockers[0]?.detail), /R-1/);
});

test('release · RED on a pending exception in any of the three policy files', () => {
  const pending = complete({ approvedBy: 'PENDING HUMAN APPROVAL' });
  assert.deepEqual(ids(releaseBlockers({ ...CLEAN, secretsAllowlist: [pending] })), ['release:pending-exception']);
  assert.deepEqual(ids(releaseBlockers({ ...CLEAN, sizeExceptions: [pending] })), ['release:pending-exception']);
  assert.deepEqual(
    ids(releaseBlockers({ ...CLEAN, allowedDependencies: { allowed: [{ name: 'x', rationale: 'y', approvedBy: 'PENDING' }] } })),
    ['release:pending-exception'],
  );
  assert.match(String(releaseBlockers({ ...CLEAN, secretsAllowlist: [pending] })[0]?.detail), /secrets-allowlist/);
});

test('release · RED on an unresolved relaxation, one blocker per relaxation', () => {
  const blockers = releaseBlockers({ ...CLEAN, relaxationsText: RELAXATIONS });
  assert.deepEqual(ids(blockers), ['release:relaxation-unresolved', 'release:relaxation-unresolved']);
  assert.match(blockers.map((b) => b.detail).join(' '), /R-1[\s\S]*R-2/);
});

test('release · the shipped policy is measured, not assumed', () => {
  // Statement of fact about the repository as it stands, not a pass/fail claim:
  // these counts are what `--release` reports, and they must be zero before a
  // public release. Written as an assertion so a silent regrowth is visible.
  const pending = [
    ...pendingApprovals(readPolicy('secrets-allowlist.json', []), 'policy/secrets-allowlist.json'),
    ...pendingApprovals(readPolicy('size-exceptions.json', []), 'policy/size-exceptions.json'),
  ];
  assert.deepEqual(pending, [], 'no pending exception may be reintroduced without updating R-2');
});

// ------------------------------------------------------------ the CLI wiring ----
/** @type {(args: string[]) => import('node:child_process').SpawnSyncReturns<string>} */
const cli = (args) => spawnSync(process.execPath, [join(ROOT, 'tools/gates/check-all.mjs'), ...args], {
  cwd: ROOT,
  encoding: 'utf8',
});

test('release · check-all always prints the pending-exception count', () => {
  const out = cli([]);
  assert.match(out.stdout, /pending exception/, 'a pending exception may never be silent');
  assert.doesNotMatch(out.stdout, /release: \d+ blocker/, 'release blockers are opt-in');
});

test('release · check-all --release reports blockers and exits 2 when there are any', () => {
  const out = cli(['--release']);
  const found = /release: (\d+) blocker\(s\)/.exec(out.stdout);
  if (found === null) {
    assert.match(out.stdout, /✅ release: no blockers/, '--release must reach a verdict either way');
    return;
  }
  assert.ok(Number(found[1]) > 0);
  assert.equal(out.status, 2, 'a release blocker must fail the process, not inform it');
});
