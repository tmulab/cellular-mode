// THE ADOPTION BASELINE — what the project was before the method arrived, and the two locks on the
// only part of adoption that executes anything.
//
// The execution tests are the important half. A failing check is recorded as a PRE-EXISTING failure
// and never as something Bootstrap fixed; a command that cannot be started (an `npm` that is really
// `npm.cmd`, a shell builtin) is `not-runnable` WITH A REASON rather than a failure; and a hang is a
// `timeout`. The Windows and timeout paths are driven by an injected runner, because a test that
// waits five minutes to prove a timeout is a test nobody runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASELINE_APPROVAL, BASELINE_KEYS, BASELINE_REL, BASELINE_SCHEMA, assertBaseline, buildBaseline,
  executionLimitations, runBaselineChecks, validateBaseline,
} from './baseline.mjs';
import { runCheck } from './exec.mjs';
import { discoverCommands } from './commands.mjs';
import { detectTarget } from './detect.mjs';
import { publicationFindings } from './publication.mjs';
import { cleanup } from './fixtures/temp.mjs';
import { initGit, makeFixture } from './fixtures/projects.mjs';

const NOW = '2026-10-06T12:00:00.000Z';
const APPROVED = new Set([BASELINE_APPROVAL]);

/** A baseline built from a real fixture. @param {string} name
 * @param {{ checkResults?: ReadonlyArray<never> }} [extra] @returns {Record<string, unknown>} */
function baselineFor(name, extra = {}) {
  const dir = makeFixture(name);
  try {
    initGit(dir);
    const detection = detectTarget(dir);
    return buildBaseline({ detection, discovery: discoverCommands(detection), now: NOW, ...extra });
  } finally {
    cleanup(dir);
  }
}

test('baseline · the record holds exactly the declared keys, and validates', () => {
  const baseline = baselineFor('node');
  assert.deepEqual(Object.keys(baseline).sort(), [...BASELINE_KEYS].sort());
  assert.equal(baseline.schema, BASELINE_SCHEMA);
  assert.equal(BASELINE_REL, 'vault/adoption-baseline.json');
  assert.deepEqual(validateBaseline(baseline).errors.map((error) => error.path), []);
  assert.equal(validateBaseline(baseline).ok, true);
  assert.deepEqual(baseline.invariants, [], 'invariants are a human statement, never a guess');
  assert.deepEqual(baseline.knownFailing, []);
  assert.deepEqual(baseline.checkResults, []);
  assert.deepEqual(baseline.buildSystems, ['npm']);
  assert.equal(Array.isArray(baseline.commands), true);
});

test('baseline · it records commit, tree, cleanliness and a COUNT — never a changed path', () => {
  const baseline = baselineFor('node');
  if (baseline.commit !== null) {
    assert.match(String(baseline.commit), /^[0-9a-f]{40}$/);
    assert.match(String(baseline.tree), /^[0-9a-f]{40}$/);
    assert.equal(baseline.clean, true);
    assert.equal(baseline.changedCount, 0);
  }
  const text = JSON.stringify(baseline);
  assert.ok(!text.includes('src/index.mjs') || !text.includes('"changed"'));
});

test('baseline · it is publishable: no absolute path, no secret, no contact address', () => {
  const baseline = baselineFor('node');
  assert.deepEqual(publicationFindings(baseline).map((finding) => finding.path), []);
  assert.doesNotThrow(() => assertBaseline(baseline));
});

test('baseline · the validator is closed and fails closed', () => {
  assert.equal(validateBaseline(null).ok, false);
  assert.equal(validateBaseline([]).ok, false);
  const base = baselineFor('node');
  /** @param {Record<string, unknown>} patch @returns {string[]} */
  const errors = (patch) => validateBaseline({ ...base, ...patch }).errors.map((error) => error.path);
  assert.deepEqual(errors({ surprise: 1 }), ['surprise']);
  assert.deepEqual(errors({ schema: 'other' }), ['schema']);
  assert.deepEqual(errors({ version: 2 }), ['version']);
  assert.deepEqual(errors({ recordedAt: 'yesterday' }), ['recordedAt']);
  assert.deepEqual(errors({ commit: 'nope' }), ['commit']);
  assert.deepEqual(errors({ clean: 'yes' }), ['clean']);
  assert.deepEqual(errors({ invariants: ['the API never changes'] }), ['invariants']);
  assert.deepEqual(errors({ docs: ['../outside.md'] }), ['docs[0]']);
  assert.deepEqual(errors({ checkResults: 'none' }), ['checkResults']);
  assert.deepEqual(errors({ checkResults: [{ argv: [], status: 'ok', exitCode: 'x', durationMs: -1 }] }),
    ['checkResults[0].argv', 'checkResults[0].status', 'checkResults[0].exitCode', 'checkResults[0].durationMs']);
  assert.throws(() => assertBaseline({ ...base, surprise: 1 }), (/** @type {{ code?: string }} */ e) => e.code === 'BAD_FACTS');
});

