// Hygiene: the public content of this repository is in English.
//
// Heuristic, not a translator: a line is flagged when it contains >= 3 distinct
// Portuguese stopword hits. Isolated words survive on purpose (the historical name,
// original file names, a single quoted phrase); a sentence does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allFiles, hasExt, read, report } from './helpers.mjs';

const THRESHOLD = 3;

// Distinctly Portuguese tokens — none of them is also an English word.
const STOPWORDS = [
  'não', 'nao', 'você', 'voce', 'célula', 'celular',
  'então', 'entao', 'também', 'tambem', 'está', 'estão',
  'são', 'pelo', 'pela', 'uma', 'isso', 'aqui',
  'vamos', 'quais', 'essa', 'depois', 'hoje', 'parar',
  'fecha', 'conclui', 'anota', 'cansei', 'paramos', 'retomar',
  'volta', 'abrir', 'chega', 'continuo', 'onde', 'tenho',
  'lista as', 'para o', 'para a', 'com a', 'de uma',
];

// Token-level allowlist, stripped from a line BEFORE counting. These are sanctioned
// loanwords in English text, not Portuguese prose:
//   "Modo Celular" — the historical name of the method, cited in NOTICE/README/docs.
//   celula / celulas / pausar — the skill ALIAS identifiers (directory and command
//   names), which must appear verbatim wherever the aliases are documented.
const ALLOWED_TOKENS = [/modo celular/gi, /\bcelulas?\b/gi, /\bpausar\b/gi];

// Path allowlist. Every entry is a file whose JOB is to carry Portuguese
// trigger phrases verbatim, so the heuristic cannot apply:
//   skills/*/SKILL.md ............ canonical procedures; their `description`
//                                  front-matter lists the Portuguese trigger phrases
//                                  an agent must match ("vamos retomar", "vou parar"...).
//   adapters/** and .claude/** ... thin pointers that copy the same trigger phrases
//                                  from the canonical skill description.
//   templates/user-profile.md .... ships the Portuguese trigger phrases as a ready
//                                  example for a Portuguese-speaking adopter.
//   tests/language.test.mjs ...... holds the Portuguese stopword list itself.
//   tests/pause-triggers.test.mjs  asserts that the Portuguese stop phrases are still
//                                  listed by the pause skills.
//   tools/adaptive/VALIDATION-RESULTS-*.md  evidence records: they quote the Portuguese
//                                  test prompts and the model's Portuguese answers
//                                  verbatim; translating them would alter the evidence.
const ALLOWED_PATHS = [
  /^tools\/adaptive\/VALIDATION-RESULTS-\d{4}-\d{2}-\d{2}\.md$/,
  /^skills\//,
  /^adapters\//,
  /^\.claude\//,
  /^templates\/user-profile\.md$/,
  /^tests\/language\.test\.mjs$/,
  /^tests\/pause-triggers\.test\.mjs$/,
];

const scanned = allFiles().filter(
  (rel) => hasExt(rel, '.md', '.mjs', '.mdc') && !ALLOWED_PATHS.some((re) => re.test(rel)),
);

/** @param {string} line @returns {string[]} */
function hits(line) {
  let text = line.toLowerCase();
  for (const re of ALLOWED_TOKENS) text = text.replace(re, ' ');
  const found = new Set();
  for (const word of STOPWORDS) {
    const re = word.includes(' ')
      ? new RegExp(word.replace(/ /g, '\\s+'), 'g')
      : new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, 'gu');
    if (re.test(text)) found.add(word);
  }
  return [...found];
}

test('language · the scan covers the public documentation', () => {
  assert.ok(scanned.length > 25, `expected a populated scan, got ${scanned.length} files`);
  for (const must of ['README.md', 'AGENTS.md', 'docs/01-philosophy.md']) {
    assert.ok(scanned.includes(must), `${must} must be scanned`);
  }
});

test('language · no line of public markdown or JS is Portuguese prose', () => {
  /** @type {string[]} */
  const offenders = [];
  for (const rel of scanned) {
    read(rel)
      .split('\n')
      .forEach((line, i) => {
        const found = hits(line);
        if (found.length >= THRESHOLD) offenders.push(`${rel}:${i + 1}: ${found.join(', ')}`);
      });
  }
  assert.deepEqual(offenders, [], report('Portuguese prose', offenders));
});

test('language · the heuristic really fires (proof it is not vacuous)', () => {
  assert.ok(hits('Esta célula não está pausada, você pode retomar depois.').length >= THRESHOLD);
  assert.equal(hits('The historical name of the method is "Modo Celular".').length, 0);
  assert.equal(hits('Aliases: /celula and /pausar point at the canonical skills.').length, 0);
  assert.ok(hits('One active cell at a time; paused cells coexist.').length < THRESHOLD);
});
