// Behavioural validation (2026-10-03, tools/adaptive/VALIDATION-RESULTS-2026-10-03.md, deviation 1)
// found a real gap: `ready` has no block, so after `/tired` then `/ready` the hook injected nothing
// and the model kept believing the earlier mode was active. The hook knows the change happened,
// so it must say so - once, in one line - and then fall silent again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { main } from './main.mjs';
import { NOW, copyPolicies, makeRoot } from './cli-fixture.mjs';
import { READY_NOTICE } from './hook.mjs';

/** @type {(root: string, payload: unknown) => string} */
function hook(root, payload) {
  let out = '';
  main(['node', 'cli.mjs', 'hook', 'UserPromptSubmit', '--root', root], {
    stdout: { write: (t) => { out += t; return true; } },
    stderr: { write: () => true },
    env: { ADAPTIVE_NOW: NOW },
    stdin: JSON.stringify(payload),
  });
  return out;
}
/** @type {(text: string, id?: string) => Record<string, unknown>} */
const prompt = (text, id = 's-1') => ({ session_id: id, cwd: '/x', prompt: text });

test('AD32 · tired -> ready announces the return to the default once, then stays silent', () => {
  const root = makeRoot();
  copyPolicies(root);
  try {
    assert.match(hook(root, prompt('/tired')), /Cellular Adaptive · tired/);
    const back = hook(root, prompt('/modoestoubem'));
    assert.equal(back.trim(), READY_NOTICE, 'one line, exactly the notice');
    assert.equal(hook(root, prompt('continue the parser')), '', 'then silent: nothing changed');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('AD32 · an explicit /ready with nothing active confirms once; ordinary prompts stay at 0 bytes', () => {
  const root = makeRoot();
  copyPolicies(root);
  try {
    assert.equal(hook(root, prompt('just continue')), '', 'never given anything: nothing to undo');
    assert.equal(hook(root, prompt('/ready')).trim(), READY_NOTICE, 'the human asked; the hook answers');
    assert.equal(hook(root, prompt('just continue')), '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('AD32 · a mode ended outside the chat (terminal reset) is announced once to the same session', () => {
  const root = makeRoot();
  copyPolicies(root);
  try {
    assert.match(hook(root, prompt('/focus')), /Cellular Adaptive · focus/);
    main(['node', 'cli.mjs', 'reset', '--root', root], {
      stdout: { write: () => true }, stderr: { write: () => true }, env: { ADAPTIVE_NOW: NOW }, stdin: '',
    });
    assert.equal(hook(root, prompt('continue')).trim(), READY_NOTICE, 'no command typed, yet the block ended');
    assert.equal(hook(root, prompt('continue')), '', 'said once');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('AD32 · the notice names no condition and claims no measurement', () => {
  assert.match(READY_NOTICE, /^# Cellular Adaptive · ready/);
  assert.doesNotMatch(READY_NOTICE, /tired|fatigue|cansa|focus|explore/i);
  assert.ok(Buffer.byteLength(READY_NOTICE) < 200);
});
