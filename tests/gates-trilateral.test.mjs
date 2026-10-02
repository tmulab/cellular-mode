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
import { exitCodeFor, parseTestCounts } from '../tools/gates/trilateral.mjs';
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

test('trilateral · test counts are read from either reporter format', () => {
  assert.deepEqual(parseTestCounts('# tests 133\n# pass 133\n# fail 0\n'), { pass: 133, fail: 0, total: 133 });
  assert.deepEqual(parseTestCounts('ℹ tests 7\nℹ pass 6\nℹ fail 1\n'), { pass: 6, fail: 1, total: 7 });
  assert.deepEqual(parseTestCounts('nothing useful'), { pass: null, fail: null, total: null });
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
