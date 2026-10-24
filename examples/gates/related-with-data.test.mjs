// Proves the data-aware light gate on a REAL fixture project, against the real failure:
// on 2026-10-22 a commit-time gate that selected tests from changed CODE only (the
// `vitest related` shape) stayed GREEN while a staged JSON fixture had already broken the
// test that reads it. `runRelatedOnlyGate` is that gate, kept as the control arm: same
// repository, same staged file, two verdicts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  classify, isDataFile, listTests, pathSuffixMatch, readersOf, runLightGate,
  runRelatedOnlyGate, selectTests, stringLiterals,
} from './related-with-data.mjs';

/** Production-shaped roster: accented names, real roles, three entries. */
const ROSTER_3 = {
  users: [
    { name: 'José Álvares de Azevedo', role: 'navigator' },
    { name: 'Maria Firmina dos Reis', role: 'pilot' },
    { name: 'Lima Barreto', role: 'reviewer' },
  ],
};
/** The same file after the staged edit that broke the suite: one entry dropped. */
const ROSTER_2 = { users: ROSTER_3.users.slice(0, 2) };

const USERS_TEST = `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const roster = JSON.parse(readFileSync('data/users.json', 'utf8'));
test('the roster carries the three declared members', () => {
  assert.equal(roster.users.length, 3);
  assert.equal(roster.users[0].name, 'José Álvares de Azevedo');
});
`;
const ROSTER_TEST = `import test from 'node:test';
import assert from 'node:assert/strict';
import roster from '../data/users.json' with { type: 'json' };
test('every member has a role', () => {
  assert.ok(roster.users.every((u) => typeof u.role === 'string' && u.role.length > 0));
});
`;
const GUARD_TEST = `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('guard · every shipped data file still parses', () => {
  assert.ok(JSON.parse(readFileSync('data/users.json', 'utf8')));
});
`;
const UNRELATED_TEST = `import test from 'node:test';
import assert from 'node:assert/strict';
import { greet } from '../src/greet.mjs';
test('greet names the person', () => assert.equal(greet('Ada'), 'Hello, Ada'));
`;

/**
 * A fixture repository on disk: the data file, two tests that read it, a guard folder and
 * an unrelated slice. Returns its root and a writer for the staged JSON edit.
 * @returns {{ root: string, writeRoster: (r: unknown) => void }}
 */
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'cm-light-gate-'));
  for (const dir of ['data', 'test', 'guard', 'src', 'docs']) mkdirSync(join(root, dir));
  const writeRoster = (/** @type {unknown} */ r) =>
    writeFileSync(join(root, 'data/users.json'), `${JSON.stringify(r, null, 2)}\n`);
  writeRoster(ROSTER_3);
  writeFileSync(join(root, 'test/users.test.mjs'), USERS_TEST);
  writeFileSync(join(root, 'test/roster.test.mjs'), ROSTER_TEST);
  writeFileSync(join(root, 'guard/smoke.test.mjs'), GUARD_TEST);
  writeFileSync(join(root, 'test/greet.test.mjs'), UNRELATED_TEST);
  writeFileSync(join(root, 'src/greet.mjs'), 'export const greet = (n) => `Hello, ${n}`;\n');
  writeFileSync(join(root, 'docs/notes.md'), '# Notes\n\nA documentation-only change.\n');
  return { root, writeRoster };
}

test('criterion · a path-suffix at a segment boundary, never a prefix of a name', () => {
  assert.equal(pathSuffixMatch('data/users.json', '../data/users.json'), true);
  assert.equal(pathSuffixMatch('data/users.json', './data/users.json'), true);
  assert.equal(pathSuffixMatch('data/users.json', 'users.json'), true);
  assert.equal(pathSuffixMatch('data/users.json', 'other-users.json'), false);
  assert.equal(pathSuffixMatch('data/users.json', 'data/users.json.bak'), false);
});

test('criterion · the four classes of appearance are distinguished', () => {
  const lit = (/** @type {string} */ src) => {
    const found = stringLiterals(src).find((l) => l.value.endsWith('users.json'));
    assert.ok(found, 'the literal must be found');
    return classify(src, found.index);
  };
  assert.equal(lit("import roster from '../data/users.json' with { type: 'json' };"), 'import');
  assert.equal(lit("const r = require('./data/users.json');"), 'require');
  assert.equal(lit("readFileSync('data/users.json', 'utf8')"), 'read');
  assert.equal(lit("// see data/users.json\nconst p = 'data/users.json';"), 'mention');
});

test('criterion · readersOf finds both tests that read the JSON, and only those', () => {
  const tests = [
    { path: 'test/users.test.mjs', text: USERS_TEST },
    { path: 'test/roster.test.mjs', text: ROSTER_TEST },
    { path: 'test/greet.test.mjs', text: UNRELATED_TEST },
  ];
  const readers = readersOf('data/users.json', tests).sort((a, b) => a.test.localeCompare(b.test));
  assert.deepEqual(readers, [
    { test: 'test/roster.test.mjs', via: 'import' },
    { test: 'test/users.test.mjs', via: 'read' },
  ]);
  assert.equal(isDataFile('data/users.json'), true);
  assert.equal(isDataFile('src/greet.mjs'), false);
});

test('a staged JSON that breaks a test turns the light gate RED', (t) => {
  const { root, writeRoster } = makeFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(listTests(root).sort(), [
    'guard/smoke.test.mjs', 'test/greet.test.mjs', 'test/roster.test.mjs', 'test/users.test.mjs',
  ]);

  writeRoster(ROSTER_2); // the staged edit: one member dropped
  const staged = ['data/users.json'];

  const light = runLightGate({ root, staged });
  assert.equal(light.ok, false, `expected RED, got code ${light.code}: ${light.output}`);
  assert.deepEqual(light.selection.files, [
    'guard/smoke.test.mjs', 'test/roster.test.mjs', 'test/users.test.mjs',
  ]);
  assert.ok(light.selection.reasons.some((r) => r.includes('reads data data/users.json (read)')));
  assert.ok(light.selection.reasons.some((r) => r.includes('guard directory')));
  assert.match(light.output, /fail 1/);

  // The control arm: the field gate, same repository, same staged file — GREEN. This is the
  // red-without-the-fix evidence: remove data awareness and the failure disappears.
  const related = runRelatedOnlyGate({ root, staged });
  assert.equal(related.ok, true, 'the related-only gate reproduces the 2026-10-22 hole');
  assert.deepEqual(related.selection.files, []);
});

test('an unrelated change stays green, and the guard folder still runs', (t) => {
  const { root } = makeFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const light = runLightGate({ root, staged: ['docs/notes.md'] });
  assert.equal(light.ok, true, light.output);
  assert.deepEqual(light.selection.files, ['guard/smoke.test.mjs']);
  assert.match(light.output, /pass 1/);
});

test('a staged test file is selected even when nothing it reads changed', () => {
  const tests = [
    { path: 'test/users.test.mjs', text: USERS_TEST },
    { path: 'guard/smoke.test.mjs', text: GUARD_TEST },
  ];
  const { files, reasons } = selectTests({ staged: ['test/users.test.mjs'], tests });
  assert.deepEqual(files, ['guard/smoke.test.mjs', 'test/users.test.mjs']);
  assert.ok(reasons.some((r) => r.includes('staged test file')));
});
