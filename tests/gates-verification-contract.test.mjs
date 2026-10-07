// The verification contract (BS3) — the validator that decides what a target project may make
// mandatory for Article 8. PURE tests: no repository, no process, no disk.
//
// The three rules worth a test each are the three ways this schema could become a bypass:
// a check that is mandatory on nobody's authority, an argv that is really a shell string, and
// a key nobody declared carrying meaning a future reader would miss.
import test from 'node:test';
import assert from 'node:assert/strict';
import { argvProblem, programName } from '../tools/gates/verification-argv.mjs';
import {
  DEFAULT_TIMEOUT_SECONDS, MAX_CONTRACT_BYTES, NO_MANDATORY_REASON, STATUSES, VERIFICATION_REL,
  VERIFICATION_SCHEMA, mandatorySuite, parseContract, validateContract,
} from '../tools/gates/verification-contract.mjs';

/** @param {object} [over] @returns {Record<string, unknown>} */
const check = (over = {}) => ({
  id: 'tests', argv: ['npm', 'test'], status: 'INFERRED', basis: 'package.json scripts.test',
  mandatory: false, approval: null, ...over,
});

/** @param {ReadonlyArray<unknown>} checks @returns {Record<string, unknown>} */
const contract = (checks) => ({ schema: VERIFICATION_SCHEMA, version: 1, checks: [...checks] });

/** @param {unknown} value @returns {ReadonlyArray<string>} */
const paths = (value) => validateContract(value).errors.map((e) => e.path);

test('contract · the minimum is a schema, a version and a (possibly empty) list', () => {
  assert.equal(validateContract(contract([])).ok, true, 'an empty contract is VALID and mandates nothing');
  assert.equal(validateContract(contract([check()])).ok, true);
  assert.deepEqual(paths({ schema: 'other/thing', version: 1, checks: [] }), ['schema']);
  assert.deepEqual(paths({ schema: VERIFICATION_SCHEMA, version: 2, checks: [] }), ['version']);
  assert.deepEqual(paths({ schema: VERIFICATION_SCHEMA, version: 1 }), ['checks']);
  assert.deepEqual(paths(null), ['contract']);
  assert.deepEqual(paths([]), ['contract']);
  assert.equal(VERIFICATION_REL, 'vault/verification.json');
  assert.deepEqual([...STATUSES], ['VERIFIED', 'INFERRED', 'PROPOSED', 'UNKNOWN']);
});

// THE RULE OF BS3. Nothing a tool merely INFERRED may block a commit.
test('contract · mandatory needs VERIFIED or an explicit human approval', () => {
  assert.deepEqual(paths(contract([check({ mandatory: true })])), ['checks[0].mandatory']);
  assert.equal(validateContract(contract([check({ mandatory: true, status: 'VERIFIED' })])).ok, true);
  const approved = check({ mandatory: true, approval: { by: 'human', at: '2026-10-06T10:00:00Z' } });
  assert.equal(validateContract(contract([approved])).ok, true);
  for (const status of ['PROPOSED', 'UNKNOWN']) {
    assert.equal(validateContract(contract([check({ mandatory: true, status })])).ok, false,
      `${status} may not be mandatory on its own`);
  }
  // Only a human approves, and the instant is part of the approval.
  assert.deepEqual(paths(contract([check({ mandatory: true, approval: { by: 'tool', at: '2026-10-06T10:00:00Z' } })])),
    ['checks[0].approval.by'], 'the whole contract is refused, so the check can never run');
  assert.deepEqual(paths(contract([check({ mandatory: true, approval: { by: 'human', at: 'yesterday' } })])),
    ['checks[0].approval.at']);
  assert.deepEqual(paths(contract([check({ approval: undefined })])), ['checks[0].approval']);
});

test('contract · an argv is an argument array, and a shell wrapper is refused by name', () => {
  assert.equal(argvProblem(['npm', 'test']), null);
  assert.equal(argvProblem(['./gradlew', 'test']), null);
  assert.equal(argvProblem(['bash', 'scripts/check.sh']), null, 'a shell as an INTERPRETER is fine');
  assert.match(String(argvProblem(['sh', '-c', 'make test'])), /shell string/);
  assert.match(String(argvProblem(['/bin/bash', '-lc', 'x'])), /shell string/);
  assert.match(String(argvProblem(['C:\\Windows\\system32\\cmd.exe', '/C', 'x'])), /shell string/);
  assert.match(String(argvProblem(['powershell', '-Command', 'x'])), /shell string/);
  assert.match(String(argvProblem(['pwsh', '-EncodedCommand', 'eA=='])), /shell string/);
  assert.match(String(argvProblem(['npm run test'])), /command line/, 'a command line is not an argv');
  assert.equal(argvProblem(['C:\\Program Files\\nodejs\\node.exe', '--test']), null,
    'a program PATH may hold a space; a command line may not');
  assert.match(String(argvProblem([])), /non-empty/);
  assert.match(String(argvProblem(['npm', ''])), /non-empty string/);
  assert.match(String(argvProblem(['npm', 'test\nrm -rf /'])), /control character/);
  assert.match(String(argvProblem(['npm', 'a\u0000b'])), /control character/);
  assert.match(String(argvProblem('npm test')), /non-empty array/);
  assert.equal(programName('C:\\Program Files\\nodejs\\node.exe'), 'node');
  assert.equal(programName('/usr/bin/sh'), 'sh');
  assert.deepEqual(paths(contract([check({ argv: ['sh', '-c', 'x'] })])), ['checks[0].argv']);
});

