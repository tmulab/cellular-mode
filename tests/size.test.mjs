// Hygiene: the 200-line rule of the method, applied to the method's own repository.
//
// This test used to carry its own limit of 210 lines - "the rule is 200, plus a
// little". That tolerance was a silent exception granted to every file at once, and
// it is gone. The limit is 200; the only way past it is a named entry in
// policy/size-exceptions.json with a rationale and an approver. The logic now lives
// in tools/gates/size.mjs so that `npm test` and `npm run gates` enforce the same
// thing, and this file stays a test of the repository rather than a second rule book.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LIMIT, checkSize, inScope, limitFor, ranking } from '../tools/gates/size.mjs';
import { ROOT, readPolicy, readTuples } from '../tools/gates/scan.mjs';

const files = readTuples(ROOT, inScope);
/** @type {Array<Record<string, unknown>>} */
const exceptions = readPolicy('size-exceptions.json', []);

test('size · the scan covers the whole repository', () => {
  assert.ok(files.length >= 50, `expected many files, found ${files.length}`);
  assert.ok(files.some((f) => f.path === 'AGENTS.md'), 'root documentation must be in scope');
  assert.ok(files.some((f) => f.path.startsWith('tools/cellmode/')), 'the CLI must be in scope');
});

test('size · no in-scope file exceeds its line budget', () => {
  const findings = checkSize(files, exceptions);
  assert.deepEqual(
    findings,
    [],
    `size findings (${findings.length}):\n  ${findings.map((f) => `${f.rule} ${f.path}: ${f.detail}`).join('\n  ')}`,
  );
});

test('size · the limit is the rule, not the rule plus a tolerance', () => {
  assert.equal(DEFAULT_LIMIT, 200);
});

test('size · the largest files are reported so drift is visible', () => {
  const top = ranking(files);
  assert.equal(top.length, 5);
  for (const { path, lines } of top) {
    assert.ok(lines > 0, `${path} must not be empty`);
    // Against the limit that actually applies, so an approved exception does not
    // turn the drift report into a false failure.
    assert.ok(lines <= limitFor(path, exceptions), `${path}: ${lines} lines`);
  }
});
