// Hygiene for the adaptive integration — AD23, AD24, AD25 and AD26 of
// tools/adaptive/ACCEPTANCE-INTEGRATION.md.
//
// These are documentation assertions, which is unusual for a test suite, and deliberate: the
// risk this module carries is not a crash, it is a CLAIM. "The agent follows the mode" is
// unenforceable, so the documents must not say it, and the one thing a script can check is
// whether the honest sentence is still there. The whole file is conditional on the module being
// present, so deleting it leaves the suite honest rather than vacuous.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exists, lineCount, read } from './helpers.mjs';

const PRESENT = exists('adaptive/policies') && exists('tools/adaptive');

test('adaptive · the portable path is written into the cell procedure, in three lines', () => {
  if (!PRESENT) return;
  const text = read('skills/cell/SKILL.md');
  assert.match(text, /tools\/adaptive\/cli\.mjs context/, 'the cell skill must name the command');
  assert.match(text, /empty output = the default/i, 'and say what empty output means');
  assert.match(text, /Never set a mode/i, 'and forbid setting one');
  assert.ok(lineCount('skills/cell/SKILL.md') <= 120, 'the procedure stays a Level 2 file');
});

test('adaptive · Level 1 points at the module in two lines, and stays tool-neutral', () => {
  if (!PRESENT) return;
  const text = read('AGENTS.md');
  assert.match(text, /skills\/mode\/SKILL\.md/, 'AGENTS.md must route to the mode procedure');
  assert.match(text, /declared by the human only, never inferred/i, 'and state the rule');
  assert.match(text, /boundaries\.md/, 'and point at what no mode changes');
  assert.equal(text.includes('CLAUDE.md'), false, 'Level 1 stays agent-neutral');
  assert.ok(lineCount('AGENTS.md') <= 55, `AGENTS.md is ${lineCount('AGENTS.md')} lines`);
});

test('adaptive · the Level 2 table names the mode skill and ONE policy file', () => {
  if (!PRESENT) return;
  const text = read('docs/06-context-engineering.md');
  assert.match(text, /skills\/mode\/SKILL\.md/);
  assert.match(text, /adaptive\/policies/);
  assert.match(text, /Never as a set|the ONE/, 'the table must say only one policy file loads');
});

test('adaptive · every document separates deterministic from model-dependent', () => {
  if (!PRESENT) return;
  for (const rel of ['docs/08-agent-integration.md', 'adapters/README.md',
    'tools/adaptive/ACCEPTANCE-INTEGRATION.md']) {
    const text = read(rel);
    assert.match(text, /[Dd]eterministic/, `${rel} must name what is deterministic`);
    assert.match(text, /[Mm]odel-dependent/, `${rel} must name what is not`);
    assert.match(text, /not\**\s*enforceable|cannot guarantee|not something this repository can check/i,
      `${rel} must say plainly that compliance is not guaranteed`);
  }
});

test('adaptive · no document claims that an agent will obey a mode', () => {
  if (!PRESENT) return;
  const forbidden = [
    /guarantees? that (the|an) (agent|model) (will )?(follow|obey|compl)/i,
    /the (agent|model) will (always )?(follow|obey) the (mode|block)/i,
    /ensures (the|an) (agent|model) (follows|obeys)/i,
  ];
  // Sentence by sentence, with negated sentences dropped first: "no part of this repository can
  // guarantee that a model obeys a mode" is the honest form of the very claim being forbidden,
  // so a document-wide regex would flag the disclaimer and miss nothing else.
  for (const rel of ['docs/08-agent-integration.md', 'docs/10-adaptive.md', 'adapters/README.md',
    'tools/adaptive/README.md', 'skills/mode/SKILL.md', 'tools/adaptive/ACCEPTANCE-INTEGRATION.md']) {
    const claims = read(rel).split(/(?<=[.!?])\s+/)
      .filter((sentence) => !/(no|not|never|cannot|nothing|without)/i.test(sentence));
    for (const sentence of claims) {
      for (const pattern of forbidden) {
        assert.doesNotMatch(sentence, pattern, `${rel} must not promise compliance: ${sentence.trim()}`);
      }
    }
    assert.ok(claims.length > 5, `${rel}: the sentence split must actually produce sentences`);
  }
});