test('baseline · without the approval, and without --confirm, nothing runs at all', () => {
  const commands = [{ id: 'npm-test', argv: ['definitely-not-a-program'] }];
  let called = 0;
  const runOne = /** @type {typeof runCheck} */ (() => {
    called += 1;
    return { argv: [], exitCode: 0, durationMs: 0, status: 'passed', reason: null };
  });
  const noApproval = runBaselineChecks({ commands, targetRoot: '.', approvals: new Set(), confirm: true, runOne });
  assert.equal(noApproval.ran, false);
  assert.match(String(noApproval.reason), new RegExp(`--approve ${BASELINE_APPROVAL}`));
  const noConfirm = runBaselineChecks({ commands, targetRoot: '.', approvals: APPROVED, confirm: false, runOne });
  assert.equal(noConfirm.ran, false);
  assert.match(String(noConfirm.reason), /--confirm/);
  assert.equal(called, 0, 'a command ran without both locks');
  assert.deepEqual([...noApproval.results], []);
});

test('baseline · an approved run of a red project records a PRE-EXISTING failure, never a fix', () => {
  const dir = makeFixture('failing-baseline');
  try {
    // A direct `node` invocation on purpose: `npm` is `npm.cmd` on Windows and no shell is ever
    // used, so the npm form would be `not-runnable` here and would test the wrong thing.
    const commands = [{ id: 'node-fail', argv: [process.execPath, 'fail.js'] }];
    const checks = runBaselineChecks({ commands, targetRoot: dir, approvals: APPROVED, confirm: true, timeoutMs: 30000 });
    assert.equal(checks.ran, true);
    const result = checks.results[0];
    assert.equal(result?.status, 'failed');
    assert.equal(result?.exitCode, 1);
    assert.equal(typeof result?.durationMs, 'number');
    assert.equal(result?.reason, null);
    const detection = detectTarget(dir);
    const baseline = buildBaseline({
      detection, discovery: discoverCommands(detection), checkResults: checks.results,
      limitations: executionLimitations(), now: NOW,
    });
    assert.deepEqual(baseline.knownFailing, ['node-fail'], 'a pre-existing failure is named, not hidden');
    assert.ok(String(JSON.stringify(baseline.limitations)).includes('no shell is ever used'));
  } finally {
    cleanup(dir);
  }
});

test('baseline · an approved run of a green project records passed, and the run is real', () => {
  const dir = makeFixture('node');
  try {
    writeFileSync(join(dir, 'pass.js'), 'process.exit(0);\n');
    const checks = runBaselineChecks({
      commands: [{ id: 'node-pass', argv: [process.execPath, 'pass.js'] }],
      targetRoot: dir, approvals: APPROVED, confirm: true, timeoutMs: 30000,
    });
    assert.equal(checks.results[0]?.status, 'passed');
    assert.equal(checks.results[0]?.exitCode, 0);
  } finally {
    cleanup(dir);
  }
});

test('baseline · a .cmd wrapper, a missing program and a hang are each their own status', () => {
  /** @param {string | null} errorCode @param {number | null} status @returns {typeof runCheck} */
  const injected = (errorCode, status) => /** @type {typeof runCheck} */ (
    (/** @type {ReadonlyArray<string>} */ argv, /** @type {object} */ options = {}) => runCheck(argv, {
      ...options,
      run: () => ({ ok: false, status, stdout: '', stderr: '', truncated: false, errorCode }),
    }));
  // Windows: `spawn` without a shell cannot start `npm.cmd` (EINVAL since Node 20), and a shell is
  // exactly what this tool refuses to use. The honest record is "we could not start it".
  const windows = runBaselineChecks({
    commands: [{ id: 'npm-test', argv: ['npm', 'test'] }],
    targetRoot: '.', approvals: APPROVED, confirm: true, runOne: injected('EINVAL', null),
  });
  assert.equal(windows.results[0]?.status, 'not-runnable');
  assert.equal(windows.results[0]?.exitCode, null);
  assert.match(String(windows.results[0]?.reason), /no shell is ever used/);
  const missing = runBaselineChecks({
    commands: [{ id: 'x', argv: ['nope'] }],
    targetRoot: '.', approvals: APPROVED, confirm: true, runOne: injected('ENOENT', null),
  });
  assert.equal(missing.results[0]?.status, 'not-runnable');
  const hung = runBaselineChecks({
    commands: [{ id: 'slow', argv: ['sleep'] }],
    targetRoot: '.', approvals: APPROVED, confirm: true, runOne: injected('ETIMEDOUT', null),
  });
  assert.equal(hung.results[0]?.status, 'timeout');
  assert.match(String(hung.results[0]?.reason), /inside the timeout/);
  const noCode = runBaselineChecks({
    commands: [{ id: 'odd', argv: ['odd'] }],
    targetRoot: '.', approvals: APPROVED, confirm: true, runOne: injected(null, null),
  });
  assert.equal(noCode.results[0]?.status, 'not-runnable');
  assert.deepEqual(validateBaseline({ ...baselineFor('node'), checkResults: [...windows.results] }).errors.map((e) => e.path), []);
});

test('baseline · the limitations of an approved run are stated, not implied', () => {
  const lines = executionLimitations().join(' ');
  assert.match(lines, /inherits this shell's environment unchanged/);
  assert.match(lines, /run ONCE/);
  assert.equal(executionLimitations().length, 3);
});
