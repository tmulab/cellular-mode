// The only route from PROPOSED to settled, and the two representations chosen for it.
//
// Every test here passes a DEEP-FROZEN contract. That is not caution about style: these
// functions are handed the same draft by several callers in a session, and an in-place edit
// would make one caller's copy silently wrong. A frozen input turns that bug into a throw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, nextDecisionId, proposeDecision } from './decisions.mjs';
import { codeOf } from './errors.mjs';
import { readyContract } from './fixtures/index.mjs';
import { validateContract } from './validate.mjs';

const NOW = '2026-10-04T12:00:00.000Z';
const LATER = '2026-10-04T13:00:00.000Z';

/** @type {(value: any) => any} */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

/** The ready fixture with one edit, deep-frozen. @type {(edit?: (c: any) => void) => any} */
function frozen(edit) {
  const copy = structuredClone(readyContract);
  if (edit !== undefined) edit(copy);
  return deepFreeze(copy);
}

/** @type {(action: () => unknown) => string | null} */
function refusal(action) {
  try {
    action();
    return null;
  } catch (error) {
    return codeOf(error);
  }
}

test('proposeDecision · records a PENDING decision and promotes nothing', () => {
  const base = frozen();
  const out = proposeDecision(base, { question: 'Which runtime?', proposal: 'Deno', field: 'technologies.approved' }, NOW);
  assert.deepEqual(out.decisions, [{
    id: 'D1', question: 'Which runtime?', proposal: 'Deno', status: 'pending', at: NOW, field: 'technologies.approved',
  }]);
  assert.deepEqual(base.decisions, [], 'the input is untouched');
  assert.deepEqual(out.technologies, base.technologies, 'proposing changes no entry');
  assert.deepEqual(validateContract(out), { ok: true, errors: [] });
});

test('proposeDecision · ids never repeat, even after a rejection', () => {
  let contract = frozen();
  contract = deepFreeze(proposeDecision(contract, { question: 'a?', proposal: 'one' }, NOW));
  assert.equal(nextDecisionId(contract), 'D2');
  contract = deepFreeze(decide(contract, 'D1', 'rejected', LATER));
  assert.equal(nextDecisionId(contract), 'D2');
  contract = deepFreeze(proposeDecision(contract, { question: 'b?', proposal: 'two' }, LATER));
  assert.deepEqual(contract.decisions.map((/** @type {any} */ d) => d.id), ['D1', 'D2']);
});

test('proposeDecision · refuses an empty statement, an over-long one, a bad field and a bad clock', () => {
  const base = frozen();
  assert.equal(refusal(() => proposeDecision(base, { question: '  ', proposal: 'x' }, NOW)), 'BAD_ENTRY');
  assert.equal(refusal(() => proposeDecision(base, { question: 'q', proposal: '' }, NOW)), 'BAD_ENTRY');
  assert.equal(refusal(() => proposeDecision(base, { question: 'q', proposal: 'p'.repeat(501) }, NOW)), 'BAD_ENTRY');
  assert.equal(refusal(() => proposeDecision(base, { question: 'q', proposal: 'p', field: 'nowhere' }, NOW)), 'BAD_ENTRY');
  assert.equal(refusal(() => proposeDecision(base, { question: 'q', proposal: 'p' }, 'yesterday')), 'BAD_ENTRY');
});

test('decide · APPROVING a technology moves it from proposed to approved, as DECLARED', () => {
  // The representation chosen in Cell 3: the promoted entry is DECLARED (a human said yes) and
  // keeps `basis: decision:<id>` so the provenance is never lost.
  const base = frozen((c) => {
    c.technologies.proposed = [{ value: 'Deno', status: 'PROPOSED', basis: 'recommendation:technologies' }];
    c.decisions = [{ id: 'D1', question: 'Which runtime?', proposal: 'Deno', status: 'pending', at: NOW }];
  });
  const out = decide(base, 'D1', 'approved', LATER);
  assert.deepEqual(out.technologies.proposed, [], 'an approved technology no longer reads as undecided');
  assert.deepEqual(out.technologies.approved, [
    { value: 'Node.js', status: 'DECLARED' },
    { value: 'Deno', status: 'DECLARED', basis: 'decision:D1' },
  ]);
  assert.deepEqual(out.decisions[0], { id: 'D1', question: 'Which runtime?', proposal: 'Deno', status: 'approved', at: LATER });
  assert.deepEqual(validateContract(out), { ok: true, errors: [] });
  assert.equal(base.technologies.proposed.length, 1, 'the input is untouched');
});

