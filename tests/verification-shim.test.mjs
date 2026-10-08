// H7, AND THE REASON THIS FILE IS IN `tests/` RATHER THAN BESIDE EITHER MODULE.
//
// The Windows shim resolution exists TWICE, once per boundary: `tools/gates/verification-suite.mjs`
// resolves the argv of a verify-final contract check, and `tools/bootstrap/exec-shim.mjs` resolves
// the argv of an adoption baseline run and of `verification run`. It is duplicated because
// `tools/bootstrap/**` may not import `tools/gates/**` (bootstrap/CONTRACTS.md, import boundary:
// the gates are COPIED as data). The repository-level suite is the one place allowed to import
// both, so this is where the two are held together: SAME INPUT, SAME ANSWER, including the exact
// wording of the refusal. If one of them is changed and the other is not, this file goes red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShimArgv as gateResolve, shimReason as gateReason, SHIMS as GATE_SHIMS } from '../tools/gates/verification-suite.mjs';
import { resolveShimArgv as bootResolve, shimReason as bootReason, SHIMS as BOOT_SHIMS, SHIM_ALTERNATIVE } from '../tools/bootstrap/exec-shim.mjs';
import { runCheck } from '../tools/bootstrap/exec.mjs';
import { join } from 'node:path';

// EVERY PATH IS BUILT WITH `node:path`, never spelled with a separator: both resolvers join with
// the HOST's path module, so a literal Windows path would make this file pass on Windows and fail
// on Linux — the defect class CI run 37188606487 already caught once.
const NODE = join('/nodes', 'bin', 'node');
const NPM_CLI = join('/nodes', 'bin', 'node_modules', 'npm', 'bin', 'npm-cli.js');
const NPX_CLI = join('/nodes', 'bin', 'node_modules', 'npm', 'bin', 'npx-cli.js');

/** Every input the two resolvers must agree on. `exists` is INJECTED, so the table runs
 * identically on Windows, Linux and macOS — the platform under test is a parameter, never the
 * machine. @type {ReadonlyArray<{ why: string, argv: string[],
 *   deps: { platform: string, execPath: string, exists: (p: string) => boolean } }>} */
const TABLE = Object.freeze([
  { why: 'npm on win32, cli present', argv: ['npm', 'test'], deps: { platform: 'win32', execPath: NODE, exists: () => true } },
  { why: 'npx on win32, cli present', argv: ['npx', 'tsc', '-p', '.'], deps: { platform: 'win32', execPath: NODE, exists: () => true } },
  { why: 'npm on win32, cli MISSING', argv: ['npm', 'run', 'lint'], deps: { platform: 'win32', execPath: NODE, exists: () => false } },
  { why: 'npx on win32, cli MISSING', argv: ['npx', 'eslint'], deps: { platform: 'win32', execPath: NODE, exists: () => false } },
  { why: 'another program on win32', argv: ['node', '--test'], deps: { platform: 'win32', execPath: NODE, exists: () => true } },
  { why: 'npm.cmd is NOT the closed list', argv: ['npm.cmd', 'test'], deps: { platform: 'win32', execPath: NODE, exists: () => true } },
  { why: './npm is NOT the closed list', argv: ['./npm', 'test'], deps: { platform: 'win32', execPath: NODE, exists: () => true } },
  { why: 'NPM is case-sensitive, so not the list', argv: ['NPM', 'test'], deps: { platform: 'win32', execPath: NODE, exists: () => true } },
  { why: 'npm on linux is left alone', argv: ['npm', 'test'], deps: { platform: 'linux', execPath: NODE, exists: () => true } },
  { why: 'npm on darwin is left alone', argv: ['npm', 'test'], deps: { platform: 'darwin', execPath: NODE, exists: () => true } },
  { why: 'an empty argv', argv: [], deps: { platform: 'win32', execPath: NODE, exists: () => true } },
]);

test('H7 · the gate resolver and the Bootstrap resolver answer identically, input by input', () => {
  assert.deepEqual(GATE_SHIMS, BOOT_SHIMS, 'the closed list is the same list');
  for (const row of TABLE) {
    const gate = gateResolve(row.argv, row.deps);
    const boot = bootResolve(row.argv, row.deps);
    assert.deepEqual({ argv: [...gate.argv], resolved: gate.resolved, reason: gate.reason },
      { argv: [...boot.argv], resolved: boot.resolved, reason: boot.reason },
      `the two resolvers disagree on: ${row.why}`);
  }
  assert.equal(gateReason('npm', NPM_CLI), bootReason('npm', NPM_CLI), 'the refusal is worded once');
});

test('H7 · the resolution table: what each input resolves to, and what it does not', () => {
  const win = { platform: 'win32', execPath: NODE, exists: () => true };
  assert.deepEqual([...gateResolve(['npm', 'test'], win).argv], [NODE, NPM_CLI, 'test']);
  assert.equal(gateResolve(['npm', 'test'], win).resolved, true);
  assert.deepEqual([...gateResolve(['npx', 'tsc'], win).argv], [NODE, NPX_CLI, 'tsc']);
  // Not in the closed list: left EXACTLY as it was, which is how `cmd /c` stays refused by the
  // argv rule rather than being resolved into something runnable here.
  for (const argv of [['node', '--test'], ['npm.cmd', 'test'], ['./npm', 'test'], ['cmd', '/c', 'dir']]) {
    const answer = gateResolve(argv, win);
    assert.deepEqual([...answer.argv], argv, `${argv[0]} must not be rewritten`);
    assert.equal(answer.resolved, false);
    assert.equal(answer.reason, null);
  }
  // On anything but win32 the argv is unchanged, resolved false, reason null.
  const posix = gateResolve(['npm', 'test'], { platform: 'linux', execPath: NODE, exists: () => true });
  assert.deepEqual([...posix.argv], ['npm', 'test']);
  assert.equal(posix.resolved, false);
  assert.equal(posix.reason, null);
});

test('H7 · a missing cli file is not-runnable with the non-shell alternative named', () => {
  const missing = bootResolve(['npm', 'test'], { platform: 'win32', execPath: NODE, exists: () => false });
  assert.equal(missing.resolved, false, 'nothing was resolved');
  assert.deepEqual([...missing.argv], ['npm', 'test'], 'and the argv was not invented');
  assert.match(String(missing.reason), /no shell is ever used/);
  assert.ok(String(missing.reason).includes(NPM_CLI), 'the path that was looked for is named');
  assert.ok(String(missing.reason).includes(SHIM_ALTERNATIVE), 'and so is what to do instead');
  assert.match(SHIM_ALTERNATIVE, /node --test/);
});

test('H7 · on win32 a real `npm --version` runs through runCheck with NO shell',
  { skip: process.platform === 'win32' ? false : `not Windows (${process.platform}): there is no .cmd shim to resolve here` },
  () => {
    const outcome = runCheck(['npm', '--version'], { timeoutMs: 120000 });
    assert.equal(outcome.status, 'passed', `${outcome.status} · ${outcome.reason ?? ''}`);
    assert.equal(outcome.exitCode, 0);
    assert.deepEqual([...outcome.argv], ['npm', '--version'], 'the recorded argv is the one that was ASKED for');
    assert.ok(outcome.resolvedArgv, 'and the resolved argv says what actually ran');
    assert.equal(outcome.resolvedArgv?.[0], process.execPath);
    assert.match(String(outcome.resolvedArgv?.[1]), /npm-cli\.js$/);
  });
