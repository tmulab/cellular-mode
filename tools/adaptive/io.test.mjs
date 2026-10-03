// Tests for the only filesystem module — AD9, AD10 and AD12 of
// tools/adaptive/ACCEPTANCE.md.
//
// Three properties are being defended. (1) `io.mjs` is the ONLY module here that touches a
// disk, so the rest can be tested as arithmetic. (2) Reading is TOLERANT: a missing file is
// an absence, a malformed file is a report, and neither is a crash or a silent deletion —
// the file belongs to the human. (3) Writing is CONFINED and ATOMIC: everything lands under
// `<root>/.cellular/adaptive/`, never in `vault/`, and a reader never sees half a file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stripNoise } from '../gates/top-level.mjs';
import {
  STATE_REL, adaptivePaths, clear, confine, deleteSession, readPreferences, readSession,
  writePreferences, writeSession,
} from './io.mjs';

/** A root with a VAULT in it, so every test can prove the vault was not touched. */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'cellular-adaptive-'));
  mkdirSync(join(root, 'vault', 'state'), { recursive: true });
  writeFileSync(join(root, 'vault', 'state', 'log.md'), '# log\n', 'utf8');
  return root;
}
/** @type {(root: string) => string} */
const vaultHash = (root) => createHash('sha256')
  .update(readFileSync(join(root, 'vault', 'state', 'log.md'))).digest('hex');
/** @type {(over?: Record<string, unknown>) => import('./types.mjs').SessionState} */
const session = (over = {}) => /** @type {import('./types.mjs').SessionState} */ ({
  schema: 1, mode: 'tired', declaredBy: 'user', source: 'cli', command: '/modocansado',
  activatedAt: '2026-10-03T14:02:00.000Z', expiresAt: '2026-10-03T18:02:00.000Z',
  scope: 'session', ...over,
});

test('io · every path is derived from the root, under .cellular/adaptive, never under vault', () => {
  const paths = adaptivePaths('projects/demo');
  assert.equal(STATE_REL, '.cellular/adaptive');
  assert.equal(paths.root, resolve('projects/demo'), 'the root is resolved once, from the caller');
  assert.equal(paths.dir, join(paths.root, '.cellular', 'adaptive'));
  assert.equal(paths.session, join(paths.dir, 'session.json'));
  assert.equal(paths.preferences, join(paths.dir, 'preferences.json'));
  assert.equal(paths.injected, join(paths.dir, 'injected.json'), 'reserved for cell 4');
  for (const value of Object.values(paths)) {
    assert.equal(String(value).includes('vault'), false, `${String(value)} must not reach the vault`);
  }
  assert.equal(paths.dir.startsWith(paths.root), true, 'root-confined');
});

test('io · the confinement guard refuses a name that would leave the state directory', () => {
  const dir = join(resolve('demo'), '.cellular', 'adaptive');
  assert.equal(confine(dir, 'session.json'), join(dir, 'session.json'));
  for (const name of ['../../vault/state/log.md', '../escape.json', '/etc/passwd', './a/../../b']) {
    assert.throws(() => confine(dir, name), /would leave \.cellular\/adaptive/, name);
  }
});

test('io · a missing file is an absence, not an error and not a crash', () => {
  const root = makeRoot();
  assert.deepEqual(readSession(root), { value: null, error: null });
  assert.deepEqual(readPreferences(root), { value: null, error: null });
  assert.equal(existsSync(adaptivePaths(root).dir), false, 'reading creates nothing');
  rmSync(root, { recursive: true, force: true });
});

test('io · a session survives a round trip, and the write is atomic', () => {
  const root = makeRoot();
  const before = vaultHash(root);
  const written = writeSession(root, session());
  assert.equal(written, '.cellular/adaptive/session.json');
  assert.deepEqual(readSession(root), { value: JSON.parse(JSON.stringify(session())), error: null });
  const left = readdirSync(adaptivePaths(root).dir);
  assert.deepEqual(left, ['session.json'], 'no temporary file is left behind');
  assert.match(readFileSync(adaptivePaths(root).session, 'utf8'), /\n$/, 'a text file ends with a newline');
  assert.equal(vaultHash(root), before, 'the vault is untouched');
  rmSync(root, { recursive: true, force: true });
});

