// Tests for the pure pieces of Trilateral Verification: which module the load gate may
// import, how the test counts are read, how the exit code is decided, and — since R-1 was
// withdrawn — how the typecheck probe finds the compiler the lockfile names.
//
// Split out of gates-boundaries.test.mjs at the 200-line rule. Everything here runs on
// fixtures or on a cheap `--version` probe: nothing in this file compiles the repository,
// because `npm run trilateral` already does that and a test suite that waits on a
// compiler is a test suite people stop running.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { partitionModules, stripNoise, topLevelStatement } from '../tools/gates/top-level.mjs';
import {
  exitCodeFor, parseTestCounts, selectedLegs, testsResult,
} from '../tools/gates/trilateral-legs.mjs';
import { configPath, resolveTypeChecker, typecheckAvailable } from '../tools/gates/typecheck.mjs';
import { readTuples } from '../tools/gates/scan.mjs';

test('trilateral · a module of declarations only is importable; a statement makes it an entry point', () => {
  assert.equal(topLevelStatement('import a from "./a.mjs";\nexport const x = 1;\n'), null);
  assert.equal(topLevelStatement('export function f() {\n  doThing();\n}\n'), null, 'calls inside a body are not top level');
  assert.equal(topLevelStatement('const x = compute();\n'), null, 'a declaration may call, that is how modules build values');
  const cli = topLevelStatement('#!/usr/bin/env node\nimport { main } from "./main.mjs";\nprocess.exitCode = main();\n');
  assert.equal(cli?.line, 3);
  assert.match(String(cli?.source), /process\.exitCode/);
  assert.equal(topLevelStatement('try {\n  run();\n} catch {}\n')?.line, 1);
});

test('trilateral · braces inside strings and comments do not fool the scanner', () => {
  assert.equal(stripNoise('const a = "}{";\n').includes('}'), false);
  assert.equal(topLevelStatement('export function f() {\n  const s = "}";\n  go();\n}\n'), null);
});

test('trilateral · the load gate partitions, counts, and hides nothing', () => {
  const files = [
    { path: 'a.mjs', text: 'export const x = 1;\n' },
    { path: 'a.test.mjs', text: 'test("x", () => {});\n' },
    { path: 'cli.mjs', text: 'process.exitCode = 0;\n' },
    { path: 'notes.md', text: '# ignored\n' },
  ];
  const { load, skipped } = partitionModules(files);
  assert.deepEqual(load, ['a.mjs']);
  assert.deepEqual(skipped.map((s) => s.path), ['a.test.mjs', 'cli.mjs']);
  assert.match(String(skipped[1]?.reason), /entry point/);
});

test('trilateral · the real CLIs are recognised as entry points, not imported', () => {
  const code = readTuples(undefined, (rel) => rel.endsWith('.mjs'));
  const { load, skipped } = partitionModules(code);
  const entryPoints = skipped.filter((s) => s.reason.startsWith('entry point')).map((s) => s.path);
  for (const expected of ['tools/cellmode/cli.mjs', 'tools/key-audit/cli.mjs', 'examples/text-stats/reproduce.mjs']) {
    assert.ok(entryPoints.includes(expected), `${expected} must never be imported by the load gate`);
  }
  assert.ok(load.length > 20, `the gate must still load the library modules, got ${load.length}`);
  assert.ok(load.includes('tools/gates/size.mjs'));
});

/** A full TAP summary, as `node --test --test-reporter=tap` prints it.
 * @param {Partial<Record<'tests'|'pass'|'fail'|'cancelled'|'skipped'|'todo', number>>} counts */
const tap = (counts) => Object.entries({ tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0, ...counts })
  .map(([key, value]) => `# ${key} ${value}`).join('\n');

test('trilateral · test counts are read from either reporter format, all six of them', () => {
  assert.deepEqual(parseTestCounts(tap({ tests: 133, pass: 133 })),
    { pass: 133, fail: 0, total: 133, skipped: 0, cancelled: 0, todo: 0 });
  assert.deepEqual(parseTestCounts('ℹ tests 7\nℹ pass 6\nℹ fail 1\n'),
    { pass: 6, fail: 1, total: 7, skipped: null, cancelled: null, todo: null });
  assert.deepEqual(parseTestCounts('nothing useful'),
    { pass: null, fail: null, total: null, skipped: null, cancelled: null, todo: null });
});

// The first remote CI run reported `989 passed, 2 failed, 993 total` and nothing else: the two
// results missing from that sum were CANCELLED tests, and the leg still printed a sentence a
// reader would add up wrongly. The leg now refuses a summary whose parts do not reach its total.
test('trilateral · the tests leg FAILS when the counts do not add up', () => {
  const leg = testsResult(tap({ tests: 993, pass: 989, fail: 2 }), 1);
  assert.equal(leg.status, 'fail');
  assert.match(leg.text, /counts do not add up/);
});

