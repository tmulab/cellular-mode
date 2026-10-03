// Tests for the injected context block — AD13b of tools/adaptive/ACCEPTANCE.md.
//
// The block is what an agent actually receives, so three properties are load-bearing.
// MINIMAL: the boundaries plus the ACTIVE mode's policy, and not one line of the other three
// — injecting a policy that is not in force is both a lie and a cost paid on every prompt.
// CAPPED: a hard byte budget, asserted per mode, because this text competes with the work.
// HONEST: `ready`, `none` and `disabled` inject NOTHING, and a missing policy file is an
// error rather than an empty block that still claims a mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOUNDARIES_POLICY, MODES } from './modes.mjs';
import { MAX_BLOCK_BYTES, compactPolicy, contextBlock, policyPathsFor } from './context.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** @type {Record<string, string>} */
const TEXTS = {};
for (const rel of [BOUNDARIES_POLICY, ...MODES.map((m) => m.policyFile)]) {
  TEXTS[rel] = readFileSync(join(ROOT, rel), 'utf8');
}
/** A line only this mode's policy has, used to prove no other policy leaked in. */
const FINGERPRINT = {
  ready: 'the project\'s default level of detail',
  tired: 'one at a time; ask, wait, then move on',
  focus: 'go to the parking lot in one line',
  explore: 'Hypotheses are welcome, stated as hypotheses',
};
/** @type {(over?: Partial<import('./types.mjs').EffectiveMode>) => import('./types.mjs').EffectiveMode} */
const effective = (over = {}) => ({
  enabled: true,
  mode: 'tired',
  standing: 'active',
  declaredBy: 'user',
  source: 'cli',
  activatedAt: '2026-10-03T14:02:00.000Z',
  expiresAt: '2026-10-03T18:02:00.000Z',
  notice: null,
  ...over,
});

test('context · the fingerprints really are distinctive (the test is not vacuous)', () => {
  for (const [mode, line] of Object.entries(FINGERPRINT)) {
    const owner = MODES.filter((m) => (TEXTS[m.policyFile] ?? '').includes(line)).map((m) => m.id);
    assert.deepEqual(owner, [mode], `"${line}" must belong to ${mode} alone`);
  }
});

