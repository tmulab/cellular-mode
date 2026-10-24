// conflicts.test.mjs — the mechanical crossing between the cells of one operation: the
// pure overlap rule, the `conflicts` table, and what `open` does with each verdict. The
// CLI runs in a child process against a fresh temp root with a fixed clock, so every
// assertion is about a file on disk or a real exit code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { freshRoot, run, readState, readCellText, paths } from './helpers.mjs';
import {
  pathsOverlap, inPathsOf, resourcesOf, crossOne, partyOf, conflictsField, worst,
} from './conflicts.mjs';

const FINISH = 'ship the v2 rules; publish the guide';
const PACK = 'max-active-cells: 3; batches: deploy → 1 per day; batches: test database → 2 per cell';
const OPEN_OP = ['op', 'open', 'Go Live', '--finish-line', FINISH, '--pack', PACK,
  '--bar', 'every claim carries an epistemic label', '--cells', 'login, billing, docs'];

/** A root with the operation open and `Login` 🔵 over `src/auth` (plus `src/auth/legacy`
 * declared NOT in). @param {string[]} [inPaths] @returns {string} */
function withLogin(inPaths = ['src/auth', 'docs/login.md']) {
  const root = freshRoot();
  run(root, ['init']);
  run(root, OPEN_OP);
  run(root, ['open', 'Login', '--area', 'auth', '--in', inPaths.join(', '),
    '--out', 'src/auth/legacy', '--next', 'write the failing test']);
  return root;
}

/** Hand-write the two fields no flag sets, the way a human edits the vault.
 * @param {string} root @param {string} slug @param {string} inputs @param {string} outputs */
function setResources(root, slug, inputs, outputs) {
  const file = paths(root).cellFile(slug);
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace(/\*\*Inputs:\*\*.*/, `**Inputs:** ${inputs} · **Outputs:** ${outputs}`), 'utf8');
}

test('the overlap rule: equal, directory prefix at a segment boundary, glob', () => {
  assert.equal(pathsOverlap('src/a.ts', './src/a.ts'), true, 'equal after normalizing');
  assert.equal(pathsOverlap('src/a.ts', 'SRC\\A.TS'), true, 'separator and case normalized');
  assert.equal(pathsOverlap('src', 'src/deep/a.ts'), true, 'directory prefix');
  assert.equal(pathsOverlap('src/', 'src/a.ts'), true, 'trailing slash');
  assert.equal(pathsOverlap('src', 'srcx/a.ts'), false, 'prefix only at a segment boundary');
  assert.equal(pathsOverlap('src/a.ts', 'src/b.ts'), false, 'siblings');
  assert.equal(pathsOverlap('tools/*.mjs', 'tools/check.mjs'), true, '* inside one segment');
  assert.equal(pathsOverlap('tools/*.mjs', 'tools/deep/check.mjs'), false, '* stops at /');
  assert.equal(pathsOverlap('apps/**', 'apps/web/src/a.ts'), true, '** crosses /');
  assert.equal(pathsOverlap('apps/**', 'apps'), true, 'a trailing /** holds the directory');
  assert.equal(pathsOverlap('apps/**', 'appsx'), false, 'and not its neighbour');
  assert.equal(pathsOverlap('a.ts', ''), false, 'nothing overlaps nothing');
});

test('a NOT-in entry removes the path from the cell\'s in-set', () => {
  const cell = { boundaryIn: 'src/auth, src/pay.ts', boundaryOut: 'src/pay.ts' };
  assert.deepEqual(inPathsOf(cell), ['src/auth']);
  // The exclusion uses the same rule, so a NOT-in directory removes the file under it.
  assert.deepEqual(inPathsOf({ boundaryIn: 'src/a/b.ts, src/c.ts', boundaryOut: 'src/a' }),
    ['src/c.ts']);
  assert.deepEqual(inPathsOf({ boundaryIn: '—', boundaryOut: '—' }), []);
});

test('resources are the Inputs/Outputs tokens, and the pack marks its own', () => {
  assert.deepEqual(resourcesOf({ inputs: 'Test database; fixtures', outputs: 'report.md' }),
    ['test database', 'fixtures', 'report.md']);
  assert.deepEqual(resourcesOf({ inputs: '—', outputs: '—' }), []);
  const a = partyOf('A', 'a', { inputs: 'test database', outputs: '—' });
  const b = partyOf('B', 'b', { inputs: 'test database', outputs: '—' });
  assert.deepEqual(crossOne(a, b, ['test database']).shared, ['test database (pack)']);
  assert.deepEqual(crossOne(a, b).shared, ['test database']);
  // A declared dependency, either way round, is a crossing too — and only a `shared` one.
  const dependent = partyOf('C', 'c', { dependencies: 'a' });
  assert.equal(crossOne(dependent, a).verdict, 'shared');
  assert.deepEqual(crossOne(a, dependent).shared, ['dependency: a']);
  assert.equal(worst([crossOne(a, partyOf('D', 'd', {}))]), 'none');
  assert.equal(conflictsField([]), '**Conflicts:** none');
});

test('open refuses an overlapping boundary with exit 3, naming the cells and the paths', () => {
  const root = withLogin();
  const refused = run(root, ['open', 'Billing', '--area', 'pay', '--in',
    'src/auth/token.ts, src/pay.ts', '--out', 'the gateway'], { expect: 3 });
  assert.match(refused.stderr, /cell "Billing" overlap with Login: src\/auth\/token\.ts/);
  assert.match(refused.stderr, /re-run with --confirm to open it anyway/);
  assert.equal(readCellText(root, 'billing'), null, 'a refused opening writes no cell file');
  assert.equal(readState(root, 'index').includes('Billing'), false, 'and no INDEX row');
  assert.equal(readState(root, 'log').includes('Billing'), false, 'and nothing in the log');
});

