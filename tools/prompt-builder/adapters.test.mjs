// The adapter registry: what it claims, what it refuses, and the one thing none of it may
// ever mention.
//
// NO MODEL FAMILY, NO CONTEXT SIZE. A contract is adapter-independent, and a prompt that names
// a model family or assumes a window expires the moment either changes — so the deny-list below
// is scanned over every implemented adapter's OUTPUT and over the source of the three modules
// that produce it. The list names model FAMILIES, never tools: `CLAUDE.md`, `.claude/skills/`,
// "Codex CLI" and "Gemini CLI" are a file, a directory and two tool names, and a deny-list that
// confused the two would forbid the pointers this project is built on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADAPTERS, CLAUDE_CODE_POINTER, NEUTRAL_POINTER, adapterFor, listAdapters } from './adapters.mjs';
import { codeOf } from './errors.mjs';
import { exportable } from './fixtures/index.mjs';
import { renderPrompt } from './prompt.mjs';

/** Model families and window sizes. Assembled from fragments so this file is not itself a
 * place where a model name is written down. @type {ReadonlyArray<RegExp>} */
const DENIED = Object.freeze([
  ...['op' + 'us', 'son' + 'net', 'hai' + 'ku', 'g' + 'pt', 'lla' + 'ma', 'mist' + 'ral',
    'qw' + 'en', 'deep' + 'seek', 'gr' + 'ok', 'gemini-pro', 'claude-3']
    .map((name) => new RegExp(`\\b${name}\\b`, 'i')),
  /\bcontext window\b/i,
  /\b\d{2,4}\s?k (?:token|context)/i,
  /\b1\s?m\b.{0,12}token/i,
]);

/** @type {(label: string, text: string) => void} */
function assertNoModelNames(label, text) {
  for (const pattern of DENIED) {
    assert.ok(!pattern.test(text), `${label}: mentions ${pattern} — a prompt must not name one`);
  }
}

test('adapters · the registry says what it supports and what it only proposes', () => {
  const listed = listAdapters();
  assert.deepEqual(listed.map((a) => a.id), ['neutral', 'claude-code', 'cursor', 'codex-cli', 'gemini-cli']);
  assert.deepEqual(
    listed.filter((a) => a.support === 'implemented').map((a) => a.id),
    ['neutral', 'claude-code'],
  );
  for (const { support, label } of listed) {
    assert.ok(['implemented', 'proposed'].includes(support), `${label}: unknown support level`);
  }
  assert.equal(Object.isFrozen(ADAPTERS), true, 'a registry a caller can push onto is not a registry');
});

test('adapters · a proposed adapter refuses to render instead of pretending', () => {
  for (const id of ['cursor', 'codex-cli', 'gemini-cli']) {
    const { contract, cell } = exportable('simple-new');
    assert.throws(() => renderPrompt(contract, cell, id), (error) => {
      assert.equal(codeOf(error), 'ADAPTER_NOT_IMPLEMENTED', `${id}: wrong code`);
      assert.match(String(error), /neutral adapter/);
      return true;
    });
  }
});

test('adapters · an unknown id is refused, never silently neutral', () => {
  const { contract, cell } = exportable('simple-new');
  assert.throws(() => renderPrompt(contract, cell, 'some-other-tool'), (error) => {
    assert.equal(codeOf(error), 'UNKNOWN_ADAPTER');
    return true;
  });
  assert.throws(() => adapterFor(undefined), (error) => codeOf(error) === 'UNKNOWN_ADAPTER');
});

test('adapters · adapters are optional: neutral works with the rest of the registry removed', () => {
  const { contract, cell } = exportable('simple-new');
  const only = ADAPTERS.filter((a) => a.id === 'neutral');
  const reduced = renderPrompt(contract, cell, 'neutral', { adapters: only });
  assert.equal(reduced.text, renderPrompt(contract, cell, 'neutral').text);
  assert.deepEqual(listAdapters(only).map((a) => a.id), ['neutral']);
  assert.throws(
    () => renderPrompt(contract, cell, 'claude-code', { adapters: only }),
    (error) => codeOf(error) === 'UNKNOWN_ADAPTER',
  );
});

test('adapters · the same contract renders through both, differing only in the method pointer', () => {
  const { contract, cell } = exportable('simple-new');
  const neutral = renderPrompt(contract, cell, 'neutral');
  const claude = renderPrompt(contract, cell, 'claude-code');
  assert.equal(neutral.layers.project, claude.layers.project, 'the project layer is adapter-independent');
  assert.equal(neutral.layers.cell, claude.layers.cell, 'the cell layer is adapter-independent');
  assert.notEqual(neutral.layers.method, claude.layers.method);
  assert.ok(claude.layers.method < neutral.layers.method, 'the pointer-to-skills method is shorter');
  for (const line of NEUTRAL_POINTER) assert.ok(neutral.text.includes(line));
  for (const line of CLAUDE_CODE_POINTER) assert.ok(claude.text.includes(line));
  assert.match(claude.text, /`\/cell` to open or resume/);
  assert.match(claude.text, /\.claude\/skills\//);
  assert.match(neutral.text, /Read `AGENTS\.md` at the repository root FIRST/);
});

test('adapters · no output and no adapter source names a model family or a window size', () => {
  for (const id of ['simple-new', 'complex-undecided']) {
    const { contract, cell } = exportable(id);
    for (const adapter of ['neutral', 'claude-code']) {
      assertNoModelNames(`${id}/${adapter}`, renderPrompt(contract, cell, adapter).text);
    }
    const draft = exportable(id, { approved: false });
    assertNoModelNames(`${id}/draft`, renderPrompt(draft.contract, draft.cell, 'neutral', { draft: true }).text);
  }
  for (const file of ['adapters.mjs', 'prompt-rules.mjs', 'prompt-layers.mjs', 'prompt.mjs']) {
    assertNoModelNames(file, readFileSync(new URL(file, import.meta.url), 'utf8'));
  }
});
