// What the contract says twice, and the line between "refuse" and "ask".
//
// The assertion that matters most in this file is the LAST one: nothing in conflicts.mjs ever
// changes the contract. A detector that quietly tidies up is worse than no detector, because
// the tidying is invisible in the output and the human never learns they contradicted
// themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAnswer } from './answers.mjs';
import { blockingConflicts, conflicts, holdsSensitiveData, normalizeItem } from './conflicts.mjs';
import { emptyDraft } from './draft.mjs';
import { conflicting, readyContract, scenario } from './fixtures/index.mjs';

/** @type {(edit: (c: any) => void) => any} */
function broken(edit) {
  const copy = structuredClone(readyContract);
  edit(copy);
  return copy;
}

/** Every answer of a scenario, applied in order. @type {(id: string) => any} */
function play(id) {
  const script = scenario(id);
  assert.ok(script !== null, `no such scenario: ${id}`);
  return script.answers.reduce((draft, answer) => applyAnswer(draft, answer.questionId, answer.text).draft, emptyDraft(script.path));
}

test('conflicts · a contract that agrees with itself reports nothing', () => {
  assert.deepEqual(conflicts(readyContract), []);
  for (const value of [null, undefined, 7, 'contract']) assert.deepEqual(conflicts(value), []);
});

test('conflicts · the same item in and out of scope is BLOCKING', () => {
  const found = conflicts(conflicting);
  const scope = found.find((c) => c.kind === 'scope-overlap');
  assert.ok(scope !== undefined, 'the conflicting fixture overlaps its own scope');
  assert.equal(scope.severity, 'blocking');
  assert.deepEqual(scope.fields, ['scope.in', 'scope.out']);
  assert.equal(blockingConflicts(conflicting).length, 1);
});

test('conflicts · the overlap is judged by meaning, not by punctuation and case', () => {
  const dressed = broken((c) => { c.scope.out = [{ value: '  Add an ITEM! ', status: 'DECLARED' }]; });
  assert.deepEqual(conflicts(dressed).map((c) => c.kind), ['scope-overlap']);
  assert.equal(normalizeItem('  Add an ITEM! '), normalizeItem('add an item'));
  assert.equal(normalizeItem('Reunião'), 'reuniao');
});

test('conflicts · an approved technology a decision rejected is BLOCKING', () => {
  const contradicted = broken((c) => {
    c.decisions = [{
      id: 'D1', question: 'Which runtime?', proposal: 'Node.js', status: 'rejected', at: '2026-10-04T10:00:00Z',
    }];
  });
  const found = conflicts(contradicted);
  assert.deepEqual(found.map((c) => c.kind), ['technology-approved-and-rejected']);
  assert.equal(found[0]?.severity, 'blocking');
  assert.deepEqual(found[0]?.fields, ['technologies.approved', 'decisions']);
  // The same decision, still pending, is a question and not yet a contradiction.
  const pending = structuredClone(contradicted);
  pending.decisions[0].status = 'pending';
  assert.deepEqual(conflicts(pending), []);
});

test('conflicts · sensitive data with no constraint is REVIEW, not a refusal', () => {
  const draft = play('sensitive-data');
  assert.equal(holdsSensitiveData(draft.contract), true);
  const found = conflicts(draft.contract);
  const gap = found.find((c) => c.kind === 'sensitive-data-without-constraint');
  assert.ok(gap !== undefined, 'health records with no recorded constraint must be surfaced');
  assert.equal(gap.severity, 'review');
  assert.deepEqual(gap.fields, ['security.sensitiveData', 'security.constraints']);
  assert.deepEqual(blockingConflicts(draft.contract), []);
});

test('conflicts · one recorded constraint closes the security gap', () => {
  const guarded = broken((c) => {
    c.security.sensitiveData = { value: 'Health records of the people seen.', status: 'DECLARED' };
    c.security.constraints = [{ value: 'Never leaves the practice network.', status: 'DECLARED' }];
  });
  assert.deepEqual(conflicts(guarded), []);
});

test('conflicts · "no" means no: a stated absence raises no security gap', () => {
  for (const answer of ['No. Only the names of groceries.', 'none', 'Nothing personal', 'nao', 'not really']) {
    const said = broken((c) => { c.security.sensitiveData = { value: answer, status: 'DECLARED' }; });
    assert.equal(holdsSensitiveData(said), false, `"${answer}" states there is no sensitive data`);
    assert.deepEqual(conflicts(said), []);
  }
});

test('conflicts · an UNKNOWN or PROPOSED security answer is not a conflict', () => {
  // It is a readiness blocker and an open question. Treating it as a contradiction would
  // report two problems for one unanswered question.
  const unanswered = broken((c) => { c.security.sensitiveData = { value: '', status: 'UNKNOWN', basis: 'not yet asked' }; });
  assert.equal(holdsSensitiveData(unanswered), false);
  assert.deepEqual(conflicts(unanswered), []);
  const guessed = broken((c) => { c.security.sensitiveData = { value: 'probably names', status: 'PROPOSED', basis: 'recommendation:sensitive-data' }; });
  assert.equal(holdsSensitiveData(guessed), false);
});

test('conflicts · the same item twice in one list is REVIEW, and is never deduplicated', () => {
  const repeated = broken((c) => {
    c.scope.in = [{ value: 'add an item', status: 'DECLARED' }, { value: 'Add an item', status: 'DECLARED' }];
  });
  const found = conflicts(repeated);
  assert.deepEqual(found.map((c) => c.kind), ['duplicate-entry']);
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(found[0]?.fields, ['scope.in']);
  assert.equal(repeated.scope.in.length, 2, 'the repetition is reported, not removed');
});

test('conflicts · the order is deterministic and the contract is never touched', () => {
  const messy = broken((c) => {
    c.scope.out = [{ value: 'add an item', status: 'DECLARED' }];
    c.acceptance = [...c.acceptance, c.acceptance[0]];
    c.security.sensitiveData = { value: 'Names and addresses of members.', status: 'DECLARED' };
  });
  const before = JSON.stringify(messy);
  const kinds = conflicts(messy).map((c) => c.kind);
  assert.deepEqual(kinds, ['scope-overlap', 'sensitive-data-without-constraint', 'duplicate-entry']);
  assert.deepEqual(conflicts(messy).map((c) => c.kind), kinds, 'the same contract gives the same answer twice');
  assert.equal(JSON.stringify(messy), before, 'conflicts() resolves nothing');
});