test('adaptive · the manual validation procedure exists and is marked NOT YET PERFORMED', () => {
  if (!PRESENT) return;
  const rel = 'tools/adaptive/MANUAL-VALIDATION.md';
  assert.equal(exists(rel), true);
  const text = read(rel);
  assert.ok(lineCount(rel) <= 80, `${rel} is ${lineCount(rel)} lines, budget is 80`);
  assert.match(text, /NOT YET PERFORMED/, 'an unrun procedure says so');
  for (const mode of ['tired', 'focus', 'explore', 'ready']) {
    assert.match(text, new RegExp(`/${mode}`), `${rel} must exercise /${mode}`);
  }
  assert.match(text, /security finding/i, 'the three invariant checks must be in the procedure');
  assert.match(text, /estou cansado/, 'including the no-inference check');
});

test('adaptive · the context cost is recorded in bytes, in both documents', () => {
  if (!PRESENT) return;
  for (const rel of ['tools/adaptive/README.md', 'CONTEXT_AUDIT.md']) {
    const text = read(rel);
    assert.match(text, /4,?365/, `${rel} must record the measured AGENTS.md size`);
    assert.match(text, /1,?932/, `${rel} must record the skill-description cost`);
    assert.match(text, /\b0\b.*(bytes|unchanged)|unchanged.*\b0\b/,
      `${rel} must record that an unchanged mode costs nothing`);
    assert.equal(/\btokens?\b/.test(text) && !/not? token|bytes rather than tokens|bytes, \*\*not\*\* token|real tokenizer/i.test(text), false,
      `${rel} must not present token counts as measured`);
  }
});

test('adaptive · the skill-name precedence risk and its fallback are written down', () => {
  if (!PRESENT) return;
  const text = read('adapters/README.md');
  assert.match(text, /UNKNOWN/, 'the risk is labelled, not softened');
  assert.match(text, /not documented/i, 'and says why it is unknown');
  for (const name of ['/mode-tired', '/mode-ready', '/mode-focus', '/mode-explore']) {
    assert.ok(text.includes(name), `the fallback name ${name} must be documented`);
  }
  assert.match(text, /deliberately not shipped/i, 'and the fallback must not be shipped');
  assert.equal(exists('.claude/skills/mode-tired'), false, 'nor exist on disk');
});

test('adaptive · AD28 the Observer integration claims presentation only, and no selector', () => {
  if (!PRESENT) return;
  for (const rel of ['docs/10-adaptive.md', 'apps/observer/README.md']) {
    // Emphasis removed first: the claim is the SENTENCE, and a `**` in the middle of it must
    // not be what decides whether the document still says it.
    const text = read(rel).replace(/\*/g, '');
    assert.match(text, /--adaptive/, `${rel} must document the opt-in flag`);
    assert.match(text, /presentation only/i, `${rel} must say what a mode changes`);
    assert.match(text, /in full under\s+every\s+mode/i,
      `${rel} must state the invariant in those words`);
    assert.match(text, /no (mode )?selector/i, `${rel} must say the badge is read-only`);
    assert.match(text, /future work/i, `${rel} must label writing a mode as not built`);
    for (const rule of ['secrets', 'deps', 'import-boundaries']) {
      assert.ok(text.includes(rule), `${rel} must name the security rule ${rule}`);
    }
  }
  // And the dashboard really has no setter: the capability list is one read-only name.
  const schemas = read('eip/plugins/adaptive-preferences/schemas.mjs');
  assert.equal(/\b(set|declare|write|clear|reset)\s*:/.test(schemas), false,
    'a capability that writes a mode must not exist');
});