test('--confirm accepts the overlap, and the log records who accepted it', () => {
  const root = withLogin();
  const out = run(root, ['open', 'Billing', '--area', 'pay', '--in',
    'src/auth/token.ts, src/pay.ts', '--out', 'the gateway', '--confirm',
    '--next', 'read the token module']);
  assert.match(out.stdout, /WARNING: conflicts — overlap with Login: src\/auth\/token\.ts/);
  assert.match(readState(root, 'log'),
    /\*\*Conflicts:\*\* overlap with Login: src\/auth\/token\.ts — accepted by human/);
  assert.match(readState(root, 'log'), /## 2026-10-02 09:00 · Operation: Go Live/);
  assert.ok(readCellText(root, 'billing'), 'and the cell file is written');
  run(root, ['check']); // the operation entries are not cell closures: `check` ignores them
});

test('a directory prefix and a glob are overlaps too', () => {
  const dir = withLogin();
  assert.match(run(dir, ['open', 'Billing', '--in', 'src/auth/deep/pay.ts', '--out', 'x'],
    { expect: 3 }).stderr, /overlap with Login: src\/auth\/deep\/pay\.ts/);
  const glob = withLogin(['src/**']);
  assert.match(run(glob, ['open', 'Billing', '--in', 'src/pay/total.ts', '--out', 'x'],
    { expect: 3 }).stderr, /overlap with Login: src\/pay\/total\.ts/);
  // The other direction: the CANDIDATE carries the glob.
  const other = withLogin(['src/auth/token.ts']);
  assert.match(run(other, ['open', 'Billing', '--in', 'src/**', '--out', 'x'],
    { expect: 3 }).stderr, /overlap with Login: src\/\*\*/);
});

test('a path excluded by a NOT-in half does not overlap, and `none` is recorded', () => {
  const root = withLogin();
  const out = run(root, ['open', 'Billing', '--area', 'pay',
    '--in', 'src/auth/legacy/pay.ts', '--out', 'the gateway', '--next', 'read it']);
  assert.equal(out.stdout.includes('WARNING'), false, 'no warning: Login does not hold it');
  assert.match(readState(root, 'log'), /\*\*Conflicts:\*\* none/);
  assert.equal(readState(root, 'log').match(/\*\*Conflicts:\*\*/g)?.length, 1,
    'the FIRST cell crossed nobody: that opening wrote no entry at all');
  assert.equal(run(root, ['check']).status, 0);
});

test('a shared resource warns, is recorded, and never refuses', () => {
  const root = withLogin();
  setResources(root, 'login', 'test database', 'docs/login.md');
  run(root, ['plan', 'Billing', '--area', 'pay']);
  setResources(root, 'billing', 'Test database', '—');
  const out = run(root, ['open', 'Billing', '--in', 'src/pay.ts', '--out', 'the gateway']);
  assert.match(out.stdout, /WARNING: conflicts — shared test database \(pack\) with Login/);
  assert.match(readState(root, 'log'),
    /\*\*Conflicts:\*\* shared test database \(pack\) with Login\n/);
  assert.equal(run(root, ['check']).status, 0);
});

test('conflicts prints the table, read-only, and needs an operation and a cell file', () => {
  const root = withLogin();
  run(root, ['open', 'Billing', '--in', 'src/auth/token.ts, src/pay.ts', '--out', 'the gateway',
    '--confirm']);
  run(root, ['plan', 'Docs', '--area', 'docs']);
  const before = readState(root, 'log');
  const out = run(root, ['conflicts', 'Docs']);
  assert.match(out.stdout, /Conflicts for "Docs" \(docs\) · operation "Go Live" · 2 other 🔵 cell/);
  assert.match(out.stdout, /\| Cell \| Overlapping paths \| Shared resources \| Verdict \|/);
  assert.match(out.stdout, /\| Login \| — \| — \| none \|/);
  assert.match(out.stdout, /\| Billing \| — \| — \| none \|/);
  assert.match(out.stdout, /Verdict: none/);
  const billing = run(root, ['conflicts', 'Billing']);
  assert.match(billing.stdout, /\| Login \| src\/auth\/token\.ts \| — \| overlap \|/);
  assert.match(billing.stdout, /Verdict: overlap/);
  assert.equal(readState(root, 'log'), before, 'conflicts writes nothing');
  assert.match(run(root, ['conflicts', 'Nope'], { expect: 1 }).stderr, /no cell file for "Nope"/);
  assert.match(run(root, ['conflicts'], { expect: 1 }).stderr, /requires a cell name/);
  assert.match(run(root, ['conflicts', 'Docs', '--in', 'x'], { expect: 1 }).stderr,
    /unknown option --in/);
});

test('with no operation nothing crosses: open is byte-identical to before', () => {
  const plain = freshRoot();
  run(plain, ['init']);
  run(plain, ['open', 'Login', '--area', 'auth', '--in', 'src/auth', '--next', 'first step']);
  const out = run(plain, ['pause', '--facts', 'done', '--next', 'later']);
  assert.match(out.stdout, /Paused "Login" · ⏸/);
  // A second cell over the same path: the refusal is the OLD one (another cell is 🔵),
  // and the log carries no Conflicts line anywhere.
  run(plain, ['open', 'Billing', '--in', 'src/auth/token.ts']);
  assert.match(run(plain, ['open', 'Docs', '--in', 'src/auth'], { expect: 3 }).stderr,
    /cell "Billing" is active \(🔵\) — pause it first/);
  assert.equal(readState(plain, 'log').includes('Conflicts'), false);
  assert.match(run(plain, ['conflicts', 'Billing'], { expect: 1 }).stderr,
    /no operation is 🔵/);
  assert.equal(run(plain, ['check']).status, 0);
});