test('trilateral · a CANCELLED test fails the leg even when the runner exits 0', () => {
  const leg = testsResult(tap({ tests: 993, pass: 991, cancelled: 2 }), 0);
  assert.equal(leg.status, 'fail', 'a cancelled test did not run: it is never a pass');
  assert.match(leg.text, /2 test\(s\) CANCELLED/);
  assert.equal(leg.counts?.cancelled, 2, 'the number travels beside the sentence');
});

test('trilateral · a complete, consistent, green summary passes and reports every number', () => {
  const leg = testsResult(tap({ tests: 996, pass: 993, skipped: 2, todo: 1 }), 0);
  assert.equal(leg.status, 'pass');
  assert.match(leg.text, /993 passed, 0 failed, 996 total/);
  assert.match(leg.text, /2 skipped/);
  assert.equal(testsResult(tap({ tests: 996, pass: 995, fail: 1 }), 1).status, 'fail',
    'a real failure is still a failure');
  assert.equal(testsResult('nothing useful', 0).status, 'fail',
    'an unparsable summary is UNKNOWN, and UNKNOWN is never green');
});

// R-1 was withdrawn because of this: the probe has to find the compiler the LOCKFILE
// names, in node_modules, not whatever a developer happens to have installed globally.
// A probe that only looked at PATH would report UNKNOWN on the machine that holds the
// compiler, which is the failure this test exists to prevent from coming back.
test('trilateral · the typecheck probe resolves the pinned compiler from node_modules', () => {
  assert.equal(configPath(), 'jsconfig.json', 'a JavaScript project uses jsconfig.json');
  const tsc = resolveTypeChecker();
  assert.ok(tsc !== null, 'after `npm install` a type checker must resolve');
  assert.equal(tsc.cmd, process.execPath, 'the local compiler runs with THIS node');
  assert.equal(tsc.shell, false, 'no shell: no PATH lookup and no .cmd shim to get wrong');
  assert.match(String(tsc.args[0]), /node_modules[\\/]typescript[\\/]bin[\\/]tsc$/);
  assert.match(tsc.version, /^Version \d+\./);
  assert.equal(typecheckAvailable(), true, 'the --release probe reads the same answer');
});

test('trilateral · FAILS CLOSED: no config means UNKNOWN, never an empty pass', () => {
  const empty = mkdtempSync(join(tmpdir(), 'gates-typecheck-'));
  try {
    assert.equal(configPath(empty), null);
    assert.equal(resolveTypeChecker(empty), null, 'a compiler with no config has nothing to read');
    assert.equal(typecheckAvailable(empty), false);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test('trilateral · UNAVAILABLE is reported, not hidden, and does not fail the run', () => {
  const warn = { status: 'warn' };
  assert.equal(exitCodeFor({ typecheck: warn, build: { status: 'pass' }, tests: { status: 'pass' } }), 0);
  assert.equal(exitCodeFor({ typecheck: { status: 'fail' }, build: { status: 'pass' }, tests: { status: 'pass' } }), 1);
  assert.equal(exitCodeFor({ typecheck: warn, build: { status: 'fail' }, tests: { status: 'pass' } }), 1);
  assert.equal(exitCodeFor({ typecheck: warn, build: { status: 'pass' }, tests: { status: 'fail' } }), 1);
});

// CI runs the three legs as three SEPARATE steps, so that a failing test shows up under a step
// called `tests` with the names of the tests in it. The first remote run did not: the build step
// invoked this script, which runs the whole suite, and the failure was reported as `build` with
// no test name anywhere in the log. `--legs` is what lets a caller ask for less than everything.
test('trilateral · --legs selects the legs to run, and the default is all three', () => {
  assert.deepEqual(selectedLegs([]), ['typecheck', 'build', 'tests']);
  assert.deepEqual(selectedLegs(['--legs', 'typecheck,build']), ['typecheck', 'build']);
  assert.deepEqual(selectedLegs(['--build-only']), ['typecheck', 'build'],
    '--build-only is the name the workflow uses for the same request');
  assert.deepEqual(selectedLegs(['--legs', 'tests']), ['tests']);
  assert.deepEqual(selectedLegs(['--legs', ' build , typecheck ']), ['typecheck', 'build'],
    'the order is the order of the rule, not of the argument');
  assert.throws(() => selectedLegs(['--legs', 'lint']), /unknown leg "lint"/);
  assert.throws(() => selectedLegs(['--legs']), /--legs needs/);
});

test('trilateral · a leg that did not run is never counted as green', () => {
  const pass = { status: 'pass' };
  assert.equal(exitCodeFor({ typecheck: pass, build: pass }), 0, 'a build-only run can pass');
  assert.equal(exitCodeFor({ typecheck: pass, build: { status: 'fail' } }), 1);
  assert.equal(exitCodeFor({ tests: { status: 'fail' } }), 1);
  assert.equal(exitCodeFor({}), 1, 'a run that executed no leg established nothing');
});
