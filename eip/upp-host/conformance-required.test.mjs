// `--require`: the difference between "this machine does not have rustc" and "the CI runner
// was supposed to have rustc".
//
// A SKIPPED row is honest on a developer laptop and is deliberately not a failure there. On a
// runner provisioned with Python, a JDK and a Rust toolchain, the same row means the
// provisioning broke — and a conformance matrix that reports PASS while silently skipping
// three of its six implementations is precisely the false green this option removes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequired, unmetRequirements } from './conformance-required.mjs';

/** @type {(name: string, status: string, reason?: string) => import('./conformance-run.mjs').Report} */
const report = (name, status, reason) => ({
  name, language: `${name} lang`, status, results: [], ...(reason === undefined ? {} : { reason }),
});

test('require · a required implementation that was SKIPPED is unmet, and says why', () => {
  const reports = [report('python', 'PASS'), report('rust', 'SKIPPED', 'rustc is absent: ENOENT')];
  const unmet = unmetRequirements(reports, ['python', 'rust']);
  assert.equal(unmet.length, 1);
  assert.match(unmet[0] ?? '', /^rust was REQUIRED but is SKIPPED/);
  assert.match(unmet[0] ?? '', /rustc is absent: ENOENT/);
});

test('require · a required implementation nobody ran at all is unmet', () => {
  assert.deepEqual(unmetRequirements([report('python', 'PASS')], ['java']),
    ['java was REQUIRED but did not run in this invocation']);
});

test('require · UNEXECUTED is unmet too: cpp is never required, and may never be assumed', () => {
  const unmet = unmetRequirements([report('cpp', 'UNEXECUTED', 'not built or run by this suite')], ['cpp']);
  assert.match(unmet[0] ?? '', /REQUIRED but is UNEXECUTED/);
  assert.deepEqual(unmetRequirements([report('cpp', 'UNEXECUTED', 'unverified everywhere')], []), [],
    'with nothing required, an UNEXECUTED row stays a visible non-failure');
});

test('require · nothing required means nothing to check, and PASS satisfies a requirement', () => {
  assert.deepEqual(unmetRequirements([report('python', 'SKIPPED', 'absent')], []), []);
  assert.deepEqual(unmetRequirements([report('python', 'PASS'), report('java', 'PASS')],
    ['python', 'java']), []);
  assert.deepEqual(unmetRequirements([report('python', 'FAIL')], ['python']),
    ['python was REQUIRED but is FAIL'], 'a FAIL is reported here too, and fails the run anyway');
});

test('require · the flag takes a comma-separated list, repeatable, and refuses an unknown name', () => {
  assert.deepEqual(parseRequired(['--require', 'python,java,rust']), ['python', 'java', 'rust']);
  assert.deepEqual(parseRequired(['--require', 'python', '--require', ' java ']), ['python', 'java']);
  assert.deepEqual(parseRequired(['--require', 'python,python']), ['python'], 'no duplicate');
  assert.deepEqual(parseRequired([]), []);
  assert.deepEqual(parseRequired(['--impl', 'python']), [], '--impl is not --require');
  assert.throws(() => parseRequired(['--require', 'haskell']), /unknown implementation "haskell"/);
  assert.throws(() => parseRequired(['--require']), /--require needs a comma-separated list/);
  assert.throws(() => parseRequired(['--require', '']), /--require needs a comma-separated list/);
});
