// THE ROUND TRIP, and the reason this file lives in `tests/` rather than beside either module.
//
// There is ONE validator of `cellular-mode/verification`: `tools/gates/verification-contract.mjs`.
// Bootstrap GENERATES contracts and may not import the gates (`bootstrap/CONTRACTS.md`, import
// boundary — it copies them as data), so a validator of its own would be a second opinion about
// what Article 8 accepts, and the two would drift. The repository-level suite is the one place
// allowed to import both, so this is where the loop is closed: everything the generator can
// produce, the gate accepts, and the two modules spell the schema and the path the same way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  VERIFICATION_REL, VERIFICATION_SCHEMA, VERIFICATION_VERSION, mandatorySuite, parseContract,
  validateContract,
} from '../tools/gates/verification-contract.mjs';
import { discoverCommands } from '../tools/bootstrap/commands.mjs';
import { VERIFICATION_FILE } from '../tools/bootstrap/plan-constants.mjs';
import {
  CONTRACT_SCHEMA, CONTRACT_VERSION, buildContract, contractBytes, contractFor, mandatoryChecks,
} from '../tools/bootstrap/verification.mjs';
import {
  addCheck, approveCheck, argvRefusal, markVerified, revokeCheck,
} from '../tools/bootstrap/verification-edit.mjs';
import { argvProblem } from '../tools/gates/verification-argv.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NOW = '2026-10-06T12:00:00Z';

/** A detection that triggers EVERY table in `commands.mjs`, plus two CI lines — one parseable,
 * one that needs a shell. The generator must produce a contract the gate accepts from all of it.
 * @type {import('../tools/bootstrap/detect.mjs').Detection} */
const DETECTION = /** @type {never} */ ({
  pkg: { scripts: { test: 'node --test', typecheck: 'tsc', lint: 'eslint .', build: 'rollup' }, dependencies: [] },
  buildSystems: [{ id: 'cargo', evidence: 'Cargo.toml' }, { id: 'go', evidence: 'go.mod' },
    { id: 'maven', evidence: 'pom.xml' }, { id: 'gradle', evidence: 'build.gradle' }],
  testFrameworks: [{ id: 'pytest', evidence: 'pyproject.toml' }],
  makeTargets: ['test', 'build', 'lint', 'typecheck'],
  facts: { existingFiles: ['gradlew'] },
  ci: [{ id: 'github-actions', files: ['.github/workflows/ci.yml'], runLines: [
    { line: 'npm ci', file: '.github/workflows/ci.yml' },
    { line: 'make test && ./deploy.sh', file: '.github/workflows/ci.yml' },
  ] }],
});

test('contract · the two modules spell the schema, the version and the path the same way', () => {
  assert.equal(CONTRACT_SCHEMA, VERIFICATION_SCHEMA);
  assert.equal(CONTRACT_VERSION, VERIFICATION_VERSION);
  assert.equal(VERIFICATION_FILE, VERIFICATION_REL,
    'the path Bootstrap writes to is the path verify-final reads from');
});

