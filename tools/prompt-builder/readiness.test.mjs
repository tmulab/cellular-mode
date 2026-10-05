// "Required to approve" — the column of prompt-builder/CONTRACTS.md, exercised one row at a
// time, plus the derived open-question list.
//
// The row this file guards hardest: a PROPOSED recommendation does NOT satisfy a required
// field. The tool is allowed to suggest an objective, an acceptance criterion or a technology;
// it is not allowed to let its own suggestion make a contract approvable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAnswer } from './answers.mjs';
import { emptyContract } from './contract-shape.mjs';
import { emptyDraft } from './draft.mjs';
import { conflicting, readyContract, scenario } from './fixtures/index.mjs';
import { deriveOpenQuestions, questionFor, readiness } from './readiness.mjs';

/** @type {(edit: (c: any) => void) => any} */
function broken(edit) {
  const copy = structuredClone(readyContract);
  edit(copy);
  return copy;
}

/** @type {(id: string) => any} */
function play(id) {
  const script = scenario(id);
  assert.ok(script !== null, `no such scenario: ${id}`);
  return script.answers.reduce((draft, answer) => applyAnswer(draft, answer.questionId, answer.text).draft, emptyDraft(script.path));
}

/** @type {(contract: unknown) => string[]} */
const blockedFields = (contract) => readiness(contract).blockers.map((b) => b.field);

test('readiness · the ready fixture is ready, and nothing is open', () => {
  assert.deepEqual(readiness(readyContract), { ready: true, blockers: [], openQuestions: [] });
});

test('readiness · a fresh contract blocks on every required row at once', () => {
  const fields = blockedFields(emptyContract('new'));
  assert.deepEqual(fields, [
    'identity.name', 'identity.slug', 'objective', 'scope.in', 'security.sensitiveData', 'acceptance',
  ]);
  assert.equal(readiness(emptyContract('new')).ready, false);
});

test('readiness · each required row blocks on its own', () => {
  /** @type {Array<[string, (c: any) => void]>} */
  const rows = [
    ['identity.name', (c) => { c.identity.name = { value: '', status: 'UNKNOWN', basis: 'not yet asked' }; }],
    ['identity.slug', (c) => { c.identity.slug = ''; }],
    ['objective', (c) => { c.objective = { value: '', status: 'UNKNOWN', basis: 'not yet asked' }; }],
    ['scope.in', (c) => { c.scope.in = []; }],
    ['security.sensitiveData', (c) => { c.security.sensitiveData = { value: '', status: 'UNKNOWN', basis: 'not yet asked' }; }],
    ['acceptance', (c) => { c.acceptance = []; }],
  ];
  for (const [field, edit] of rows) {
    assert.deepEqual(blockedFields(broken(edit)), [field], `${field} must block on its own`);
  }
});

test('readiness · a PROPOSED or INFERRED answer never satisfies a required row', () => {
  for (const status of ['PROPOSED', 'INFERRED']) {
    const suggested = broken((c) => {
      c.acceptance = [{ value: 'the smallest version runs end to end', status, basis: 'recommendation:acceptance' }];
    });
    assert.deepEqual(blockedFields(suggested), ['acceptance'], `${status} is not an answer`);
  }
  const promoted = broken((c) => {
    c.acceptance = [{ value: 'the smallest version runs end to end', status: 'DECLARED', basis: 'decision:D1' }];
    c.decisions = [{ id: 'D1', question: 'Accept this?', proposal: 'the smallest version runs end to end', status: 'approved', at: '2026-10-04T10:00:00Z' }];
  });
  assert.deepEqual(blockedFields(promoted), [], 'a decision the human approved IS an answer');
});

test('readiness · schema errors come first, and alone', () => {
  const invalid = broken((c) => { c.objective = { value: 'x', status: 'SETTLED', basis: 'typed' }; c.acceptance = []; });
  assert.deepEqual(blockedFields(invalid), ['objective.status'], 'a broken shape is not "almost ready"');
});