test('io · a malformed file is reported, kept, and never read as an absence', () => {
  const root = makeRoot();
  const paths = adaptivePaths(root);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.session, '{ this is not json', 'utf8');
  const result = readSession(root);
  assert.equal(result.value, null);
  assert.equal(typeof result.error, 'string');
  assert.match(String(result.error), /session\.json/);
  assert.equal(existsSync(paths.session), true, 'reading must never delete the human\'s file');
  assert.equal(readFileSync(paths.session, 'utf8'), '{ this is not json', 'nor rewrite it');
  rmSync(root, { recursive: true, force: true });
});

test('io · preferences are validated on read: a wrong file is an error, not a default', () => {
  const root = makeRoot();
  const paths = adaptivePaths(root);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.preferences, JSON.stringify({ schema: 1, mode: 'tired' }), 'utf8');
  const result = readPreferences(root);
  assert.equal(result.value, null);
  assert.match(String(result.error), /preferences\.json/);
  assert.match(String(result.error), /mode/, 'the error names the offending key');
  writeFileSync(paths.preferences, JSON.stringify({ schema: 1, ttlHours: 2 }), 'utf8');
  assert.deepEqual(readPreferences(root), { value: { schema: 1, enabled: true, ttlHours: 2 }, error: null });
  rmSync(root, { recursive: true, force: true });
});

test('io · deleting is idempotent and reports what it did', () => {
  const root = makeRoot();
  writeSession(root, session());
  assert.equal(deleteSession(root), true);
  assert.equal(deleteSession(root), false, 'nothing to delete is not a failure');
  assert.deepEqual(readSession(root), { value: null, error: null });
  rmSync(root, { recursive: true, force: true });
});

test('io · clear removes both files, names them, and keeps no backup', () => {
  const root = makeRoot();
  const before = vaultHash(root);
  writeSession(root, session());
  writePreferences(root, { schema: 1, enabled: true, ttlHours: 4 });
  assert.deepEqual(clear(root), ['.cellular/adaptive/session.json', '.cellular/adaptive/preferences.json']);
  assert.deepEqual(readdirSync(adaptivePaths(root).dir), [], 'no backup, no residue');
  assert.deepEqual(clear(root), [], 'clearing an empty state deletes nothing and says so');
  assert.equal(vaultHash(root), before);
  rmSync(root, { recursive: true, force: true });
});

test('io · a write creates the state directory, and only that directory', () => {
  const root = makeRoot();
  writeSession(root, session());
  assert.deepEqual(readdirSync(root).sort(), ['.cellular', 'vault']);
  assert.deepEqual(readdirSync(join(root, '.cellular')), ['adaptive']);
  rmSync(root, { recursive: true, force: true });
});

test('io · it is the ONLY module in tools/adaptive that touches a disk or a clock', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  // `*-fixture.mjs` is test scaffolding, not part of the module's contract: it builds the
  // temporary directories the CLI suite runs in, so of course it touches a disk.
  const modules = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && !f.endsWith('-fixture.mjs'));
  assert.ok(modules.length >= 6, `expected the module set, found ${modules.join(', ')}`);
  /** @type {string[]} */
  const offenders = [];
  for (const name of modules) {
    // Three exceptions, each a layer that is ALLOWED an effect: io.mjs is the filesystem
    // module, and main.mjs/cli.mjs are the composition layer and the entry point - the only
    // place that reads the clock and the environment.
    if (name === 'io.mjs' || name === 'cli.mjs' || name === 'main.mjs') continue;
    const text = readFileSync(join(dir, name), 'utf8');
    // The import is read from the raw source; the clock from the source with comments and
    // string bodies removed, so that NAMING `Date.now()` in a comment is not an offence.
    const touchesDisk = /from 'node:(fs|fs\/promises)'/.test(text);
    const readsClock = /Date\.now\(|new Date\(\s*\)/.test(stripNoise(text));
    if (touchesDisk) offenders.push(`${name}: imports node:fs`);
    if (readsClock) offenders.push(`${name}: reads the clock instead of taking it`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
  assert.match(readFileSync(join(dir, 'io.mjs'), 'utf8'), /from 'node:fs'/, 'io.mjs is the fs module');
});
