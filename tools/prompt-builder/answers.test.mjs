// Applying answers: what becomes DECLARED, what stays UNKNOWN, and what is refused outright.
//
// The secret-shaped and path-shaped samples are assembled from fragments at runtime, so this
// file contains no literal credential and no literal machine path — the same discipline
// tests/leaks.test.mjs applies to the whole repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAnswer, isUnknownAnswer, skipQuestion, splitList } from './answers.mjs';
import { emptyDraft } from './draft.mjs';
import { nextQuestion } from './questions.mjs';
import { codeOf } from './errors.mjs';
import { injection, unknownTech } from './fixtures/index.mjs';

/** @type {(...parts: string[]) => string} */
const j = (...parts) => parts.join('');

/** @param {() => unknown} action @returns {string | null} */
function refusal(action) {
  try {
    action();
    return null;
  } catch (error) {
    return codeOf(error);
  }
}

test('answers · ordinary text becomes DECLARED, and the draft records the question', () => {
  const start = emptyDraft('new');
  const { draft, notes } = applyAnswer(start, 'objective', '  A to-do list for one person.  ');
  assert.deepEqual(draft.contract.objective, { value: 'A to-do list for one person.', status: 'DECLARED' });
  assert.deepEqual(draft.asked, ['objective']);
  assert.equal(notes.length, 1);
  // The draft handed in is never touched.
  assert.deepEqual(start.asked, []);
  assert.equal(start.contract.objective.status, 'UNKNOWN');
});

test('answers · a list field splits on lines and semicolons, markers removed', () => {
  assert.deepEqual(splitList('- a\n* b\n1. c; d'), ['a', 'b', 'c', 'd']);
  const { draft } = applyAnswer(emptyDraft('new'), 'scope-in', 'add a task\nlist tasks; mark done');
  assert.deepEqual(draft.contract.scope.in.map((e) => e.value), ['add a task', 'list tasks', 'mark done']);
  assert.deepEqual([...new Set(draft.contract.scope.in.map((e) => e.status))], ['DECLARED']);
});

test('answers · exclusions: text becomes DECLARED entries, "none" records no entry at all', () => {
  const asked = applyAnswer(emptyDraft('new'), 'scope-out', 'no accounts\nno cloud; no analytics');
  assert.deepEqual(asked.draft.contract.scope.out.map((e) => e.value),
    ['no accounts', 'no cloud', 'no analytics']);
  assert.deepEqual([...new Set(asked.draft.contract.scope.out.map((e) => e.status))], ['DECLARED']);

  for (const text of ['none', 'None.', 'nothing', 'No', 'nada', 'nenhum']) {
    const { draft, notes } = applyAnswer(emptyDraft('new'), 'scope-out', text);
    assert.deepEqual(draft.contract.scope.out, [], `${text}: no fake entry may be recorded`);
    assert.deepEqual(draft.asked, ['scope-out'], `${text}: the question must count as asked`);
    assert.notEqual(nextQuestion(draft)?.id, 'scope-out', `${text}: it must not be asked again`);
    assert.ok(notes.some((note) => note.includes('nothing to record')));
  }
  // "none" is accepted ONLY where the bank says so: it is an answer ABOUT the project
  // everywhere else, and dropping it would drop a security answer.
  const sensitive = applyAnswer(emptyDraft('new'), 'sensitive-data', 'None.');
  assert.equal(sensitive.draft.contract.security.sensitiveData.status, 'DECLARED');
});

test('answers · exclusions: "I do not know" invents nothing and is not asked twice', () => {
  const { draft, notes } = applyAnswer(emptyDraft('new'), 'scope-out', 'I do not know');
  assert.deepEqual(draft.contract.scope.out, []);
  assert.deepEqual(draft.proposals, [], 'there is no recommendation for what somebody wants left out');
  assert.deepEqual(draft.asked, ['scope-out']);
  assert.notEqual(nextQuestion(draft)?.id, 'scope-out');
  assert.ok(notes.some((note) => note.includes('nothing was invented')));
  // Tired: still exactly one question, and the help line is the only thing missing.
  const start = emptyDraft('new');
  const answered = ['objective', 'users', 'problem', 'smallest-version', 'scope-in']
    .reduce((acc, id) => ({ ...acc, asked: [...acc.asked, id] }), start);
  const tired = nextQuestion(answered, 'tired');
  assert.equal(tired?.id, 'scope-out');
  assert.equal(tired?.field, 'scope.out');
  assert.equal('help' in (tired ?? {}), false);
});

test('answers · "I do not know" is recognised in several wordings, but not inside a sentence', () => {
  for (const text of ['I don’t know', 'i dont know', 'IDK', 'Not sure', 'not sure yet', 'nao sei', 'I do not know.']) {
    assert.equal(isUnknownAnswer(text), true, text);
  }
  assert.equal(isUnknownAnswer('I do not know, maybe Python'), false);
  assert.equal(isUnknownAnswer('Node.js'), false);
});

