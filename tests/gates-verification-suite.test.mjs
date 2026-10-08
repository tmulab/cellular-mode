// WHICH suite Article 8 runs — the half of BS3 that decides what `npm run verify:final` does.
//
// THE COMPATIBILITY PROMISE IS THE FIRST TEST. With no `vault/verification.json` the selection
// is `MANDATORY_SUITE` itself — the same object, not an equal one — and that constant still
// names the four checks it named before this cell. Every other test here is about the file
// being present, which is a situation this repository is never in.
//
// Each case runs in a THROWAWAY git repository (`tests/git-fixture.mjs`), because the controlled
// set, the fingerprint and the byte-equivalence check are all defined by git.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FINAL_EVIDENCE_PATH, parseRecords } from '../tools/gates/final-evidence.mjs';
import { NO_MANDATORY_REASON, VERIFICATION_REL } from '../tools/gates/verification-contract.mjs';
import {
  BUILT_IN, MANDATORY_SUITE, SHIMS, SHIM_ALTERNATIVE, resolveShimArgv, selectSuite,
} from '../tools/gates/verification-suite.mjs';
import { runFinalVerification } from '../tools/gates/verify-final.mjs';
import { cleanup, git, hasGit, makeRepo, write } from './git-fixture.mjs';

const skip = hasGit() ? false : 'git is not available on this machine';

/** A check that exits with `code` and writes nothing. Its argv holds shell punctuation on
 * purpose: with `shell: false` those elements are ARGUMENTS node ignores. */
const exits = (/** @type {number} */ code) => [process.execPath, '-e', `process.exit(${code})`];

/** @param {ReadonlyArray<object>} checks @returns {string} */
const contract = (checks) => `${JSON.stringify({
  schema: 'cellular-mode/verification', version: 1, checks,
}, null, 2)}\n`;

/** @param {object} [over] @returns {Record<string, unknown>} */
const check = (over = {}) => ({
  id: 'unit', argv: exits(0), status: 'VERIFIED', basis: 'ran here', mandatory: true,
  approval: null, ...over,
});

/** @param {string} root @returns {ReadonlyArray<import('../tools/gates/final-evidence.mjs').FinalRecord>} */
const records = (root) => {
  const full = join(root, FINAL_EVIDENCE_PATH);
  return existsSync(full) ? parseRecords(readFileSync(full, 'utf8')) : [];
};

/** Runs `body` in a fresh repository and always cleans up. @param {(root: string) => void} body */
function withRepo(body) {
  const root = makeRepo();
  try {
    body(root);
  } finally {
    cleanup(root);
  }
}

// THE PROMISE OF BS3: absent file, nothing changes. Both halves are asserted — the selection IS
// the built-in constant, and the constant still holds the four checks it was given in stage 4.
test('suite · with no contract the selection is MANDATORY_SUITE, unchanged', { skip }, () => {
  withRepo((root) => {
    const selected = selectSuite(root);
    assert.equal(selected.suite, MANDATORY_SUITE, 'the same object, not merely an equal one');
    assert.equal(selected.source, BUILT_IN);
    assert.equal(selected.error, null);
  });
  assert.deepEqual(MANDATORY_SUITE.map((entry) => entry.name),
    ['typecheck', 'tests', 'gates-release', 'cell-state'],
    'removing a built-in check is a RELAXATION and needs the constitution to say so');
  assert.equal(Object.isFrozen(MANDATORY_SUITE), true);
  assert.equal(selectSuite(join(process.cwd(), 'definitely-not-a-directory')).source, BUILT_IN);
});

test('suite · a valid contract runs its mandatory checks and only those', { skip }, () => {
  withRepo((root) => {
    write(root, VERIFICATION_REL, contract([
      check({ id: 'green', argv: exits(0) }),
      check({ id: 'optional', argv: exits(3), mandatory: false, status: 'INFERRED', basis: 'guessed' }),
      check({ id: 'approved', argv: exits(0), status: 'INFERRED', basis: 'a human said so',
        approval: { by: 'human', at: '2026-10-06T10:00:00Z' } }),
    ]));
    const selected = selectSuite(root);
    assert.deepEqual(selected.suite.map((entry) => entry.name), ['green', 'approved']);
    assert.equal(selected.source, VERIFICATION_REL);
    const result = runFinalVerification({ root });
    assert.equal(result.ok, true, result.reason);
    assert.deepEqual(result.record.checks.map((entry) => entry.name), ['green', 'approved']);
  });
});

test('suite · the method\'s own cell-state check is added, never approved away', { skip }, () => {
  withRepo((root) => {
    write(root, 'tools/cellmode/cli.mjs', 'process.exit(0);\n');
    write(root, VERIFICATION_REL, contract([check({ id: 'green' })]));
    assert.deepEqual(selectSuite(root).suite.map((entry) => entry.name), ['green', 'cell-state']);
    const result = runFinalVerification({ root });
    assert.equal(result.ok, true, result.reason);
    assert.deepEqual(result.record.checks.map((entry) => entry.name), ['green', 'cell-state']);
  });
});