test('contract · keys are closed and ids are unique', () => {
  assert.deepEqual(paths({ ...contract([]), surprise: 1 }), ['contract.surprise']);
  assert.deepEqual(paths(contract([check({ notes: 'extra' })])), ['checks[0].notes']);
  assert.deepEqual(paths(contract([check({ approval: { by: 'human', at: '2026-10-06T10:00:00Z', why: 'x' } })])),
    ['checks[0].approval.why']);
  assert.deepEqual(paths(contract([check(), check()])), ['checks[1].id']);
  assert.deepEqual(paths(contract([check({ id: 'Tests' })])), ['checks[0].id']);
  assert.deepEqual(paths(contract([check({ id: 'a--b' })])), ['checks[0].id']);
  assert.deepEqual(paths(contract([check({ basis: '  ' })])), ['checks[0].basis']);
  assert.deepEqual(paths(contract([check({ status: 'PROBABLY' })])), ['checks[0].status']);
  assert.deepEqual(paths(contract([check({ timeoutSeconds: 0 })])), ['checks[0].timeoutSeconds']);
  assert.deepEqual(paths(contract([check({ timeoutSeconds: 3601 })])), ['checks[0].timeoutSeconds']);
  assert.deepEqual(paths(contract([check({ timeoutSeconds: 1.5 })])), ['checks[0].timeoutSeconds']);
  assert.equal(validateContract(contract([check({ timeoutSeconds: 30 })])).ok, true);
  // The two optional documentation keys the generated file uses.
  assert.equal(validateContract({ ...contract([]), project: 'demo', notes: ['a'] }).ok, true);
  assert.deepEqual(paths({ ...contract([]), project: '' }), ['project']);
  assert.deepEqual(paths({ ...contract([]), notes: [3] }), ['notes']);
});

test('contract · parseContract is total, bounded and never repairs', () => {
  assert.equal(parseContract('{').ok, false);
  assert.match(String(parseContract('{').errors[0]?.message), /not JSON/);
  assert.equal(parseContract(42).ok, false);
  assert.equal(parseContract('x'.repeat(MAX_CONTRACT_BYTES + 1)).contract, null);
  assert.match(String(parseContract('x'.repeat(MAX_CONTRACT_BYTES + 1)).errors[0]?.message), /exceed/);
  const good = parseContract(JSON.stringify(contract([check({ status: 'VERIFIED', mandatory: true })])));
  assert.equal(good.ok, true);
  assert.equal(good.contract?.checks.length, 1);
  assert.equal(parseContract(JSON.stringify(contract([check({ mandatory: true })]))).contract, null,
    'an invalid contract yields NO contract, never a filtered one');
});

test('contract · mandatorySuite re-applies the rule it is given, and orders by the file', () => {
  const suite = mandatorySuite(contract([
    check({ id: 'types', status: 'VERIFIED', mandatory: true, timeoutSeconds: 60 }),
    check({ id: 'lint' }),
    check({ id: 'tests', mandatory: true, approval: { by: 'human', at: '2026-10-06T10:00:00Z' } }),
  ]));
  assert.deepEqual(suite.map((entry) => entry.id), ['types', 'tests']);
  assert.deepEqual([...suite[0]?.argv ?? []], ['npm', 'test']);
  assert.equal(suite[0]?.timeoutSeconds, 60);
  assert.equal(suite[1]?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS);
  // The bypass this function refuses even when something upstream let it through.
  assert.deepEqual(mandatorySuite(contract([check({ mandatory: true })])), []);
  assert.deepEqual(mandatorySuite(contract([check({ mandatory: true, status: 'VERIFIED', argv: ['sh', '-c', 'x'] })])), []);
  assert.deepEqual(mandatorySuite(contract([check({ mandatory: true, approval: { by: 'tool', at: 'x' } })])), [],
    'only a HUMAN approval promotes a check that is not VERIFIED');
  assert.deepEqual(mandatorySuite(null), []);
  assert.deepEqual(mandatorySuite({ checks: 'all' }), []);
  assert.match(NO_MANDATORY_REASON, /no mandatory verification check/);
});