test('contract · the template Bootstrap ships for a NEW project is a valid, empty contract', () => {
  const text = readFileSync(new URL('bootstrap/templates/verification-contract.json', `file://${ROOT.replace(/\\/g, '/')}`), 'utf8')
    .replace('{{projectName}}', 'demo');
  const parsed = parseContract(text);
  assert.equal(parsed.ok, true, parsed.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  assert.deepEqual(parsed.contract?.checks, [], 'it ran nothing, so it claims nothing');
  assert.deepEqual(mandatorySuite(parsed.contract), [],
    'and therefore verify-final fails closed until a human approves a check');
});

test('contract · every contract the generator builds is one the gate accepts', () => {
  const discovery = discoverCommands(DETECTION);
  assert.ok(discovery.commands.length >= 10, `only ${discovery.commands.length} commands discovered`);
  const results = discovery.commands.map((command) => ({ id: command.id, status: 'passed' }));
  for (const input of [
    { commands: discovery.commands, results: [] },
    { commands: discovery.commands, results },
    { commands: [], results: [] },
  ]) {
    const built = buildContract({ projectName: 'demo project', now: NOW, ...input });
    const parsed = parseContract(contractBytes(built));
    assert.equal(parsed.ok, true, parsed.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  }
});

test('contract · a passing approved baseline run is what promotes a check to VERIFIED', () => {
  const discovery = discoverCommands(DETECTION);
  const built = buildContract({
    projectName: 'demo', now: NOW, commands: discovery.commands,
    results: [{ id: 'npm-test', status: 'passed' }, { id: 'npm-lint', status: 'failed' }],
  });
  const checks = /** @type {ReadonlyArray<Record<string, string>>} */ (built.checks);
  const byId = new Map(checks.map((entry) => [entry.id, entry]));
  assert.equal(byId.get('npm-test')?.status, 'VERIFIED');
  assert.match(String(byId.get('npm-test')?.basis), /ran and passed in this target/);
  assert.equal(byId.get('npm-lint')?.status, 'INFERRED', 'a FAILING run establishes no VERIFIED check');
  assert.equal(byId.get('npm-build')?.status, 'INFERRED', 'a check nobody ran stays INFERRED');
  // A CI line Bootstrap PARSED rather than authored never becomes a check; it becomes a note.
  assert.equal([...byId.keys()].some((id) => String(id).startsWith('ci-')), false);
  assert.ok(/** @type {ReadonlyArray<string>} */ (built.notes).some((note) => note.includes('./deploy.sh') || note.includes('npm ci')),
    'what was left out is said, not silently dropped');
});

test('contract · mandatory needs a human, and an unknown id is a refusal', () => {
  const discovery = discoverCommands(DETECTION);
  const common = { projectName: 'demo', now: NOW, commands: discovery.commands };
  const { contract, mandatory } = contractFor({ ...common, mandatory: ['npm-test', 'npm-test'] });
  assert.deepEqual([...mandatory], ['npm-test']);
  assert.equal(validateContract(contract).ok, true);
  const promoted = mandatorySuite(contract);
  assert.deepEqual(promoted.map((entry) => entry.id), ['npm-test']);
  assert.deepEqual([...promoted[0]?.argv ?? []], ['npm', 'test']);
  assert.deepEqual(mandatoryChecks(contract).map((entry) => entry.id), ['npm-test'],
    'the generator and the gate agree on which checks are mandatory');
  const check = /** @type {ReadonlyArray<Record<string, unknown>>} */ (contract.checks)
    .find((entry) => entry.id === 'npm-test');
  assert.deepEqual(check?.approval, { by: 'human', at: NOW });
  assert.throws(() => contractFor({ ...common, mandatory: ['npm-deploy'] }), /npm-deploy/);
  assert.throws(() => contractFor({ ...common, mandatory: ['ci-1'] }), /ci-1/,
    'a CI-parsed command is not an id a human can approve: it never became a check');
  assert.deepEqual(mandatorySuite(buildContract({ ...common })), [], 'nothing is mandatory by default');
});

// THE SAME LOOP, CLOSED AROUND THE CLI (H6). `bootstrap verification add/run/approve/mandatory/
// revoke` is now the documented route to a green Article 8, so every document those edits can
// produce has to be one the GATE accepts — otherwise the command that was supposed to replace a
// hand-edited file would write a contract that fails closed for reasons nobody asked for.
test('contract · every document the verification CLI writes is one the gate accepts', () => {
  const discovery = discoverCommands(DETECTION);
  const base = buildContract({ projectName: 'demo', now: NOW, commands: discovery.commands });
  const ok = (/** @type {Record<string, unknown>} */ c, /** @type {string} */ what) => {
    const parsed = parseContract(contractBytes(c));
    assert.equal(parsed.ok, true, `${what}: ${parsed.errors.map((e) => `${e.path}: ${e.message}`).join('\n')}`);
    return c;
  };
  const added = ok(addCheck(base, { id: 'node-tests', argv: ['node', '--test'], now: NOW }), 'add');
  const ran = ok(markVerified(added, 'node-tests', NOW), 'run (passed)');
  ok(approveCheck(ran, 'node-tests', { now: NOW, mandatory: true }), 'mandatory on VERIFIED');
  ok(approveCheck(added, 'node-tests', { now: NOW, mandatory: false }), 'approve only');
  // The hard one: mandatory on a check that is NOT verified. It is valid ONLY because the edit
  // records an explicit human approval and leaves the label alone.
  const approved = ok(approveCheck(added, 'node-tests', { now: NOW, mandatory: true }), 'mandatory on PROPOSED');
  const check = /** @type {ReadonlyArray<Record<string, unknown>>} */ (approved.checks)
    .find((entry) => entry.id === 'node-tests');
  assert.equal(check?.status, 'PROPOSED', 'an approval is NEVER evidence: the label does not move');
  assert.deepEqual(check?.approval, { by: 'human', at: NOW });
  assert.deepEqual(mandatorySuite(approved).map((entry) => entry.id), ['node-tests'],
    'and the gate agrees it may run, because a human said so');
  // Revoke takes the contract back to failing closed, and is still a valid document.
  const revoked = ok(revokeCheck(approved, 'node-tests'), 'revoke');
  assert.deepEqual(mandatorySuite(revoked), [], 'revoke returns verify-final to fail-closed');
  // An id the contract does not hold is a refusal from the edit layer, never a silent no-op.
  for (const edit of [markVerified, revokeCheck]) {
    assert.throws(() => edit(base, 'nope', NOW), /nope/);
  }
  assert.throws(() => addCheck(added, { id: 'node-tests', argv: ['node'], now: NOW }), /already holds/);
  assert.throws(() => addCheck(base, { id: 'Node_Tests', argv: ['node'], now: NOW }), /kebab-case/);
});

test('contract · the argv refusal Bootstrap mirrors is the gate argv rule, answer for answer', () => {
  /** @type {ReadonlyArray<unknown>} */
  const inputs = [
    ['node', '--test'], ['npm', 'test'], ['cargo', 'build'], ['bash', 'deploy.sh'],
    ['sh', '-c', 'ls'], ['bash', '-lc', 'ls'], ['cmd', '/c', 'dir'], ['powershell', '-Command', 'ls'],
    ['pwsh', '-c', 'ls'], ['CMD.EXE', '/C', 'dir'], ['/bin/sh', '-c', 'ls'],
    ['npm run test'], ['/usr/local/my tools/node', '--test'], [], [''], ['node', ''],
    ['node', 'a\nb'], ['node', 'x'.repeat(301)], Array(33).fill('node'), 'not an array', null,
  ];
  for (const input of inputs) {
    const gate = argvProblem(input);
    const boot = argvRefusal(input);
    assert.equal(boot === null, gate === null,
      `the two argv rules disagree on ${JSON.stringify(input)}: gate ${gate}, bootstrap ${boot}`);
    assert.equal(boot, gate, 'and they say it the same way');
  }
});