test('readiness · a blocking conflict blocks approval; a review conflict does not', () => {
  const overlapping = broken((c) => { c.scope.out = [{ value: 'add an item', status: 'DECLARED' }]; });
  assert.deepEqual(blockedFields(overlapping), ['scope.in + scope.out']);
  const repeated = broken((c) => { c.scope.in = [...c.scope.in, c.scope.in[0]]; });
  assert.deepEqual(blockedFields(repeated), [], 'a repetition is a question, not a refusal');
  assert.equal(readiness(repeated).openQuestions.length, 1);
});

test('readiness · the conflicting fixture is refused, and says why', () => {
  const state = readiness(conflicting);
  assert.equal(state.ready, false);
  // Its one schema fault comes first; the scope overlap is reported once the shape is sound.
  assert.deepEqual(state.blockers.map((b) => b.field), ['technologies.proposed[0].basis']);
});

test('openQuestions · ids are Q1.. in a fixed order, and the list is derived not stored', () => {
  const draft = play('complex-undecided');
  const derived = deriveOpenQuestions(draft.contract);
  assert.ok(derived.length > 0, 'a draft full of "I do not know" has open questions');
  assert.deepEqual(derived.map((q) => q.id), derived.map((_, i) => `Q${i + 1}`));
  assert.deepEqual(deriveOpenQuestions(draft.contract), derived, 'the same contract derives the same list');
  assert.deepEqual(draft.contract.openQuestions, [], 'nothing was written into the contract');
  for (const question of derived) {
    assert.equal(typeof question.question, 'string');
    assert.ok(question.question.length > 0);
  }
});

test('openQuestions · an UNKNOWN field asks the bank\'s own wording', () => {
  const unanswered = broken((c) => { c.users = { value: '', status: 'UNKNOWN', basis: 'not yet asked' }; });
  assert.deepEqual(deriveOpenQuestions(unanswered), [{ id: 'Q1', question: questionFor('users'), field: 'users' }]);
  assert.equal(questionFor('users'), 'Who will use it?');
  assert.ok(questionFor('risks').includes('risks'), 'a field with no bank question still gets one');
});

test('openQuestions · a pending decision is open; a settled one is not', () => {
  /** @type {(status: string) => any} */
  const withDecision = (status) => broken((c) => {
    c.decisions = [{
      id: 'D1', question: 'Which runtime?', proposal: 'Node.js', status, at: status === 'pending' ? null : '2026-10-04T10:00:00Z', field: 'technologies.approved',
    }];
  });
  const open = deriveOpenQuestions(withDecision('pending'));
  assert.equal(open.length, 1);
  assert.equal(open[0]?.field, 'technologies.approved');
  assert.ok(open[0]?.question.includes('Node.js'), 'the proposal is quoted so the human can answer it');
  assert.deepEqual(deriveOpenQuestions(withDecision('approved')), []);
  assert.deepEqual(deriveOpenQuestions(withDecision('rejected')), []);
});

test('readiness · the unknown-tech scenario: a proposal, no approval, and only real blockers', () => {
  const { contract } = play('unknown-tech');
  assert.deepEqual(contract.technologies.approved, [], 'an undecided technology is never approved');
  assert.equal(contract.technologies.proposed.length, 1);
  assert.equal(contract.technologies.proposed[0].status, 'PROPOSED');
  const fields = blockedFields(contract);
  assert.deepEqual(fields, ['identity.name', 'identity.slug', 'scope.in', 'security.sensitiveData', 'acceptance']);
  assert.ok(!fields.includes('objective'), 'the objective was answered, so it does not block');
  assert.ok(!fields.some((f) => f.startsWith('technologies')), 'an undecided technology is not a blocker');
});

test('readiness · total: it answers for values no contract ever produced', () => {
  for (const value of [null, undefined, 7, 'contract', [], {}]) {
    const state = readiness(value);
    assert.equal(state.ready, false);
    assert.ok(state.blockers.length > 0);
    assert.deepEqual(state.openQuestions, []);
  }
});
