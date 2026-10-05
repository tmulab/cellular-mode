// Context efficiency, as a measurement rather than an opinion.
//
// The method layer is a POINTER (docs/08-agent-integration.md: "adapters are pointers, never
// copies"), so the test that matters is a NEGATIVE one: three distinctive sentences are read out
// of docs/00-constitution.md and skills/cell/SKILL.md at run time, and none of them may appear
// in a rendered prompt. If somebody ever "helpfully" inlines the constitution to make a prompt
// self-contained, this file fails — which is the only way that regression gets noticed, since
// an inlined copy makes the prompt look better, not worse.
//
// The budget is a WARNING, never a refusal: silently truncating a prompt would drop a
// prohibition, and the honest fix for an oversized prompt is a smaller cell.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entry } from './contract-shape.mjs';
import { appendField } from './fields.mjs';
import { exportable } from './fixtures/index.mjs';
import { PROMPT_BUDGET_BYTES, renderPrompt } from './prompt.mjs';

/** The method layer is two pointers and four rules. Anything above this is a copy of something.
 */
export const METHOD_BUDGET_BYTES = 1200;

/** @type {(relative: string, count: number) => string[]} the longest distinctive sentences */
function distinctiveSentences(relative, count = 3) {
  const text = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const sentences = text
    .split(/(?<=[.!?])\s+|\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 70 && !line.startsWith('#'));
  assert.ok(sentences.length >= count, `${relative}: too few long sentences to sample`);
  return [...sentences].sort((a, b) => b.length - a.length).slice(0, count);
}

test('prompt size · the measured size of each fixture, in both adapters', (t) => {
  for (const id of ['simple-new', 'complex-undecided']) {
    const { contract, cell } = exportable(id);
    for (const adapter of ['neutral', 'claude-code']) {
      const { bytes, layers, warnings } = renderPrompt(contract, cell, adapter);
      t.diagnostic(`${id} / ${adapter}: ${bytes} bytes total — method ${layers.method}, `
        + `project ${layers.project}, cell ${layers.cell}`);
      assert.ok(bytes <= PROMPT_BUDGET_BYTES, `${id}/${adapter}: ${bytes} bytes is over budget`);
      assert.ok(layers.method < METHOD_BUDGET_BYTES, `${id}/${adapter}: method layer ${layers.method} bytes`);
      assert.deepEqual(warnings, [], `${id}/${adapter}: unexpected warnings`);
    }
  }
});

test('prompt size · no prompt inlines the constitution or a skill', () => {
  const samples = [
    ...distinctiveSentences('../../docs/00-constitution.md', 3),
    ...distinctiveSentences('../../skills/cell/SKILL.md', 3),
  ];
  for (const id of ['simple-new', 'complex-undecided']) {
    const { contract, cell } = exportable(id);
    for (const adapter of ['neutral', 'claude-code']) {
      const { text } = renderPrompt(contract, cell, adapter);
      for (const sentence of samples) {
        assert.ok(!text.includes(sentence), `${id}/${adapter}: inlined "${sentence.slice(0, 60)}…"`);
      }
    }
  }
});

test('prompt size · the method layer points at the canonical files by relative path', () => {
  const { contract, cell } = exportable('simple-new');
  const { text } = renderPrompt(contract, cell, 'neutral');
  for (const path of ['AGENTS.md', 'skills/cell/SKILL.md', 'skills/pause/SKILL.md']) {
    assert.ok(text.includes(path), `the method layer does not point at ${path}`);
  }
});

test('prompt size · going over the budget warns and still renders everything', () => {
  let { contract, cell } = exportable('simple-new');
  for (let i = 0; i < 24; i += 1) {
    contract = appendField(contract, 'requirements.functional', [
      entry(`requirement ${i}: ${'the same sentence repeated for weight, '.repeat(4)}`, 'DECLARED'),
    ]);
  }
  const { text, bytes, warnings } = renderPrompt(contract, cell, 'neutral');
  assert.ok(bytes > PROMPT_BUDGET_BYTES, `the oversized fixture is only ${bytes} bytes`);
  assert.match(warnings.join(' | '), /over the 6000-byte budget/);
  assert.ok(text.includes('## Prohibited operations\n'), 'a warning must never truncate the rules');
});
