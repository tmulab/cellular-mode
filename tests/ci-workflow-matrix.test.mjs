// What the FIRST REMOTE CI RUN taught this workflow. Every assertion here is a correction,
// and each one names the thing that went wrong, so that a future edit which undoes it has to
// argue with the reason rather than with a style preference.
//
// Run 37185128292 (ubuntu-24.04, Node 22.23.3) failed at a step called `build (module load)`
// with "tests: 989 passed, 2 failed, 993 total" and not one test name, because that step ran
// `trilateral.mjs`, which runs all three legs. The two missing results (989 + 2 is 991, not
// 993) were CANCELLED tests: eip/plugins/observer-advisor/call-model.mjs unref'd its deadline
// timer, so a never-answering adapter left a promise that could never settle — on Node 22. On
// Node 24 the same code passed. See tools/gates/CI.md.
//
// The reader is ./workflow-reader.mjs; the general shape and safety properties are asserted in
// ./ci-workflow.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pkg, stepsNamed, text, valuesOf } from './workflow-reader.mjs';

// The first remote run used ONE Node version, and the defect it found (eip/plugins/
// observer-advisor/call-model.mjs) reproduces on 22 and not on 24. One version is therefore
// not a verification of "this project runs on Node": the matrix IS the support policy, and
// engines.node must name exactly the lines CI proves.
test('workflow · the matrix is every Node line engines declares, and only those', () => {
  assert.deepEqual(valuesOf('node-version'), ['${{ matrix.node }}'],
    'the version comes from the matrix, so a line cannot be verified in name only');
  const declared = /node:\s*\[([^\]]+)\]/.exec(text);
  assert.ok(declared !== null, 'strategy.matrix must list the Node versions');
  const matrix = String(declared?.[1]).split(',').map((part) => Number(part.trim().replace(/['"]/g, '')));
  const supported = String(pkg.engines?.node ?? '').split('||')
    .map((range) => Number(/\d+/.exec(range)?.[0])).sort((a, b) => a - b);
  assert.deepEqual([...matrix].sort((a, b) => a - b), supported,
    `the matrix ${JSON.stringify(matrix)} must equal engines.node ${pkg.engines?.node}`);
  for (const version of matrix) {
    assert.ok(Number.isInteger(version) && version >= 22, `${version} is not a supported line`);
    assert.equal(version % 2, 0, 'an even major is an LTS line; an odd one is never supported long');
  }
  assert.match(text, /fail-fast:\s*false/,
    'one failing line must not cancel the other: both answers are wanted');
});

test('workflow · the runner image is PINNED, because a moving image moves the evidence', () => {
  assert.deepEqual(valuesOf('runs-on'), ['ubuntu-24.04']);
  // A comment may name the moving tag to explain itself; no step may RUN on it.
  assert.equal(valuesOf('runs-on').some((image) => image.includes('latest')), false,
    'ubuntu-latest changes under the project without notice: the verified image is named');
});

// WHY: the first remote run put `node tools/gates/trilateral.mjs` in a step called `build`.
// That script runs typecheck, the module-load gate AND the whole suite, so a failing test was
// reported as a failing BUILD, with no test name anywhere in the log. The build step is now
// build-only, and the suite has a step of its own with the spec reporter.
test('workflow · the build step runs the build legs ONLY, never the suite', () => {
  assert.ok(text.includes('node tools/gates/trilateral.mjs --legs typecheck,build'),
    'the build step must ask for the build legs only');
  assert.equal(/trilateral\.mjs\s*$/m.test(text), false,
    'a bare trilateral.mjs call would run the whole suite inside the build step again');
  const tests = stepsNamed('tests');
  assert.equal(tests.length, 1, 'exactly one step runs the suite');
  assert.match(tests[0] ?? '', /--test-reporter=spec/,
    'the spec reporter names each failing test in the log');
  assert.match(tests[0] ?? '', /\|\s*tee\s+"\$RUNNER_TEMP\/tests\.log"/,
    'the log is kept, so the counts the summary prints are the ones the runner reported');
});

test('workflow · conformance in CI REQUIRES the provisioned toolchains', () => {
  assert.ok(text.includes('npm run upp:conformance -- --require python,java,rust'),
    'on a provisioned runner a SKIPPED row means broken provisioning, not a bare machine');
  assert.equal(text.includes(',cpp'), false,
    'cpp has never been compiled anywhere in this project: it stays UNEXECUTED');
});
