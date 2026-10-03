// Tests for the Claude Code hooks — AD19, AD20, AD21 and AD25 of ACCEPTANCE-INTEGRATION.md.
//
// The second test in this file is the most important one in the module. A hook sees every
// prompt the human types, which makes it the one place where "detecting" a mode would be easy,
// cheap and invisible. So the rule is mechanical and narrow: a mode is set ONLY when the
// trimmed prompt is exactly one of the twelve slash commands. "I'm tired", "estou cansado",
// "foco total" and even "/tired please" change nothing at all.
//
// The other property is that a hook never blocks a prompt. Every path exits 0 — malformed
// JSON, no payload, an unknown event, a missing policy file — and anything wrong is one line on
// stderr. Two spawned processes cover the real stdin path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { adaptivePaths } from './io.mjs';
import { READY_NOTICE, modeCommandOf } from './hook.mjs';
import { main } from './main.mjs';
import { CLI, LATER, NOW, copyPolicies, makeRoot, run, vaultHash } from './cli-fixture.mjs';

/** @type {(root: string, event: string, payload: unknown, now?: string) => { code: number, out: string, err: string }} */
function hook(root, event, payload, now = NOW) {
  let out = '';
  let err = '';
  const code = main(['node', 'cli.mjs', 'hook', event, '--root', root], {
    stdout: { write: (t) => { out += t; return true; } },
    stderr: { write: (t) => { err += t; return true; } },
    env: { ADAPTIVE_NOW: now },
    stdin: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
  return { code, out, err };
}
/** @type {(prompt: string, id?: string) => Record<string, unknown>} */
const prompt = (text, id = 's-1') => ({ session_id: id, cwd: '/x', prompt: text });

test('hook · a slash command declares a mode; nothing else is even a candidate', () => {
  for (const token of ['/tired', '/cansado', '/modocansado', '/TIRED', '  /tired  ']) {
    assert.equal(modeCommandOf(token), 'tired', `${JSON.stringify(token)} is a command`);
  }
  assert.equal(modeCommandOf('/focus'), 'focus');
  assert.equal(modeCommandOf('/modoexplorar'), 'explore');
  assert.equal(modeCommandOf('/ready'), 'ready');
});

test('hook · NATURAL LANGUAGE NEVER SETS A MODE — no inference, anywhere', () => {
  const never = [
    'I am tired', "I'm tired", 'estou cansado', 'estou muito cansado hoje', 'cansei',
    'foco total', 'vamos focar', 'tired', 'cansado', 'focus', 'explore', 'ready',
    '/tired please', 'please use /focus', 'run /tired for me', 'set me to /tired',
    'the /tired mode would help', '//tired', '/tiredness', '/tire', '/modo', '/pause',
    'I feel exhausted, can you go slower?', '', '   ', 'help', undefined, null, 42, {},
  ];
  for (const text of never) assert.equal(modeCommandOf(text), null, `${JSON.stringify(text)}`);
  // And end to end: the state must still be untouched after all of them.
  const root = makeRoot();
  copyPolicies(root);
  for (const text of never) {
    const result = hook(root, 'UserPromptSubmit', prompt(String(text)));
    assert.equal(result.code, 0, `${JSON.stringify(text)} must not block the prompt`);
    assert.equal(existsSync(adaptivePaths(root).session), false,
      `${JSON.stringify(text)} must not create a declaration`);
  }
  rmSync(root, { recursive: true, force: true });
});

test('hook · an exact command sets the mode with source claude-hook and prints the block', () => {
  const root = makeRoot();
  copyPolicies(root);
  const before = vaultHash(root);
  const result = hook(root, 'UserPromptSubmit', prompt('/modocansado'));
  assert.equal(result.code, 0);
  assert.equal(result.err, '');
  assert.match(result.out, /^# Cellular Adaptive · tired · .* · source claude-hook$/m);
  assert.ok(result.out.includes('Declaring a mode is not an authorization'));
  const stored = JSON.parse(readFileSync(adaptivePaths(root).session, 'utf8'));
  assert.equal(stored.source, 'claude-hook');
  assert.equal(stored.command, '/modocansado', 'the command is recorded exactly as typed');
  assert.equal(stored.declaredBy, 'user');
  assert.equal(vaultHash(root), before, 'a hook never touches the vault');
  rmSync(root, { recursive: true, force: true });
});

test('hook · declaring ready through a hook deletes the state and prints nothing', () => {
  const root = makeRoot();
  copyPolicies(root);
  hook(root, 'UserPromptSubmit', prompt('/tired'));
  const result = hook(root, 'UserPromptSubmit', prompt('/modoestoubem'));
  assert.equal(result.code, 0);
  // The default needs no policy block; since AD32 (validation of 2026-10-03, deviation 1) an
  // explicit return to it is acknowledged in exactly one line, so the model learns of it.
  assert.equal(result.out.trim(), READY_NOTICE, 'one line, no policy text');
  assert.equal(existsSync(adaptivePaths(root).session), false);
  rmSync(root, { recursive: true, force: true });
});

test('hook · the block is injected once per session: unchanged costs ZERO bytes', () => {
  const root = makeRoot();
  copyPolicies(root);
  const first = hook(root, 'UserPromptSubmit', prompt('/tired'));
  assert.ok(first.out.length > 400, 'the declaration itself prints the block');
  const second = hook(root, 'UserPromptSubmit', prompt('what is next?'));
  assert.equal(second.out, '', 'an unchanged mode costs exactly 0 bytes on the next turn');
  assert.equal(hook(root, 'UserPromptSubmit', prompt('and then?')).out, '');
  const other = hook(root, 'UserPromptSubmit', prompt('what is next?', 's-2'));
  assert.equal(other.out, first.out, 'a NEW session gets the block again');
  const changed = hook(root, 'UserPromptSubmit', prompt('/modofoco', 's-2'));
  assert.match(changed.out, /· focus ·/, 'a changed mode is injected again');
  assert.equal(hook(root, 'UserPromptSubmit', prompt('carry on', 's-2')).out, '');
  rmSync(root, { recursive: true, force: true });
});

test('hook · an expiry notice is printed exactly once', () => {
  const root = makeRoot();
  copyPolicies(root);
  hook(root, 'UserPromptSubmit', prompt('/tired'));
  const first = hook(root, 'UserPromptSubmit', prompt('still here?'), LATER);
  assert.equal(first.out, 'your earlier declaration (tired, 2026-10-03 14:02) expired — back to ready\n');
  assert.equal(hook(root, 'UserPromptSubmit', prompt('and now?'), LATER).out, '', 'never twice');
  rmSync(root, { recursive: true, force: true });
});

test('hook · SessionStart prints the active block on every source, and nothing by default', () => {
  const root = makeRoot();
  copyPolicies(root);
  for (const source of ['startup', 'resume', 'clear', 'compact']) {
    const empty = hook(root, 'SessionStart', { session_id: 's-1', source, cwd: '/x' });
    assert.equal(empty.code, 0);
    assert.equal(empty.out, '', `${source}: no declaration, no block`);
  }
  run(root, ['set', 'explorar']);
  for (const source of ['startup', 'compact']) {
    const result = hook(root, 'SessionStart', { session_id: 's-1', source, cwd: '/x' });
    assert.match(result.out, /· explore ·/, `${source}: the active block is restated`);
  }
  rmSync(root, { recursive: true, force: true });
});

test('hook · nothing blocks a prompt: every broken input is exit 0 and one stderr line', () => {
  const root = makeRoot();
  copyPolicies(root);
  const broken = [
    ['UserPromptSubmit', 'not json at all'],
    ['UserPromptSubmit', '[1,2,3]'],
    ['UserPromptSubmit', '"a string"'],
    ['SessionStart', '{ "session_id": '],
    ['Whatever', JSON.stringify(prompt('/tired'))],
  ];
  for (const [event, payload] of broken) {
    const result = hook(root, String(event), String(payload));
    assert.equal(result.code, 0, `${event} / ${payload}`);
    assert.equal(result.err.trim().split('\n').length, 1, 'exactly one line of explanation');
    assert.match(result.err, /^adaptive: /);
  }
  assert.equal(hook(root, 'SessionStart', '').code, 0, 'no payload at all is not an error');
  assert.equal(hook(root, 'SessionStart', '').err, '', 'and it is not worth a line either');
  rmSync(root, { recursive: true, force: true });
});

test('hook · a missing policy file is reported and still exits 0', () => {
  const root = makeRoot();
  const result = hook(root, 'UserPromptSubmit', prompt('/tired'));
  assert.equal(result.code, 0);
  assert.equal(result.out, '', 'never a header with no policy behind it');
  assert.match(result.err, /adaptive: .*boundaries\.md/);
  assert.equal(existsSync(adaptivePaths(root).session), true, 'the declaration was still recorded');
  rmSync(root, { recursive: true, force: true });
});

test('hook · it works as a real process reading real stdin', () => {
  const root = makeRoot();
  copyPolicies(root);
  const env = { ...process.env, ADAPTIVE_NOW: NOW };
  const out = execFileSync(process.execPath, [CLI, 'hook', 'UserPromptSubmit', '--root', root], {
    input: JSON.stringify(prompt('/modofoco')), encoding: 'utf8', env,
  });
  assert.match(out, /· focus ·/);
  const again = execFileSync(process.execPath, [CLI, 'hook', 'UserPromptSubmit', '--root', root], {
    input: JSON.stringify(prompt('anything else')), encoding: 'utf8', env,
  });
  assert.equal(again, '', 'the second turn of the same session costs nothing');
  rmSync(root, { recursive: true, force: true });
});
