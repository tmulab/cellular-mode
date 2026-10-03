// V5, V7..V15 - the pure core of the advisor: the bounded context, the validator, the
// grounding rule, the budget and the registry.
//
// Nothing here starts a kernel. That is the point of the split: the two modules that decide
// what a model is shown and what it is allowed to have said are pure functions over plain
// values, so every claim below is a claim about a rule and not about a composition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, DEFAULT_MAX_BYTES } from './observer-advisor/context.mjs';
import { validateOutput } from './observer-advisor/validate.mjs';
import { createRegistry, adapterProblems } from './observer-advisor/model.mjs';
import { createBudget, normaliseLimits } from './observer-advisor/limits.mjs';
import { contextIdsOf, fixtureAdapter, fixtureAnswer } from './observer-advisor/fixture-adapter.mjs';
import { cannedAdapter } from './observer-advisor-answers.mjs';

/** @type {(id: string, status: string, extra?: Record<string, unknown>) => any} */
const entry = (id, status, extra = {}) => ({
  id,
  name: `cell ${id}`,
  status,
  nextStep: 'write the test first',
  dependencies: [],
  cell: { objective: `objective of ${id}`, boundaryIn: 'in', boundaryOut: 'out', doneCriterion: 'green' },
  ...extra,
});

/** A small vault: one active cell declaring one dependency, one cell nobody declared. */
const MODEL = {
  entries: [
    entry('alpha', 'active', { dependencies: ['beta'] }),
    entry('beta', 'done'),
    entry('gamma', 'planned'),
  ],
  logEntries: Array.from({ length: 9 }, (_, index) => ({
    timestamp: `2026-10-0${index + 1} 10:00`,
    cell: 'alpha',
    status: index === 8 ? 'complete' : 'pause',
    facts: `fact number ${index}`,
    next: 'carry on',
  })),
};

const FINDINGS = {
  ran: true,
  findings: [{
    id: 'AUD-FILE-SIZE-001',
    rule: 'file-size',
    status: 'FAIL',
    scope: 'project',
    evidence: ['eip/secret-looking-path.mjs:210 lines'],
    explanation: 'too long',
  }],
};

test('V7 the context carries the active cell, its declared deps, the log window and the verdicts', () => {
  const context = buildContext({ model: MODEL, findings: FINDINGS, question: 'what next?', logEntries: 5 });
  assert.match(context.text, /\[cell:alpha\] ACTIVE CELL/);
  assert.match(context.text, /\[cell:beta\] DECLARED DEPENDENCY/);
  assert.match(context.text, /\[finding:AUD-FILE-SIZE-001\]/);
  assert.match(context.text, /\[question\] what next\?/);
  // MUTATION PROOF of the selection rule, three ways. A cell nobody declared, a log entry
  // outside the window and a finding's evidence line are each ABSENT - not shortened, not
  // summarised: absent. A context builder that leaked any of them would still pass a test
  // that only checked what it contains.
  assert.equal(context.text.includes('gamma'), false, 'an undeclared cell is not context');
  assert.equal(context.text.includes('fact number 0'), false, 'a log entry outside the window is not context');
  assert.equal(context.text.includes('fact number 3'), false, 'the window is the LAST five entries');
  assert.match(context.text, /fact number 8/);
  assert.equal(context.text.includes('secret-looking-path'), false, "a finding's evidence lines stay with the auditor");
});

test('V8 every item has a stable id, and ids are exactly what a model may cite', () => {
  const context = buildContext({ model: MODEL, findings: FINDINGS, question: 'q', logEntries: 2 });
  assert.deepEqual(context.ids, [
    'question', 'cell:alpha', 'finding:AUD-FILE-SIZE-001', 'cell:beta', 'log:1', 'log:2',
  ]);
  // Stable across two builds of the same inputs: an id that moved would point at the wrong
  // thing in a recommendation that was written yesterday.
  assert.deepEqual(buildContext({ model: MODEL, findings: FINDINGS, question: 'q', logEntries: 2 }).ids, context.ids);
});

test('V7 a vault with no active cell says so instead of choosing one', () => {
  const context = buildContext({ model: { entries: [entry('beta', 'done')], logEntries: [] } });
  assert.match(context.text, /\[cell:none\] NO ACTIVE CELL/);
  assert.deepEqual(context.ids, ['cell:none']);
});