test('suite · an unreadable or invalid contract FAILS CLOSED', { skip }, () => {
  withRepo((root) => {
    write(root, VERIFICATION_REL, '{ not json\n');
    assert.deepEqual(selectSuite(root).suite, []);
    assert.match(String(selectSuite(root).error), /not a valid verification contract/);
    const result = runFinalVerification({ root });
    assert.equal(result.ok, false);
    assert.match(result.reason, /vault\/verification\.json/);
    assert.deepEqual(result.record.checks, [], 'nothing ran, and nothing is reported as having run');
    assert.equal(records(root).length, 1, 'the refusal is still recorded');
    assert.equal(records(root)[0]?.ok, false);
  });
  // The rule the schema exists for, reaching all the way out to the verdict.
  withRepo((root) => {
    write(root, VERIFICATION_REL, contract([check({ status: 'INFERRED', basis: 'a guess' })]));
    const result = runFinalVerification({ root });
    assert.equal(result.ok, false, 'an INFERRED check may not be mandatory, so the contract is invalid');
    assert.match(result.reason, /VERIFIED or carry an explicit human approval/);
  });
});

test('suite · a contract with nothing mandatory FAILS CLOSED with the next step', { skip }, () => {
  withRepo((root) => {
    write(root, VERIFICATION_REL, contract([check({ mandatory: false })]));
    assert.equal(selectSuite(root).error, NO_MANDATORY_REASON);
    const result = runFinalVerification({ root });
    assert.equal(result.ok, false);
    assert.equal(result.reason, NO_MANDATORY_REASON);
    assert.equal(records(root)[0]?.ok, false);
  });
  withRepo((root) => {
    write(root, VERIFICATION_REL, contract([]));
    assert.equal(runFinalVerification({ root }).reason, NO_MANDATORY_REASON);
  });
});

// NO SHELL, PROVEN rather than asserted: the argv below would create `pwned.txt` if anything
// joined it into a command line. It must exit 0 and leave no file behind.
test('suite · a contract check runs with NO shell, so `;` and `&&` are arguments', { skip }, () => {
  withRepo((root) => {
    const written = `require('node:fs').writeFileSync('pwned.txt','x')`;
    write(root, VERIFICATION_REL, contract([check({
      id: 'inert', argv: [...exits(0), ';', 'node', '-e', written, '&&', 'node', '-e', written],
    })]));
    const result = runFinalVerification({ root });
    assert.equal(result.ok, true, result.reason);
    assert.equal(existsSync(join(root, 'pwned.txt')), false,
      'a shell would have created this file; shell: false means those elements are arguments');
    assert.equal(git(root, ['status', '--porcelain']).stdout.includes('pwned'), false);
  });
});

test('suite · a failing contract check fails the run and authorizes nothing', { skip }, () => {
  withRepo((root) => {
    write(root, VERIFICATION_REL, contract([check({ id: 'red', argv: exits(2) })]));
    const result = runFinalVerification({ root });
    assert.equal(result.ok, false);
    assert.match(result.reason, /red \(exit 2\)/);
    assert.equal(records(root)[0]?.ok, false);
  });
});

// H7, THE HALF THAT MUST SURVIVE A BOOTSTRAP REMOVAL. `tests/verification-shim.test.mjs` holds
// this resolver and Bootstrap's to identical answers, but it is deleted WITH Bootstrap
// (tools/gates/removal-paths.mjs), so the gate-side rule is asserted here as well — in a file
// that imports no Bootstrap module and stays behind.
//
// EVERY PATH HERE IS BUILT WITH `node:path`, never spelled with a separator: the resolver joins
// with the HOST's path module, so a literal Windows path would make this test pass on Windows and
// fail on Linux — the defect class CI run 37188606487 already caught once.
test('suite · H7 resolves an exact npm/npx shim on win32 and nothing else, ever', () => {
  assert.deepEqual(Object.keys(SHIMS), ['npm', 'npx'], 'the list is closed');
  const node = join('/nodes', 'bin', 'node');
  const cliFor = (/** @type {string} */ name) => join('/nodes', 'bin', 'node_modules', 'npm', 'bin', name);
  const win = { platform: 'win32', execPath: node, exists: () => true };
  assert.deepEqual([...resolveShimArgv(['npm', 'test'], win).argv], [node, cliFor('npm-cli.js'), 'test']);
  assert.deepEqual([...resolveShimArgv(['npx', 'tsc'], win).argv], [node, cliFor('npx-cli.js'), 'tsc']);
  // Everything else is returned untouched, which is how `cmd /c` stays a matter for the argv rule.
  for (const argv of [['node', '--test'], ['npm.cmd', 'test'], ['./npm', 'test'], ['cmd', '/c', 'dir']]) {
    const answer = resolveShimArgv(argv, win);
    assert.deepEqual([...answer.argv], argv, `${argv[0]} must not be rewritten`);
    assert.equal(answer.reason, null);
  }
  const posix = resolveShimArgv(['npm', 'test'], { platform: 'linux', execPath: node, exists: () => true });
  assert.deepEqual([...posix.argv], ['npm', 'test'], 'off Windows there is no shim to resolve');
  assert.equal(posix.resolved, false);
  // No cli file ⇒ not-runnable with the NON-SHELL alternative named. A shell is never the answer.
  const missing = resolveShimArgv(['npm', 'test'], { platform: 'win32', execPath: node, exists: () => false });
  assert.equal(missing.resolved, false);
  assert.match(String(missing.reason), /no shell is ever used/);
  assert.ok(String(missing.reason).includes(SHIM_ALTERNATIVE));
  assert.ok(String(missing.reason).includes(cliFor('npm-cli.js')), 'the path looked for is named');
});
