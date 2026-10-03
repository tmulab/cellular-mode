// A14, A20 — the Trilateral EVIDENCE record: built from measured results, parsed fail-closed.
//
// The record exists so a reader that cannot spawn a process can still report the three
// legs honestly. Two failure modes are therefore worth more than the happy path: a record
// that says more than the run measured, and a half-understood record that becomes a green
// leg. Both are asserted on below, with exact values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EVIDENCE_PATH, EVIDENCE_SCHEMA, LEG_NAMES, evidenceRecord, parseEvidence,
} from '../tools/gates/evidence.mjs';
import { readGitHead } from '../tools/gates/git-head.mjs';
import { writeEvidence } from '../tools/gates/trilateral.mjs';
import { EXCLUDED_DIRS, isExcluded, isVendored } from '../tools/gates/exclusions.mjs';
import { VENDORED_PATHS } from '../tools/gates/scan.mjs';

/** @type {() => { root: string, cleanup: () => void }} */
const temp = () => {
  const root = mkdtempSync(join(tmpdir(), 'cellular-evidence-'));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};

/** @type {import('../tools/gates/types.mjs').LegResult} */
const PASSING_TYPECHECK = { status: 'pass', text: 'typecheck: tsc — 0 error(s)', errors: 0 };

test('A14 the record carries the numbers the legs measured, and no number they did not', () => {
  const record = evidenceRecord({
    at: '2026-10-02T10:00:00.000Z',
    head: 'a'.repeat(40),
    legs: {
      typecheck: PASSING_TYPECHECK,
      build: { status: 'pass', text: 'build: 120 modules', modules: 120 },
      tests: { status: 'pass', text: 'tests: 405 passed', counts: { passed: 405, failed: 0, total: 405 } },
    },
  });
  assert.equal(record.schema, EVIDENCE_SCHEMA);
  assert.equal(record.at, '2026-10-02T10:00:00.000Z');
  assert.equal(record.legs.typecheck.errors, 0);
  assert.equal(record.legs.build.modules, 120);
  assert.deepEqual(
    [record.legs.tests.passed, record.legs.tests.failed, record.legs.tests.total],
    [405, 0, 405],
  );
  // A leg that measured nothing says so. `null` is the honest answer; 0 would be a claim.
  const unmeasured = evidenceRecord({
    at: '2026-10-02T10:00:00.000Z',
    legs: {
      typecheck: { status: 'warn', text: 'typecheck: UNAVAILABLE' },
      build: { status: 'fail', text: 'build: broken' },
      tests: { status: 'fail', text: 'tests: could not parse the reporter output' },
    },
  });
  assert.equal('errors' in unmeasured.legs.typecheck, false, 'an unmeasured count is absent, not zero');
  assert.equal('modules' in unmeasured.legs.build, false);
  assert.equal(unmeasured.legs.tests.passed, null);
  assert.equal(unmeasured.head, null, 'an unreadable head is null, never an invented sha');
});

test('A20 parseEvidence fails closed on every shape it cannot fully recognise', () => {
  const good = evidenceRecord({
    at: '2026-10-02T10:00:00.000Z',
    legs: {
      typecheck: PASSING_TYPECHECK,
      build: { status: 'pass', text: 'b', modules: 1 },
      tests: { status: 'pass', text: 't', counts: { passed: 1, failed: 0, total: 1 } },
    },
  });
  assert.notEqual(parseEvidence(JSON.parse(JSON.stringify(good))), null, 'a real record parses');
  for (const [label, value] of /** @type {Array<[string, unknown]>} */ ([
    ['null', null],
    ['a string', 'schema 1'],
    ['a future schema', { ...good, schema: 2 }],
    ['no schema', { ...good, schema: undefined }],
    ['an unparsable timestamp', { ...good, at: 'yesterday' }],
    ['no legs', { ...good, legs: undefined }],
    ['a missing leg', { ...good, legs: { typecheck: good.legs.typecheck, build: good.legs.build } }],
    ['an unknown leg status', { ...good, legs: { ...good.legs, tests: { status: 'green', detail: '' } } }],
  ])) {
    assert.equal(parseEvidence(value), null, `${label} must not parse`);
  }
  const parsed = parseEvidence(JSON.parse(JSON.stringify(good)));
  assert.deepEqual(Object.keys(parsed?.legs ?? {}).sort(), [...LEG_NAMES].sort());
});

test('A14 --evidence writes the record at the one documented path, as JSON', () => {
  const { root, cleanup } = temp();
  try {
    const written = writeEvidence({
      typecheck: PASSING_TYPECHECK,
      build: { status: 'pass', text: 'b', modules: 2 },
      tests: { status: 'fail', text: 't', counts: { passed: 1, failed: 1, total: 2 } },
    }, root);
    assert.equal(written, EVIDENCE_PATH);
    const parsed = parseEvidence(JSON.parse(readFileSync(join(root, EVIDENCE_PATH), 'utf8')));
    assert.equal(parsed?.legs.tests.status, 'fail', 'the file says what the run said');
    assert.equal(parsed?.legs.tests.failed, 1);
    assert.ok(Date.parse(String(parsed?.at)) > 0);
  } finally {
    cleanup();
  }
});

test('A14 the head is read from .git as files — detached, loose ref and packed ref', () => {
  const { root, cleanup } = temp();
  const sha = 'b'.repeat(40);
  try {
    assert.equal(readGitHead(root), null, 'no .git at all is UNKNOWN, not an error');
    mkdirSync(join(root, '.git', 'refs', 'heads'), { recursive: true });
    writeFileSync(join(root, '.git', 'HEAD'), `${sha}\n`);
    assert.equal(readGitHead(root), sha, 'detached HEAD');
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    assert.equal(readGitHead(root), null, 'a ref with no object is UNKNOWN');
    writeFileSync(join(root, '.git', 'refs', 'heads', 'main'), `${sha}\n`);
    assert.equal(readGitHead(root), sha, 'loose ref');
    rmSync(join(root, '.git', 'refs', 'heads', 'main'));
    writeFileSync(join(root, '.git', 'packed-refs'), `# pack-refs with: peeled\n${sha} refs/heads/main\n`);
    assert.equal(readGitHead(root), sha, 'packed ref');
    // A ref name is input: it may not become a path outside .git.
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: ../../../etc/passwd\n');
    assert.equal(readGitHead(root), null, 'traversal in HEAD is refused, not followed');
  } finally {
    cleanup();
  }
});

test('the exclusion list is ONE list: scan.mjs re-exports exactly it', () => {
  assert.deepEqual([...VENDORED_PATHS], VENDORED_PATHS.filter(isVendored),
    'scan.mjs and exclusions.mjs must agree about the vendored artefacts');
  assert.deepEqual([...EXCLUDED_DIRS], ['node_modules', '.git', '.cellular']);
  for (const rel of ['node_modules/x/index.js', '.git/HEAD', 'a/node_modules/b.mjs', VENDORED_PATHS[0] ?? '']) {
    assert.equal(isExcluded(rel), true, `${rel} must be excluded`);
  }
  for (const rel of ['eip/sdk/index.mjs', 'apps/observer/vendor/three@0.180.0/VENDOR.md', 'package.json']) {
    assert.equal(isExcluded(rel), false, `${rel} must stay in scope`);
  }
});
