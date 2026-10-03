// Tests for `cli.mjs context` — the command an agent runs to receive the active block.
// AD13b of tools/adaptive/ACCEPTANCE.md.
//
// `context` reads the policy texts from the PROJECT, not from this module, so an adopting
// project can edit its own. Every test here therefore copies the policies into a throwaway
// root — and one test deliberately does not, because a missing policy file must be a loud
// error and never an empty block that still claims a mode is in force.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BLOCK_BYTES } from './context.mjs';
import { LATER, copyPolicies, makeRoot, run, vaultHash } from './cli-fixture.mjs';

const README = readFileSync(fileURLToPath(new URL('./README.md', import.meta.url)), 'utf8');
/** The sizes recorded in README.md, so the documented measurement cannot drift from the code. */
function recordedBytes() {
  /** @type {Record<string, number>} */
  const found = {};
  for (const line of README.split('\n')) {
    const row = /^\|\s*`(tired|focus|explore)`\s*\|\s*(\d+)\s*\|/.exec(line);
    if (row?.[1] !== undefined && row[2] !== undefined) found[row[1]] = Number(row[2]);
  }
  return found;
}

test('context · an active mode prints the boundaries and its own policy, within budget', () => {
  const root = makeRoot();
  copyPolicies(root);
  const before = vaultHash(root);
  run(root, ['set', 'tired']);
  const result = run(root, ['context']);
  assert.equal(result.code, 0);
  assert.match(result.out, /^# Cellular Adaptive · tired · declared 2026-10-03 14:02 · until 18:02 · source cli$/m);
  assert.ok(result.out.includes('Declaring a mode is not an authorization'), 'boundaries missing');
  assert.ok(result.out.includes('one at a time; ask, wait, then move on'), 'the tired policy is missing');
  assert.equal(result.out.includes('Hypotheses are welcome'), false, 'no other policy may leak in');
  assert.equal(result.out.includes('# Mode: tired'), false, 'the policy title is redundant');
  assert.ok(Buffer.byteLength(result.out, 'utf8') <= MAX_BLOCK_BYTES + 1, 'block plus one newline');
  assert.equal(vaultHash(root), before, 'context writes nothing at all');
  rmSync(root, { recursive: true, force: true });
});

test('context · the default, a disabled module and a clean checkout print NOTHING', () => {
  const root = makeRoot();
  copyPolicies(root);
  /** @type {(label: string) => void} */
  const expectEmpty = (label) => {
    const result = run(root, ['context']);
    assert.equal(result.code, 0, label);
    assert.equal(result.out, '', `${label}: the block must be empty`);
  };
  expectEmpty('a clean checkout');
  run(root, ['set', 'ready']);
  expectEmpty('after declaring ready');
  run(root, ['set', 'tired']);
  run(root, ['disable']);
  expectEmpty('while disabled, even with a valid declaration stored');
  rmSync(root, { recursive: true, force: true });
});

test('context · an expired declaration prints only its one-line notice', () => {
  const root = makeRoot();
  copyPolicies(root);
  run(root, ['set', 'tired']);
  const result = run(root, ['context'], LATER);
  assert.equal(result.code, 0);
  assert.equal(result.out, 'your earlier declaration (tired, 2026-10-03 14:02) expired — back to ready\n');
  assert.equal(result.out.includes('Declaring a mode is not an authorization'), false, 'no policy is injected');
  rmSync(root, { recursive: true, force: true });
});

test('context · a missing policy file is exit 2 with the path named, never an empty block', () => {
  const root = makeRoot();
  run(root, ['set', 'focus']);
  const result = run(root, ['context']);
  assert.equal(result.code, 2);
  assert.equal(result.out, '', 'nothing is printed as if it were the block');
  assert.match(result.err, /adaptive\/policies\/boundaries\.md/);
  assert.match(result.err, /adaptive\/policies\/focus\.md/);
  copyPolicies(root);
  rmSync(join(root, 'adaptive', 'policies', 'focus.md'));
  const partial = run(root, ['context']);
  assert.equal(partial.code, 2, 'one missing file out of two is still a refusal');
  assert.match(partial.err, /focus\.md/);
  assert.equal(partial.out, '');
  rmSync(root, { recursive: true, force: true });
});

test('context · the byte sizes recorded in README.md are the ones the code produces', () => {
  const root = makeRoot();
  copyPolicies(root);
  const recorded = recordedBytes();
  assert.deepEqual(Object.keys(recorded).sort(), ['explore', 'focus', 'tired'],
    'README.md must record a measured size for each temporary mode');
  for (const [mode, bytes] of Object.entries(recorded)) {
    run(root, ['set', mode]);
    const measured = Buffer.byteLength(run(root, ['context']).out.replace(/\n$/, ''), 'utf8');
    assert.equal(measured, bytes, `README.md records ${bytes} bytes for ${mode}, the code produces ${measured}`);
    assert.ok(measured <= MAX_BLOCK_BYTES, `${mode}: ${measured} > ${MAX_BLOCK_BYTES}`);
  }
  rmSync(root, { recursive: true, force: true });
});
