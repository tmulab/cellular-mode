// Tests for the adaptive CLI: usage, exit codes and declaring a mode — AD14 and AD15 of
// tools/adaptive/ACCEPTANCE.md. Persistence and standing are in `cli-state.test.mjs`; the
// shared temporary-root helpers are in `cli-fixture.mjs`.
//
// Run in-process through `main(argv, io)`, which returns the exit code instead of calling
// `process.exit`, plus one spawn to prove the entry point really runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { validateSession } from './schema.mjs';
import { adaptivePaths } from './io.mjs';
import { USAGE, main, parse } from './main.mjs';
import { CLI, NOW, UNTIL, makeRoot, run, storedSession, vaultHash } from './cli-fixture.mjs';

/** A stream that discards: these assertions are about exit codes and files, not output. */
const sink = () => ({ write: () => true });

test('cli · help exits 0 and documents the commands, the aliases and the exit codes', () => {
  const root = makeRoot();
  const result = run(root, ['help']);
  assert.equal(result.code, 0);
  for (const token of ['status', 'set', 'reset', 'enable', 'disable', 'clear', 'context',
    'hook', 'SessionStart', 'UserPromptSubmit', '--source', 'ADAPTIVE_NOW', 'modocansado',
    'modoestoubem', 'modofoco', 'modoexplorar', '0 ok', '1 usage', '2 the state',
    'MSYS_NO_PATHCONV']) {
    assert.match(result.out, new RegExp(token), `usage must mention ${token}`);
  }
  assert.match(USAGE, /opt-in/, 'the usage must say the hooks are opt-in');
  assert.match(USAGE, /boundaries\.md/, 'usage must point at what no mode changes');
  rmSync(root, { recursive: true, force: true });
});

test('cli · --root is global: it works before the command as well as after it', () => {
  const root = makeRoot();
  const both = [
    main(['node', 'cli.mjs', '--root', root, 'set', 'tired'], { env: { ADAPTIVE_NOW: NOW }, stdout: sink(), stderr: sink() }),
    main(['node', 'cli.mjs', 'set', 'cansado', '--root', root], { env: { ADAPTIVE_NOW: NOW }, stdout: sink(), stderr: sink() }),
    main(['node', 'cli.mjs', `--root=${root}`, 'status'], { env: { ADAPTIVE_NOW: NOW }, stdout: sink(), stderr: sink() }),
  ];
  assert.deepEqual(both, [0, 0, 0], 'every position of --root must work');
  assert.equal(/** @type {{ mode: string }} */ (storedSession(root)).mode, 'tired');
  const expected = { root, positional: ['set', 'tired'], help: false, source: 'cli' };
  assert.deepEqual(parse(['--root', root, 'set', 'tired']), expected);
  assert.deepEqual(parse(['set', 'tired', '--root', root]), expected);
  assert.throws(() => parse(['--root']), /--root needs a value/);
  assert.throws(() => parse(['--root', '--help']), /--root needs a value/);
  assert.equal(parse(['--help']).help, true);
  assert.equal(parse(['-h']).help, true);
  rmSync(root, { recursive: true, force: true });
});

test('cli · no command and an unknown command are usage errors on stderr', () => {
  const root = makeRoot();
  assert.equal(run(root, []).code, 1);
  assert.match(run(root, []).err, /Usage/);
  const unknown = run(root, ['sleep']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /unknown command: sleep/);
  assert.equal(run(root, ['status', '--nope']).code, 1, 'an unknown option is a usage error');
  assert.equal(existsSync(adaptivePaths(root).dir), false, 'a usage error writes nothing');
  rmSync(root, { recursive: true, force: true });
});

test('cli · status on a clean checkout is ready, standing none, and writes nothing', () => {
  const root = makeRoot();
  const before = vaultHash(root);
  const result = run(root, ['status']);
  assert.equal(result.code, 0);
  assert.match(result.out, /^mode: ready/m);
  assert.match(result.out, /^standing: none$/m);
  assert.equal(result.out.includes('policy:'), false, 'no policy is injected for the default');
  assert.equal(existsSync(adaptivePaths(root).dir), false, 'status is read-only');
  assert.equal(vaultHash(root), before);
  rmSync(root, { recursive: true, force: true });
});

