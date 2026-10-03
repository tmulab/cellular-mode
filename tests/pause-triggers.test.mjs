// Hygiene: the pause ritual fires on EXPLICIT human requests only.
// Author's decision of 2026-10-03 (Hudson A. R. Bonomo): no inferred-fatigue trigger
// anywhere; a declared condition may only produce an OFFER, never an automatic pause
// and never a mode change. History notes that say the clause was "removed" are exempt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, allFiles, exists, read, isTextFile, report } from './helpers.mjs';

/** The exact one-question offer. Written in AGENTS.md and skills/pause/SKILL.md. */
const OFFER = 'Want me to pause and record the cell?';

/** Files allowed to quote a declared condition — only where the offer rule lives. */
const DECLARATION_ALLOWLIST = ['AGENTS.md', 'skills/pause/SKILL.md'];

/** Negative contexts: `tools/adaptive/` documents that natural language sets NOTHING,
 * and `tests/` quote phrases to assert their absence or to allowlist a word. */
const DECLARATION_EXEMPT = [/^tools\/adaptive\//, /^tests\//];

/** Fenced blocks hold recorded transcripts and command output: evidence, not instructions.
 * @param {string} text @returns {string} */
function withoutFences(text) {
  let inFence = false;
  return text
    .split('\n')
    .filter((line) => {
      if (line.startsWith('```')) {
        inFence = !inFence;
        return false;
      }
      return !inFence;
    })
    .join('\n');
}

const INFERENCE_TRIGGERS = [
  /signs? of fatigue/i,
  /shows signs/i,
  /any sign of/i,
  /sinal de cansa/i,
  /demonstra\w* de cansa/i,
  /demonstration of tired/i,
];

const DECLARATIONS = [/I ?'?m tired/i, /I am tired/i, /cansei/i, /estou cansado/i];

const SKIPPED = [/^vault\//, /^tests\/pause-triggers\.test\.mjs$/];

/** @returns {string[]} */
function textFiles() {
  return allFiles().filter((rel) => isTextFile(rel) && !SKIPPED.some((re) => re.test(rel)));
}

/** @param {string} rel @returns {string[]} */
function lines(rel) {
  return read(rel).split('\n');
}

test('pause · no file asks an agent to infer fatigue', () => {
  /** @type {string[]} */
  const offenders = [];
  for (const rel of textFiles()) {
    lines(rel).forEach((line, i) => {
      if (/removed/i.test(line)) return; // an explicit history note
      const hit = INFERENCE_TRIGGERS.find((re) => re.test(line));
      if (hit) offenders.push(`${rel}:${i + 1} ${hit}`);
    });
  }
  assert.deepEqual(offenders, [], report('inferred-fatigue triggers', offenders));
});

test('pause · the canonical skill lists /pause, /pausar and the explicit stop phrases', () => {
  const text = read('skills/pause/SKILL.md');
  const head = text.slice(0, text.indexOf('\n---', 4));
  for (const phrase of [
    '/pause',
    '/pausar',
    'stop here',
    "that's enough for today",
    'note this down',
    "I'll continue later",
    'close this cell',
    'vou parar',
    'chega por hoje',
    'anota aí',
    'continuo depois',
    'fecha essa célula',
  ]) {
    assert.ok(head.includes(phrase), `skills/pause/SKILL.md description must list ${phrase}`);
  }
});

test('pause · the Claude Code pointers keep /pause and /pausar as explicit triggers', () => {
  for (const root of ['.claude/skills', 'adapters/claude-code/.claude/skills']) {
    const pause = read(`${root}/pause/SKILL.md`);
    const pausar = read(`${root}/pausar/SKILL.md`);
    assert.ok(pause.includes('/pause'), `${root}/pause must trigger on /pause`);
    assert.ok(pause.includes('/pausar'), `${root}/pause must mention /pausar`);
    assert.ok(pausar.includes('/pausar'), `${root}/pausar must trigger on /pausar`);
    assert.ok(pausar.includes('vou parar'), `${root}/pausar must keep the explicit stop phrases`);
    assert.ok(pausar.includes('anota aí'), `${root}/pausar must keep "anota aí"`);
    for (const re of DECLARATIONS) {
      assert.ok(!re.test(pause), `${root}/pause must not trigger on a declared condition (${re})`);
      assert.ok(!re.test(pausar), `${root}/pausar must not trigger on a declared condition (${re})`);
    }
  }
});

test('pause · a declared condition appears only in the offer-to-pause rule', () => {
  /** @type {string[]} */
  const offenders = [];
  for (const rel of textFiles()) {
    if (DECLARATION_EXEMPT.some((re) => re.test(rel))) continue;
    const text = withoutFences(read(rel));
    if (!DECLARATIONS.some((re) => re.test(text))) continue;
    if (!DECLARATION_ALLOWLIST.includes(rel)) offenders.push(`${rel} (not an offer-rule file)`);
    else if (!text.includes(OFFER)) offenders.push(`${rel} (missing the exact offer sentence)`);
  }
  assert.deepEqual(offenders, [], report('declared-condition mentions outside the offer rule', offenders));
});

test('pause · the offer rule is written, in both places, with the exact sentence', () => {
  for (const rel of DECLARATION_ALLOWLIST) {
    const text = read(rel);
    assert.ok(text.includes(OFFER), `${rel} must contain the exact offer: ${OFFER}`);
  }
  const skill = read('skills/pause/SKILL.md');
  assert.ok(
    /not (a|an) (stop request|request)/i.test(skill),
    'skills/pause/SKILL.md must state that a declared condition is not a stop request',
  );
  assert.ok(
    /not change the adaptive\s+mode|never change the adaptive\s+mode/i.test(skill),
    'skills/pause/SKILL.md must forbid changing the adaptive mode on the agent\'s initiative',
  );
});

test('pause · the Claude Code skill pair stays byte-identical', () => {
  for (const rel of ['pause/SKILL.md', 'pausar/SKILL.md']) {
    const a = readFileSync(join(ROOT, 'adapters/claude-code/.claude/skills', rel));
    const b = readFileSync(join(ROOT, '.claude/skills', rel));
    assert.ok(a.equals(b), `${rel} must be byte-identical in both skill trees`);
  }
});

// Conditional on the OPTIONAL adaptive module, never vacuous: without it these must be GONE.
test('pause · the mode skills stay declaration-only and model-uninvocable', () => {
  if (!exists('adaptive/policies')) {
    for (const rel of ['.claude/skills/tired/SKILL.md', 'skills/mode/SKILL.md']) assert.equal(exists(rel), false, `no module, no ${rel}`);
    return;
  }
  const modes = ['tired', 'ready', 'focus', 'explore', 'modocansado', 'modoestoubem', 'modofoco', 'modoexplorar'];
  for (const root of ['.claude/skills', 'adapters/claude-code/.claude/skills']) {
    for (const mode of modes) {
      const text = read(`${root}/${mode}/SKILL.md`);
      assert.ok(
        text.includes('disable-model-invocation: true'),
        `${root}/${mode} must stay model-uninvocable`,
      );
      assert.ok(
        text.includes('Invoked by the human only'),
        `${root}/${mode} must stay human-invoked only`,
      );
      for (const re of DECLARATIONS) {
        assert.ok(!re.test(text), `${root}/${mode} must not trigger on a declared condition (${re})`);
      }
    }
  }
  assert.ok(
    read('skills/mode/SKILL.md').includes('Never infer a mode'),
    'skills/mode/SKILL.md must keep the no-inference rule',
  );
  const tiredPolicy = read('adaptive/policies/tired.md');
  assert.ok(
    /`\/tired`/.test(tiredPolicy),
    'adaptive/policies/tired.md must present the mode as a command the human types',
  );
  for (const re of DECLARATIONS) {
    assert.ok(!re.test(tiredPolicy), `adaptive/policies/tired.md must not read as fatigue-activated (${re})`);
  }
});

test('pause · ADR 0004 and its checklist items record the author approval', () => {
  const adr = read('docs/adr/0004-cellular-adaptive.md');
  assert.ok(/Status:\*\* \*\*Accepted/.test(adr), 'ADR 0004 must be Accepted');
  assert.ok(!/pending human confirmation/i.test(adr), 'ADR 0004 must no longer read as pending');
  assert.ok(adr.includes('Hudson A. R. Bonomo'), 'ADR 0004 must name the deciding human');
  const checklist = read('RELEASE_CHECKLIST.md');
  assert.ok(!/awaiting the author/i.test(checklist),
    'RELEASE_CHECKLIST.md must not leave the pause-trigger decision awaiting the author');
  assert.ok(!/pending human confirmation/i.test(checklist),
    'RELEASE_CHECKLIST.md item 36 must not read as pending human confirmation');
  assert.ok(
    !/Open decision — the pause skill/i.test(read('ADAPTIVE_REPORT.md')),
    'ADAPTIVE_REPORT.md must record the decision as resolved, not open',
  );
});
