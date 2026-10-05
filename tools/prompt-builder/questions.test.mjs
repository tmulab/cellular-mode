// The question bank: its order, what it refuses to ask twice, and what a declared mode may
// and may not change about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, nextQuestion, questionById } from './questions.mjs';
import { emptyDraft } from './draft.mjs';
import { entry } from './contract-shape.mjs';
import { setField } from './fields.mjs';
import { skipQuestion } from './answers.mjs';

/** Every question the bank would ask, in order, without answering any of them.
 * @param {import('./types.mjs').Draft} start @param {string} [mode] @returns {string[]} */
function askingOrder(start, mode) {
  let draft = start;
  /** @type {string[]} */
  const ids = [];
  for (let step = 0; step <= QUESTIONS.length; step += 1) {
    const question = nextQuestion(draft, mode);
    if (question === null) return ids;
    ids.push(question.id);
    draft = { ...draft, asked: [...draft.asked, question.id] };
  }
  throw new Error('nextQuestion never ran out of questions');
}

test('questions · the new-project order is the approved one', () => {
  assert.deepEqual(askingOrder(emptyDraft('new')), [
    'objective', 'users', 'problem', 'smallest-version', 'scope-in',
    'sensitive-data', 'technologies', 'involvement', 'environment', 'acceptance',
  ]);
});

test('questions · resuming asks only what resuming needs', () => {
  assert.deepEqual(askingOrder(emptyDraft('resume')), ['objective', 'scope-in', 'involvement', 'acceptance']);
});

test('questions · every question is plain, short and one sentence', () => {
  for (const question of QUESTIONS) {
    assert.ok(question.prompt.length <= 90, `${question.id}: prompt too long`);
    assert.equal(question.prompt.split('?').length - 1 <= 1, true, `${question.id}: one question only`);
    assert.ok(question.help.length <= 110, `${question.id}: help too long`);
    assert.ok(question.paths.length > 0, `${question.id}: asked on no path`);
    assert.ok(!/\bcell\b|epistemic|trilateral/i.test(question.prompt), `${question.id}: method jargon`);
  }
});

test('questions · tired drops the help line and nothing else', () => {
  const ready = nextQuestion(emptyDraft('new'));
  const tired = nextQuestion(emptyDraft('new'), 'tired');
  assert.ok(ready !== null && tired !== null);
  assert.equal('help' in ready, true);
  assert.equal('help' in tired, false);
  assert.equal(tired.id, ready.id);
  assert.equal(tired.prompt, ready.prompt);
});

test('questions · an unknown mode is treated as ready, never as a reason to ask less', () => {
  const ready = nextQuestion(emptyDraft('new'), 'ready');
  const nonsense = nextQuestion(emptyDraft('new'), 'banana');
  assert.deepEqual(nonsense, ready);
  assert.deepEqual(askingOrder(emptyDraft('new'), 'banana'), askingOrder(emptyDraft('new'), 'focus'));
  assert.deepEqual(askingOrder(emptyDraft('new'), 'tired'), askingOrder(emptyDraft('new'), 'ready'));
});

test('questions · a VERIFIED field is never asked about again', () => {
  const start = emptyDraft('existing');
  const verified = {
    ...start,
    contract: setField(start.contract, 'technologies.approved', [entry('Node.js (package.json)', 'VERIFIED', 'package.json')]),
  };
  assert.ok(askingOrder(start).includes('technologies'));
  assert.ok(!askingOrder(verified).includes('technologies'));
});

test('questions · a skipped question is not asked again', () => {
  const skipped = skipQuestion(emptyDraft('new'), 'objective');
  const first = nextQuestion(skipped);
  assert.ok(first !== null);
  assert.equal(first.id, 'users');
});

test('questions · the bank is addressable by id, and unknown ids are null', () => {
  assert.equal(questionById('technologies')?.field, 'technologies.approved');
  assert.equal(questionById('sensitive-data')?.field, 'security.sensitiveData');
  assert.equal(questionById('nothing-like-this'), null);
  const ids = QUESTIONS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'question ids must be unique');
  const priorities = QUESTIONS.map((q) => q.priority);
  assert.equal(new Set(priorities).size, priorities.length, 'priorities must be unique');
});

test('questions · a recommendation, where there is one, says what it assumes and what it costs', () => {
  const withRecommendation = QUESTIONS.filter((q) => q.unknownRecommendation !== undefined);
  assert.ok(withRecommendation.length >= 2);
  for (const question of withRecommendation) {
    const recommendation = question.unknownRecommendation;
    assert.ok(recommendation !== undefined);
    assert.ok(recommendation.value.trim() !== '', `${question.id}: empty recommendation`);
    assert.ok(recommendation.assumptions.trim() !== '', `${question.id}: no assumptions`);
    assert.ok(recommendation.tradeoffs.trim() !== '', `${question.id}: no trade-offs`);
  }
  // No recommendation may be invented for these: they are the human's to answer.
  for (const id of ['objective', 'users', 'problem', 'sensitive-data']) {
    assert.equal(questionById(id)?.unknownRecommendation, undefined, id);
  }
});
