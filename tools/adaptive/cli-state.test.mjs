// Tests for what the adaptive CLI leaves on disk — AD12, AD13 and AD16 of
// tools/adaptive/ACCEPTANCE.md. The usage and exit-code half is in `cli.test.mjs`; this file
// split off it when the suite reached the 200-line rule.
//
// The subject here is retention: what survives a command, what does not, and what the human
// is told. Three properties are load-bearing. `ready` stores NOTHING. A file the module
// cannot read is reported and left alone. And the vault is never touched — every test hashes
// it before and after.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { validatePreferences, validateSession } from './schema.mjs';
import { adaptivePaths } from './io.mjs';
import { LATER, makeRoot, run, storedSession, vaultHash } from './cli-fixture.mjs';

test('cli · declaring ready or resetting DELETES the state, storing nothing', () => {
  const root = makeRoot();
  for (const args of [['set', 'ready'], ['set', '/modoestoubem'], ['reset']]) {
    run(root, ['set', 'tired']);
    assert.equal(existsSync(adaptivePaths(root).session), true);
    const result = run(root, args);
    assert.equal(result.code, 0, args.join(' '));
    assert.match(result.out, /nothing stored/);
    assert.equal(existsSync(adaptivePaths(root).session), false, `${args.join(' ')} must delete the file`);
  }
  assert.match(run(root, ['reset']).out, /nothing stored/, 'resetting twice is not an error');
  rmSync(root, { recursive: true, force: true });
});

test('cli · an expired declaration is reported once and is not honoured', () => {
  const root = makeRoot();
  run(root, ['set', 'tired']);
  const result = run(root, ['status'], LATER);
  assert.equal(result.code, 0, 'an expiry is normal, not a failure');
  assert.match(result.out, /expired/);
  assert.match(result.out, /back to ready/);
  assert.match(result.out, /^standing: expired$/m);
  assert.match(result.out, /^mode: ready/m);
  assert.equal(existsSync(adaptivePaths(root).session), true, 'expiry does not delete the record');
  rmSync(root, { recursive: true, force: true });
});

test('cli · a malformed state file is exit 2, reported, and left exactly as it was', () => {
  const root = makeRoot();
  const paths = adaptivePaths(root);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.session, '{ broken', 'utf8');
  const result = run(root, ['status']);
  assert.equal(result.code, 2);
  assert.match(result.out, /session\.json/);
  assert.match(result.out, /^standing: invalid$/m);
  assert.match(result.out, /^mode: ready/m);
  assert.equal(readFileSync(paths.session, 'utf8'), '{ broken', 'never repaired, never deleted');
  assert.equal(run(root, ['set', 'tired']).code, 0, 'declaring again replaces the broken file');
  assert.equal(validateSession(storedSession(root)).ok, true);
  rmSync(root, { recursive: true, force: true });
});

test('cli · a schema-wrong declaration is invalid too, not silently ignored', () => {
  const root = makeRoot();
  const paths = adaptivePaths(root);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.session, JSON.stringify({ schema: 1, mode: 'ready' }), 'utf8');
  const result = run(root, ['status']);
  assert.equal(result.code, 2);
  assert.match(result.out, /^standing: invalid$/m);
  assert.match(result.out, /back to ready/);
  rmSync(root, { recursive: true, force: true });
});

test('cli · an unusable preference file stops a declaration instead of overwriting it', () => {
  const root = makeRoot();
  const paths = adaptivePaths(root);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.preferences, JSON.stringify({ schema: 1, mode: 'tired' }), 'utf8');
  const result = run(root, ['set', 'focus']);
  assert.equal(result.code, 2);
  assert.match(result.err, /preferences\.json/);
  assert.equal(existsSync(paths.session), false, 'nothing was declared');
  assert.match(readFileSync(paths.preferences, 'utf8'), /"mode"/, 'the human\'s file is left alone');
  assert.equal(run(root, ['status']).code, 2);
  rmSync(root, { recursive: true, force: true });
});

test('cli · disable makes it inert, enable brings the stored declaration back', () => {
  const root = makeRoot();
  run(root, ['set', 'tired']);
  const stored = readFileSync(adaptivePaths(root).session, 'utf8');
  assert.equal(run(root, ['disable']).code, 0);
  const off = run(root, ['status']);
  assert.match(off.out, /^standing: disabled$/m);
  assert.match(off.out, /^mode: ready/m);
  assert.equal(off.out.includes('policy:'), false, 'nothing is injected while disabled');
  assert.equal(readFileSync(adaptivePaths(root).session, 'utf8'), stored, 'the declaration is kept, not honoured');
  assert.equal(run(root, ['enable']).code, 0);
  assert.match(run(root, ['status']).out, /^standing: active$/m);
  rmSync(root, { recursive: true, force: true });
});

test('cli · the TTL in preferences is what a new declaration gets', () => {
  const root = makeRoot();
  const paths = adaptivePaths(root);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.preferences, JSON.stringify({ schema: 1, ttlHours: 0.5 }), 'utf8');
  assert.equal(run(root, ['set', 'focus']).code, 0);
  const stored = /** @type {{ activatedAt: string, expiresAt: string }} */ (storedSession(root));
  assert.equal((Date.parse(stored.expiresAt) - Date.parse(stored.activatedAt)) / 3_600_000, 0.5);
  rmSync(root, { recursive: true, force: true });
});

test('cli · no command can make preferences carry a mode or a condition', () => {
  const root = makeRoot();
  for (const args of [['set', 'tired'], ['disable'], ['enable'], ['set', 'explorar'], ['reset']]) run(root, args);
  const written = JSON.parse(readFileSync(adaptivePaths(root).preferences, 'utf8'));
  assert.deepEqual(Object.keys(written).sort(), ['enabled', 'schema', 'ttlHours']);
  assert.equal(validatePreferences(written).ok, true);
  rmSync(root, { recursive: true, force: true });
});

test('cli · clear removes both files and names what it deleted', () => {
  const root = makeRoot();
  const before = vaultHash(root);
  run(root, ['set', 'tired']);
  run(root, ['disable']);
  const result = run(root, ['clear']);
  assert.equal(result.code, 0);
  assert.match(result.out, /session\.json/);
  assert.match(result.out, /preferences\.json/);
  assert.deepEqual(readdirSync(adaptivePaths(root).dir), []);
  assert.match(run(root, ['clear']).out, /nothing to delete/);
  assert.equal(vaultHash(root), before, 'clearing adaptive state never touches the vault');
  rmSync(root, { recursive: true, force: true });
});

test('cli · the vault is byte-identical after every command in the module', () => {
  const root = makeRoot();
  const before = vaultHash(root);
  for (const args of [['status'], ['set', 'tired'], ['status'], ['disable'], ['status'],
    ['enable'], ['set', '/modofoco'], ['reset'], ['clear'], ['set', 'nope'], ['help']]) {
    run(root, args);
    assert.equal(vaultHash(root), before, `after \`${args.join(' ')}\``);
  }
  assert.deepEqual(readdirSync(root).sort(), ['.cellular', 'vault'], 'and nothing else is created');
  rmSync(root, { recursive: true, force: true });
});