test('cli · set records the mode, the source and the command exactly as typed', () => {
  const root = makeRoot();
  const before = vaultHash(root);
  const result = run(root, ['set', '/modocansado']);
  assert.equal(result.code, 0);
  assert.match(result.out, /tired/);
  assert.deepEqual(storedSession(root), {
    schema: 1, mode: 'tired', declaredBy: 'user', source: 'cli', command: '/modocansado',
    activatedAt: NOW, expiresAt: UNTIL, scope: 'session',
  });
  assert.equal(validateSession(storedSession(root)).ok, true);
  const status = run(root, ['status']);
  assert.match(status.out, /^mode: tired/m);
  assert.match(status.out, /^standing: active$/m);
  assert.match(status.out, /adaptive\/policies\/tired\.md/);
  assert.match(status.out, /adaptive\/policies\/boundaries\.md/);
  assert.equal(vaultHash(root), before, 'the vault is untouched by set and status');
  rmSync(root, { recursive: true, force: true });
});

test('cli · every Portuguese alias reaches its mode through the CLI', () => {
  const root = makeRoot();
  for (const [alias, mode] of [['cansado', 'tired'], ['/modofoco', 'focus'],
    ['explorar', 'explore'], ['/MODOEXPLORAR', 'explore']]) {
    assert.equal(run(root, ['set', String(alias)]).code, 0, `${alias}`);
    assert.equal(/** @type {{ mode: string }} */ (storedSession(root)).mode, mode);
  }
  rmSync(root, { recursive: true, force: true });
});

test('cli · --source records who declared, and refuses to forge the hook provenance', () => {
  const root = makeRoot();
  assert.equal(run(root, ['set', 'tired', '--source', 'skill']).code, 0);
  assert.equal(/** @type {{ source: string }} */ (storedSession(root)).source, 'skill');
  assert.equal(run(root, ['set', 'foco']).code, 0);
  assert.equal(/** @type {{ source: string }} */ (storedSession(root)).source, 'cli', 'the default');
  for (const bad of ['claude-hook', 'model', 'agent', 'user', '']) {
    const result = run(root, ['set', 'tired', '--source', bad]);
    assert.equal(result.code, 1, `--source ${bad} must be refused`);
    assert.match(result.err, /--source/);
  }
  assert.equal(parse(['--source', 'skill']).source, 'skill');
  rmSync(root, { recursive: true, force: true });
});

test('cli · an unknown mode is exit 1 and prints the whole valid vocabulary', () => {
  const root = makeRoot();
  const result = run(root, ['set', 'exhausted']);
  assert.equal(result.code, 1);
  assert.match(result.err, /exhausted/);
  for (const token of ['tired', 'modocansado', 'ready', 'modoestoubem', 'focus', 'explore']) {
    assert.match(result.err, new RegExp(token), `the valid list must name ${token}`);
  }
  assert.equal(run(root, ['set']).code, 1, 'set with no argument is a usage error');
  assert.equal(existsSync(adaptivePaths(root).dir), false);
  rmSync(root, { recursive: true, force: true });
});

test('cli · a bad ADAPTIVE_NOW is a usage error, never a guess', () => {
  const root = makeRoot();
  const result = run(root, ['set', 'tired'], '2026-10-03 14:02');
  assert.equal(result.code, 1);
  assert.match(result.err, /ADAPTIVE_NOW/);
  assert.equal(existsSync(adaptivePaths(root).dir), false);
  rmSync(root, { recursive: true, force: true });
});

test('cli · the entry point runs as a process and reports its exit code', () => {
  const root = makeRoot();
  const text = execFileSync(process.execPath, [CLI, 'status', '--root', root], { encoding: 'utf8' });
  assert.match(text, /^mode: ready/m);
  assert.throws(() => execFileSync(process.execPath, [CLI, 'set', 'nope', '--root', root], { stdio: 'pipe' }));
  rmSync(root, { recursive: true, force: true });
});