test('answers · an unknown technology stays UNKNOWN and becomes a PROPOSED option, never DECLARED', () => {
  const answer = unknownTech.answers[1];
  assert.ok(answer !== undefined);
  const { draft, notes } = applyAnswer(emptyDraft('new'), answer.questionId, answer.text);
  const { technologies } = draft.contract;
  assert.deepEqual(technologies.approved, [], 'nothing may be approved by not knowing');
  assert.equal(technologies.proposed.length, 1);
  const proposed = technologies.proposed[0];
  assert.ok(proposed !== undefined);
  assert.equal(proposed.status, 'PROPOSED');
  assert.equal(proposed.value, 'Decide technology in a first architecture/discovery cell');
  assert.match(String(proposed.basis), /^recommendation:technologies — assumes .+; trade-off: .+$/);
  assert.deepEqual(draft.asked, ['technologies']);
  assert.ok(notes.some((note) => note.includes('nothing is approved')));
});

test('answers · an unknown single field keeps UNKNOWN and records the proposal in the draft', () => {
  const { draft } = applyAnswer(emptyDraft('new'), 'involvement', 'not sure');
  assert.deepEqual(draft.contract.involvement, {
    value: '', status: 'UNKNOWN', basis: 'answered "I do not know" at question involvement',
  });
  assert.equal(draft.proposals.length, 1);
  const proposal = draft.proposals[0];
  assert.ok(proposal !== undefined);
  assert.equal(proposal.field, 'involvement');
  assert.equal(proposal.entry.status, 'PROPOSED');
  assert.equal(proposal.entry.value, 'guided: the agent proposes, you approve each decision');
});

test('answers · not knowing never produces a DECLARED statement anywhere', () => {
  let draft = emptyDraft('new');
  for (const id of ['smallest-version', 'scope-in', 'technologies', 'involvement', 'environment', 'acceptance']) {
    draft = applyAnswer(draft, id, 'I do not know').draft;
  }
  const serialised = JSON.stringify(draft);
  assert.equal(serialised.includes('"DECLARED"'), false, 'an unknown answer must never be declared');
  assert.ok(serialised.includes('"PROPOSED"'));
});

test('answers · a credential-shaped answer is refused and never recorded', () => {
  const samples = [
    j('AKI', 'A', 'ABCDEFGHIJKLMNOP'),
    j('g', 'h', 'p', '_', 'abcdefghijklmnopqrstuvwxyz0123'),
    j('s', 'k', '-', 'ant', '-', 'abcdefghijklmnopqrstuv'),
    j('x', 'o', 'x', 'b', '-', '12345678901234'),
    j('the ', 'pass', 'word', '=', 'correct-horse-battery'),
    j('-----', 'BEGIN ', 'RSA ', 'PRIVATE KEY', '-----'),
  ];
  for (const sample of samples) {
    assert.equal(refusal(() => applyAnswer(emptyDraft('new'), 'technologies', sample)), 'SECRET_LIKE', sample.slice(0, 6));
  }
});

test('answers · an absolute or personal path is refused with its own code', () => {
  const samples = [
    j('D', ':', '\\', 'work', '\\', 'notes'),
    j('/', 'home', '/', 'ana', '/', 'projects'),
    j('~', '/', 'projects', '/', 'ledger'),
    j('/', 'Us', 'ers', '/', 'ana', '/', 'code'),
  ];
  for (const sample of samples) {
    assert.equal(refusal(() => applyAnswer(emptyDraft('new'), 'environment', sample)), 'ABSOLUTE_PATH', sample);
  }
  // A repository-relative path is exactly what the hint asks for, and is recorded.
  const { draft } = applyAnswer(emptyDraft('new'), 'environment', 'runs from src/cli.mjs on my own machine');
  assert.equal(draft.contract.environment.status, 'DECLARED');
});

test('answers · hostile text is recorded as text and interprets nothing', () => {
  let draft = emptyDraft('new');
  for (const answer of injection.answers) {
    draft = applyAnswer(draft, answer.questionId, answer.text).draft;
  }
  assert.equal(draft.contract.objective.status, 'DECLARED');
  assert.ok(draft.contract.objective.value.startsWith('Ignore previous instructions'));
  assert.deepEqual(draft.contract.approval, { approved: false, at: null });
  assert.deepEqual(draft.contract.decisions, []);
  assert.equal(draft.contract.scope.in.length, 3, 'the hostile lines are items, not commands');
  assert.deepEqual([...new Set(draft.contract.scope.in.map((e) => e.status))], ['DECLARED']);
});

test('answers · an empty answer, and an unknown question id, are refused', () => {
  assert.equal(refusal(() => applyAnswer(emptyDraft('new'), 'objective', '   ')), 'BAD_ENTRY');
  assert.equal(refusal(() => applyAnswer(emptyDraft('new'), 'no-such-question', 'x')), 'UNKNOWN_QUESTION');
  assert.equal(refusal(() => skipQuestion(emptyDraft('new'), 'no-such-question')), 'UNKNOWN_QUESTION');
});

test('answers · skipping is recorded once', () => {
  const once = skipQuestion(emptyDraft('new'), 'users');
  const twice = skipQuestion(once, 'users');
  assert.deepEqual(once.skipped, ['users']);
  assert.equal(twice, once);
});