test('context · an active mode gets the boundaries and ITS policy, and no other', () => {
  for (const mode of MODES.filter((m) => m.temporary)) {
    const block = contextBlock(effective({ mode: mode.id }), TEXTS);
    assert.match(block, /^# Cellular Adaptive/, 'one header line, first');
    assert.match(block, new RegExp(mode.id), 'the header names the mode');
    assert.ok(block.includes('Declaring a mode is not an authorization'), `${mode.id}: boundaries missing`);
    assert.ok(block.includes(FINGERPRINT[mode.id]), `${mode.id}: its own policy is missing`);
    for (const other of MODES) {
      if (other.id === mode.id) continue;
      assert.equal(block.includes(FINGERPRINT[other.id]), false,
        `${mode.id} block must not carry the ${other.id} policy`);
    }
  }
});

test('context · the header states the mode, when it was declared, until when, and the source', () => {
  const block = contextBlock(effective(), TEXTS);
  const header = block.split('\n')[0] ?? '';
  assert.equal(header, '# Cellular Adaptive · tired · declared 2026-10-03 14:02 · until 18:02 · source cli');
  const crossing = contextBlock(effective({ expiresAt: '2026-10-04T02:02:00.000Z' }), TEXTS);
  assert.match(crossing.split('\n')[0] ?? '', /until 2026-10-04 02:02/,
    'a window that crosses midnight shows the whole date, never a misleading time');
});

test('context · ready, none and disabled inject NOTHING', () => {
  const empty = [
    effective({ mode: 'ready', standing: 'none', declaredBy: null, source: null, activatedAt: null, expiresAt: null }),
    effective({ mode: 'ready', standing: 'disabled', enabled: false, declaredBy: null, source: null }),
    effective({ mode: 'ready', standing: 'active' }),
    effective({ enabled: false }),
  ];
  for (const state of empty) {
    assert.equal(contextBlock(state, TEXTS), '', `${state.standing}/${state.mode} must inject nothing`);
  }
});

test('context · expired and invalid inject the notice and nothing else', () => {
  const notice = 'your earlier declaration (tired, 2026-10-03 14:02) expired — back to ready';
  for (const standing of /** @type {Array<'expired' | 'invalid'>} */ (['expired', 'invalid'])) {
    const block = contextBlock(effective({ mode: 'ready', standing, notice }), TEXTS);
    assert.equal(block, notice, `${standing} must be exactly the one line`);
    assert.equal(block.includes('\n'), false);
  }
  assert.equal(contextBlock(effective({ mode: 'ready', standing: 'expired', notice: null }), TEXTS), '',
    'no notice, nothing to inject');
});

test('context · every real block fits the byte budget', () => {
  assert.equal(MAX_BLOCK_BYTES, 2048);
  for (const mode of MODES.filter((m) => m.temporary)) {
    const bytes = Buffer.byteLength(contextBlock(effective({ mode: mode.id }), TEXTS), 'utf8');
    assert.ok(bytes <= MAX_BLOCK_BYTES, `${mode.id}: ${bytes} bytes > ${MAX_BLOCK_BYTES}`);
    assert.ok(bytes > 400, `${mode.id}: ${bytes} bytes is too small to be the real policy`);
  }
});

test('context · a block over the budget is refused, never silently truncated', () => {
  const texts = { ...TEXTS, [BOUNDARIES_POLICY]: `# b\n${'x'.repeat(3000)}\n` };
  assert.throws(() => contextBlock(effective(), texts), /2048/);
  assert.throws(() => contextBlock(effective(), texts), /bytes/);
});

test('context · a missing or empty policy text is an error, never an empty block', () => {
  for (const missing of [BOUNDARIES_POLICY, 'adaptive/policies/tired.md']) {
    const texts = { ...TEXTS };
    delete texts[missing];
    assert.throws(() => contextBlock(effective(), texts), new RegExp(missing.replace(/\//g, '\\/')));
    assert.throws(() => contextBlock(effective(), { ...TEXTS, [missing]: '   \n' }), /empty/);
  }
});

test('context · the caller is told exactly which files to read, and no others', () => {
  assert.deepEqual(policyPathsFor(effective()), [BOUNDARIES_POLICY, 'adaptive/policies/tired.md']);
  assert.deepEqual(policyPathsFor(effective({ mode: 'focus' })), [BOUNDARIES_POLICY, 'adaptive/policies/focus.md']);
  for (const state of [effective({ standing: 'none' }), effective({ standing: 'expired' }),
    effective({ standing: 'invalid' }), effective({ standing: 'disabled' }), effective({ mode: 'ready' })]) {
    assert.deepEqual(policyPathsFor(state), [], `${state.standing}/${state.mode} reads no policy file`);
  }
});

test('context · compaction drops the title and the blank lines, and nothing else', () => {
  const text = '# Mode: tired — `/tired`\n\nFirst line.\n\n## Never\n- a\n- b\n\n';
  assert.equal(compactPolicy(text), 'First line.\n## Never\n- a\n- b');
  assert.equal(compactPolicy('no title here\n\nkept\n'), 'no title here\nkept');
  assert.equal(compactPolicy('   \n\n'), '');
  const block = contextBlock(effective(), TEXTS);
  assert.equal(block.includes('\n\n'), false, 'no blank line survives into the injected block');
  assert.equal(block.includes('# Mode: tired'), false, 'the policy title is redundant with the header');
  assert.equal(block.endsWith('\n'), false, 'the caller owns the trailing newline');
});

test('context · the same inputs always produce the same bytes', () => {
  const first = contextBlock(effective(), TEXTS);
  for (let i = 0; i < 3; i += 1) assert.equal(contextBlock(effective(), TEXTS), first);
});
