// Hygiene: the four-level context strategy is enforced by the files themselves.
// Level 1 stays small and tool-neutral, adapters stay thin pointers, and no procedure
// ever tells an agent to swallow the whole documentation tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, allFiles, exists, lineCount, read, report } from './helpers.mjs';

// 45 was the budget before Level 1 had to carry the six-line summary of the Mandatory
// Engineering Constitution (docs/00-constitution.md): the epistemic labels, the
// fail-closed rule and the on-demand engineering skills must be readable by a
// context-starved agent, so they live in AGENTS.md itself. 55 is the budget with it.
const AGENTS_MAX = 55;
const CLAUDE_MAX = 12;
const ADAPTER_MAX = 15;

// Path allowlist for the adapter size rule. `adapters/README.md` is the per-tool
// documentation and honesty statement, not glue loaded by any agent, so the 15-line
// pointer budget does not apply to it. It is the ONLY exemption.
const NOT_AN_ADAPTER = /^adapters\/README\.md$/;

const adapterFiles = allFiles().filter(
  (rel) => rel.startsWith('adapters/') && !NOT_AN_ADAPTER.test(rel),
);

test('bootstrap · AGENTS.md is the small, tool-neutral Level 1 file', () => {
  const lines = lineCount('AGENTS.md');
  assert.ok(lines <= AGENTS_MAX, `AGENTS.md has ${lines} lines, budget is ${AGENTS_MAX}`);
  const text = read('AGENTS.md');
  assert.ok(
    !text.includes('CLAUDE.md'),
    'AGENTS.md must stay agent-neutral: it must not mention any single tool\'s config file',
  );
  assert.match(text, /vault\/state\//, 'AGENTS.md must say where state lives');
  assert.match(text, /skills\/cell\/SKILL\.md/, 'AGENTS.md must route to the cell procedure');
  assert.match(text, /skills\/pause\/SKILL\.md/, 'AGENTS.md must route to the pause procedure');
  assert.match(text, /vault\/policy\.md/, 'AGENTS.md must name the Level 4 policy path');
});

test('bootstrap · CLAUDE.md is a pointer, not a second copy of the method', () => {
  const lines = lineCount('CLAUDE.md');
  assert.ok(lines <= CLAUDE_MAX, `CLAUDE.md has ${lines} lines, budget is ${CLAUDE_MAX}`);
  assert.match(read('CLAUDE.md'), /AGENTS\.md/, 'CLAUDE.md must reference AGENTS.md');
});

test('bootstrap · every adapter file is a thin pointer', () => {
  assert.ok(adapterFiles.length >= 5, `expected adapter files, found ${adapterFiles.length}`);
  const tooLong = [];
  const notPointing = [];
  for (const rel of adapterFiles) {
    const lines = lineCount(rel);
    if (lines > ADAPTER_MAX) tooLong.push(`${rel} (${lines} lines)`);
    // A .json adapter file is machine-readable configuration, not glue an agent reads, so the
    // "points at the canonical skill" rule cannot apply to it. The size rule still does, and
    // its contents are asserted by their own test below.
    if (rel.endsWith('.json')) continue;
    const text = read(rel);
    if (!/skills\//.test(text) && !/AGENTS\.md/.test(text)) notPointing.push(rel);
  }
  assert.deepEqual(tooLong, [], report(`adapter files over ${ADAPTER_MAX} lines`, tooLong));
  assert.deepEqual(
    notPointing,
    [],
    report('adapter files that point at neither skills/ nor AGENTS.md', notPointing),
  );
});

test('bootstrap · root .claude/skills equals the Claude Code adapter byte-for-byte', () => {
  const adapterRoot = 'adapters/claude-code/.claude/skills';
  const adapter = allFiles()
    .filter((rel) => rel.startsWith(`${adapterRoot}/`))
    .map((rel) => rel.slice(adapterRoot.length + 1))
    .sort();
  const root = allFiles()
    .filter((rel) => rel.startsWith('.claude/skills/'))
    .map((rel) => rel.slice('.claude/skills/'.length))
    .sort();
  assert.ok(adapter.length >= 4, `expected >= 4 adapter skills, got ${adapter.length}`);
  assert.deepEqual(root, adapter, 'the two skill trees must contain the same relative paths');
  const differing = [];
  for (const rel of adapter) {
    const a = readFileSync(join(ROOT, adapterRoot, rel));
    const b = readFileSync(join(ROOT, '.claude/skills', rel));
    if (!a.equals(b)) differing.push(rel);
  }
  assert.deepEqual(differing, [], report('skill files that differ byte-for-byte', differing));
});

test('bootstrap · no skill asks an agent to read the whole documentation tree', () => {
  const skills = allFiles().filter((rel) => rel.endsWith('SKILL.md') || rel.endsWith('.mdc'));
  assert.ok(skills.length >= 6, `expected skill files, found ${skills.length}`);
  const bad = [/read all docs/i, /read all of docs/i, /read (the )?(entire|whole) docs/i,
    /read `?docs\/`?\b/i, /import all docs/i, /require(s)? reading all/i];
  /** @type {string[]} */
  const offenders = [];
  for (const rel of skills) {
    read(rel)
      .split('\n')
      .forEach((line, i) => {
        if (bad.some((re) => re.test(line))) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(offenders, [], report('wholesale documentation loads', offenders));
});

// The adaptive module is OPTIONAL, so this test is conditional on its policy directory being
// present - and says so rather than passing silently if the module is ever removed.
test('bootstrap · the mode skill is a thin, agent-neutral Level 2 procedure', () => {
  if (!exists('adaptive/policies')) {
    assert.equal(exists('skills/mode/SKILL.md'), false, 'no adaptive module, no mode skill');
    return;
  }
  const rel = 'skills/mode/SKILL.md';
  assert.equal(exists(rel), true, `${rel} must exist while adaptive/policies/ does`);
  const lines = lineCount(rel);
  assert.ok(lines <= 80, `${rel} has ${lines} lines, budget is 80`);
  const text = read(rel);
  assert.match(text, /^---\nname: mode\ndescription: >/, 'frontmatter must declare the skill');
  for (const alias of ['tired', 'cansado', 'modocansado', 'ready', 'estoubem', 'modoestoubem',
    'focus', 'foco', 'modofoco', 'explore', 'explorar', 'modoexplorar']) {
    assert.match(text, new RegExp(alias), `the alias table must list ${alias}`);
  }
  assert.match(text, /on your own initiative/, 'it must forbid an agent setting a mode itself');
  assert.match(text, /say it once/i, 'and say what an agent may do instead');
  assert.match(text, /boundaries\.md/, 'it must point at what no mode changes');
  assert.match(text, /not an authorization/, 'and say that a declaration grants nothing');
  assert.equal(/\bCLAUDE\.md\b/.test(text), false, 'a skill stays tool-neutral');
});

// The eight Claude Code mode skills. They are the reason the module works WITHOUT hooks: a
// skill the model cannot invoke can only have been invoked by the human, so the `set` it runs
// is user-originated by construction. Remove `disable-model-invocation` and that argument
// collapses - hence this test.
const MODE_SKILLS = ['tired', 'ready', 'focus', 'explore',
  'modocansado', 'modoestoubem', 'modofoco', 'modoexplorar'];

test('bootstrap · every adaptive mode skill is user-invocable only', () => {
  if (!exists('adaptive/policies')) return;
  for (const name of MODE_SKILLS) {
    const rel = `.claude/skills/${name}/SKILL.md`;
    assert.equal(exists(rel), true, `${rel} must exist`);
    assert.equal(exists(`adapters/claude-code/${rel}`), true, `the adapter copy of ${name} must exist`);
    const text = read(rel);
    const lines = lineCount(rel);
    assert.ok(lines <= ADAPTER_MAX, `${rel} has ${lines} lines, budget is ${ADAPTER_MAX}`);
    assert.match(text, /^disable-model-invocation: true$/m,
      `${rel} must be user-invocable only: the model must never set a mode`);
    assert.match(text, new RegExp(`^name: ${name}$`, 'm'), `${rel} must declare its name`);
    assert.match(text, new RegExp(`set ${name} --source skill`),
      `${rel} must record the provenance of a skill-sourced declaration`);
    assert.match(text, /cli\.mjs context/, `${rel} must tell the agent to read the block`);
    assert.match(text, /skills\/mode\/SKILL\.md/, `${rel} must point at the canonical procedure`);
  }
});

test('bootstrap · the adaptive hook configuration is opt-in, not installed', () => {
  if (!exists('adaptive/policies')) return;
  const rel = 'adapters/claude-code/settings.adaptive.json';
  assert.equal(exists(rel), true, `${rel} must ship as a snippet`);
  const config = JSON.parse(read(rel));
  for (const event of ['SessionStart', 'UserPromptSubmit']) {
    const command = config.hooks?.[event]?.[0]?.hooks?.[0]?.command;
    assert.equal(command, `node tools/adaptive/cli.mjs hook ${event}`, `${event} must call the hook`);
  }
  // Project hooks run commands with NO trust prompt, so cloning this repository must not enable
  // them. Nothing the clone already loads may reference the module.
  const installed = allFiles().filter((f) => /^\.claude\/settings(\.[a-z]+)?\.json$/.test(f));
  for (const file of installed) {
    assert.equal(read(file).includes('tools/adaptive'), false,
      `${file} must not enable the adaptive hooks: they are opt-in`);
  }
});