test('decide · REJECTING withdraws the proposal and keeps the decision as the history', () => {
  // The other half of the representation: the entry is removed, because a rejected
  // recommendation left in the contract still reads as something the project might do.
  const base = frozen((c) => {
    c.technologies.proposed = [{ value: 'Deno', status: 'PROPOSED', basis: 'recommendation:technologies' }];
    c.decisions = [{ id: 'D1', question: 'Which runtime?', proposal: 'Deno', status: 'pending', at: NOW }];
  });
  const out = decide(base, 'D1', 'rejected', LATER);
  assert.deepEqual(out.technologies.proposed, []);
  assert.deepEqual(out.technologies.approved, [{ value: 'Node.js', status: 'DECLARED' }]);
  assert.deepEqual(out.decisions, [{ id: 'D1', question: 'Which runtime?', proposal: 'Deno', status: 'rejected', at: LATER }]);
  assert.deepEqual(validateContract(out), { ok: true, errors: [] });
});

test('decide · a PROPOSED entry in an ordinary list is promoted in place', () => {
  const base = frozen((c) => {
    c.risks = [{ value: 'The server may be switched off', status: 'PROPOSED', basis: 'recommendation:risks' }];
    c.decisions = [{ id: 'D1', question: 'Record this risk?', proposal: 'The server may be switched off', status: 'pending', at: NOW, field: 'risks' }];
  });
  const out = decide(base, 'D1', 'approved', LATER);
  assert.deepEqual(out.risks, [{ value: 'The server may be switched off', status: 'DECLARED', basis: 'decision:D1' }]);
});

test('decide · a draft-level proposal promotes the single field it was about', () => {
  const base = frozen((c) => {
    c.involvement = { value: '', status: 'UNKNOWN', basis: 'not yet asked' };
    c.decisions = [{ id: 'D1', question: 'How involved?', proposal: 'guided: the agent proposes, you approve', status: 'pending', at: NOW, field: 'involvement' }];
  });
  const proposal = { questionId: 'involvement', field: 'involvement', entry: { value: 'guided: the agent proposes, you approve', status: /** @type {const} */ ('PROPOSED'), basis: 'recommendation:involvement' } };
  const out = decide(base, 'D1', 'approved', LATER, proposal);
  assert.deepEqual(out.involvement, { value: 'guided: the agent proposes, you approve', status: 'DECLARED', basis: 'decision:D1' });
  assert.deepEqual(validateContract(out), { ok: true, errors: [] });
  assert.equal(base.involvement.status, 'UNKNOWN', 'the input is untouched');
});

test('decide · approving a decision that matches nothing records the verdict and invents no entry', () => {
  const base = frozen((c) => {
    c.decisions = [{ id: 'D1', question: 'Shall we?', proposal: 'something nothing holds', status: 'pending', at: NOW }];
  });
  const out = decide(base, 'D1', 'approved', LATER);
  assert.equal(out.decisions[0]?.status, 'approved');
  const { decisions: _ignored, ...restOut } = out;
  const { decisions: _also, ...restBase } = base;
  assert.deepEqual(restOut, restBase, 'nothing but the decision list changed');
});

test('decide · an INFERRED entry is never promoted by a decision', () => {
  const base = frozen((c) => {
    c.risks = [{ value: 'guessed risk', status: 'INFERRED', basis: 'read from the manifest' }];
    c.decisions = [{ id: 'D1', question: 'Record it?', proposal: 'guessed risk', status: 'pending', at: NOW, field: 'risks' }];
  });
  const out = decide(base, 'D1', 'approved', LATER);
  assert.deepEqual(out.risks, base.risks, 'only a PROPOSED entry is promotable');
  assert.equal(out.decisions[0]?.status, 'approved');
});

test('decide · refuses an unknown id, a second verdict, a nonsense verdict and a bad clock', () => {
  const base = frozen((c) => {
    c.decisions = [{ id: 'D1', question: 'q', proposal: 'p', status: 'pending', at: NOW }];
  });
  assert.equal(refusal(() => decide(base, 'D9', 'approved', LATER)), 'UNKNOWN_DECISION');
  assert.equal(refusal(() => decide(base, 'D1', /** @type {never} */ ('maybe'), LATER)), 'BAD_ENTRY');
  assert.equal(refusal(() => decide(base, 'D1', 'approved', 'soon')), 'BAD_ENTRY');
  const settled = deepFreeze(decide(base, 'D1', 'approved', LATER));
  assert.equal(refusal(() => decide(settled, 'D1', 'rejected', LATER)), 'ALREADY_DECIDED');
});