test('V9 the byte cap holds, truncation is deterministic, and what was dropped is named', () => {
  const big = {
    entries: [entry('alpha', 'active', { dependencies: Array.from({ length: 400 }, (_, i) => `dep${i}`) }),
      ...Array.from({ length: 400 }, (_, i) => entry(`dep${i}`, 'planned'))],
    logEntries: Array.from({ length: 200 }, (_, i) => ({ timestamp: `2026-01-01 00:${i}`, cell: 'alpha', facts: `f${i}` })),
  };
  const context = buildContext({ model: big, findings: FINDINGS, question: 'q', logEntries: 50 });
  assert.equal(context.cap, DEFAULT_MAX_BYTES);
  assert.ok(context.bytes <= DEFAULT_MAX_BYTES, `${context.bytes} bytes is over the cap`);
  assert.equal(Buffer.byteLength(context.text, 'utf8'), context.bytes, 'the reported size is the real size');
  assert.ok(context.dropped.length > 0, 'what did not fit is named');
  assert.deepEqual(buildContext({ model: big, findings: FINDINGS, question: 'q', logEntries: 50 }).text, context.text);
  // Everything dropped is absent from the text, and everything kept has an id.
  for (const id of context.dropped) assert.equal(context.ids.includes(id), false, id);
});

test('V5 the registry refuses a network adapter unless a human asks, and refuses a non-adapter', () => {
  const remote = cannedAdapter('{}', { id: 'remote-thing', kind: 'remote', network: true });
  assert.throws(() => createRegistry([remote]), /declares network access/);
  assert.throws(() => createRegistry([remote]), /No network adapter ships/);
  // Explicitly allowed, it loads - the flag is the human decision, in the composition.
  assert.equal(createRegistry([remote], { allowNetwork: true }).ids[0], 'remote-thing');
  assert.throws(() => createRegistry([{ id: 'x' }]), /describe\(\) is mandatory/);
  assert.throws(() => createRegistry([fixtureAdapter, fixtureAdapter]), /share the id/);
  assert.deepEqual(adapterProblems(fixtureAdapter), []);
  const registry = createRegistry([fixtureAdapter]);
  assert.deepEqual(registry.ids, ['fixture']);
  assert.equal(registry.describe()[0]?.network, false);
  assert.throws(() => registry.resolve('local'), /unknown advisor adapter "local"; this build offers "fixture"/);
});

test('V18 the budget counts calls and spaces them, and limits are validated', () => {
  let clock = 1000;
  const limits = normaliseLimits({ maxCallsPerSession: 2, minIntervalMs: 500 });
  const budget = createBudget(limits, () => clock);
  assert.equal(budget.due(), null);
  budget.spend();
  assert.equal(budget.due()?.path, 'limits.minIntervalMs');
  clock += 500;
  assert.equal(budget.due(), null);
  budget.spend();
  clock += 5000;
  assert.equal(budget.due()?.path, 'limits.maxCallsPerSession');
  assert.equal(budget.remaining(), 0);
  budget.reset();
  assert.equal(budget.due(), null);
  assert.equal(budget.used(), 0);
  assert.throws(() => normaliseLimits({ maxCallsPerSession: -1 }), /non-negative integer/);
  assert.throws(() => normaliseLimits({ maxCallsPerSession: 10000 }), /above the ceiling/);
  assert.throws(() => normaliseLimits({ minIntervalMs: 1.5 }), /non-negative integer/);
});

test('the fixture adapter is deterministic, offline, and cites only what it was shown', async () => {
  const described = fixtureAdapter.describe();
  assert.deepEqual([described.id, described.kind, described.network], ['fixture', 'fixture', false]);
  const context = buildContext({ model: MODEL, findings: FINDINGS, question: 'what next?' });
  const first = await fixtureAdapter.complete({
    system: 's', context: context.text, question: 'what next?', maxOutputChars: 4000,
  });
  const second = await fixtureAdapter.complete({
    system: 's', context: context.text, question: 'what next?', maxOutputChars: 4000,
  });
  assert.equal(first.text, second.text, 'same inputs, same answer');
  assert.notEqual(fixtureAnswer({ question: 'something else', context: context.text }), first.text);
  assert.deepEqual(contextIdsOf(context.text), context.ids);
  const out = validateOutput(first.text, { contextIds: context.ids, contextText: context.text });
  assert.ok(out.recommendations.length >= 2);
  assert.equal(out.validation.rejected, 0);
  assert.deepEqual(out.validation.refsRemoved, [], 'the shipped adapter invents no reference');
  for (const rec of out.recommendations) {
    assert.ok(rec.statement.length <= 600);
    for (const ref of rec.evidenceRefs) assert.ok(context.ids.includes(ref), ref);
  }
  // An aborted call ends as a refusal, not as an answer (V20, at the adapter's own level).
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => fixtureAdapter.complete({
    system: 's', context: '', question: '', maxOutputChars: 100, signal: controller.signal,
  }), /cancelled/);
});
