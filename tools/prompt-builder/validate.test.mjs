// What a hand-edited contract is allowed to be. Every case here is a value the type checker
// would have refused, which is the only kind of value a validator earns its keep against.
//
// The assertions are on PATHS, not on wording: a message is written for a person and will be
// improved, while `technologies.approved[0].status` is the contract between this module and
// every caller that reports an error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyContract, entry } from './contract-shape.mjs';
import { emptyDraft } from './draft.mjs';
import { conflicting, invalidContract, readyContract } from './fixtures/index.mjs';
import { validateContract, validateDraft } from './validate.mjs';

/** @type {(...parts: string[]) => string} */
const j = (...parts) => parts.join('');

/** @type {(value: unknown) => string[]} */
const paths = (value) => validateContract(value).errors.map((e) => e.path);

/** A copy of the ready fixture with one thing changed. @type {(edit: (c: any) => void) => any} */
function broken(edit) {
  const copy = structuredClone(readyContract);
  edit(copy);
  return copy;
}

test('validate · the constructors produce valid contracts, and so does the ready fixture', () => {
  for (const path of /** @type {const} */ (['new', 'existing', 'resume'])) {
    assert.deepEqual(validateContract(emptyContract(path)), { ok: true, errors: [] });
  }
  assert.deepEqual(validateContract(readyContract), { ok: true, errors: [] });
});

test('validate · the invalid-contract fixture is refused at every rule it breaks', () => {
  const found = paths(invalidContract);
  for (const expected of [
    'identity.name.status', // a status that does not exist
    'objective.basis', // VERIFIED with no evidence
    'users.value', // UNKNOWN that still carries a value
    'problem.value', // DECLARED but empty
    'smallestVersion.basis',
    'scope.in[0].basis',
    'technologies.approved[0].status', // INFERRED is never an approved technology
    'approval.at', // approved with no instant
    'extensions.notAnExtensionName',
  ]) {
    assert.ok(found.includes(expected), `expected an error at ${expected}, got ${found.join(', ')}`);
  }
  assert.equal(validateContract(invalidContract).ok, false);
});

test('validate · the conflicting fixture is well-formed except for its pending promotion', () => {
  // It is the CONFLICT fixture, not the invalid one; the single schema fault is deliberate and
  // is exactly the rule that matters: a basis may not name a decision nobody approved yet.
  assert.deepEqual(paths(conflicting), ['technologies.proposed[0].basis']);
});

test('validate · nothing but a version-1 contract passes the frame', () => {
  for (const value of [null, 42, 'contract', [], undefined]) {
    assert.equal(validateContract(value).ok, false);
  }
  assert.deepEqual(paths({}).includes('contract.schema'), true);
  assert.deepEqual(paths(broken((c) => { c.surprise = 1; })), ['contract.surprise']);
  assert.deepEqual(paths(broken((c) => { c.schema = 'other'; })), ['schema']);
  assert.deepEqual(paths(broken((c) => { c.version = 2; })), ['version']);
  assert.deepEqual(paths(broken((c) => { c.path = 'sideways'; })), ['path']);
});

test('validate · the entry invariants are enforced on values no constructor built', () => {
  assert.deepEqual(paths(broken((c) => { c.objective = { value: 'x', status: 'SETTLED', basis: 'somebody typed it' }; })), ['objective.status']);
  assert.deepEqual(paths(broken((c) => { c.objective = { value: 'remembered', status: 'UNKNOWN', basis: 'asked' }; })), ['objective.value']);
  assert.deepEqual(paths(broken((c) => { c.objective = { value: 'a guess', status: 'INFERRED' }; })), ['objective.basis']);
  assert.deepEqual(paths(broken((c) => { c.objective = { value: 'a'.repeat(501), status: 'DECLARED' }; })), ['objective.value']);
  assert.deepEqual(paths(broken((c) => { c.objective = { value: `a${String.fromCharCode(7)}b`, status: 'DECLARED' }; })), ['objective.value']);
  assert.deepEqual(paths(broken((c) => { c.objective = { value: 'ok', status: 'DECLARED', mood: 'sure' }; })), ['objective.mood']);
  // A newline and a tab are ordinary text in an answer and must survive.
  assert.equal(validateContract(broken((c) => { c.objective = { value: 'one\n\ttwo', status: 'DECLARED' }; })).ok, true);
});

test('validate · a list field must hold a list of entries', () => {
  assert.deepEqual(paths(broken((c) => { c.scope.in = 'add an item'; })), ['scope.in']);
  assert.deepEqual(paths(broken((c) => { c.acceptance = [{ value: '', status: 'DECLARED' }]; })), ['acceptance[0].value']);
  assert.deepEqual(paths(broken((c) => { c.risks = [null]; })), ['risks[0]']);
});

test('validate · identity.slug follows cellmode slug rules, and empty means "not named yet"', () => {
  assert.equal(validateContract(broken((c) => { c.identity.slug = ''; })).ok, true);
  assert.deepEqual(paths(broken((c) => { c.identity.slug = 'Shared List'; })), ['identity.slug']);
  assert.deepEqual(paths(broken((c) => { c.identity.slug = 'trailing-'; })), ['identity.slug']);
  assert.deepEqual(paths(broken((c) => { c.identity.slug = 42; })), ['identity.slug']);
});

test('validate · the decision shape, and ids that are unique', () => {
  /** @type {(over: Record<string, unknown>) => unknown} */
  const withDecision = (over) => broken((c) => {
    c.decisions = [{ id: 'D1', question: 'Which language?', proposal: 'Node.js', status: 'pending', at: null, ...over }];
  });
  assert.equal(validateContract(withDecision({})).ok, true);
  assert.deepEqual(paths(withDecision({ id: 'first' })), ['decisions[0].id']);
  assert.deepEqual(paths(withDecision({ status: 'maybe' })), ['decisions[0].status']);
  assert.deepEqual(paths(withDecision({ at: '2026-10-04' })), ['decisions[0].at']);
  assert.deepEqual(paths(withDecision({ question: '' })), ['decisions[0].question']);
  assert.deepEqual(paths(withDecision({ field: 'nowhere' })), ['decisions[0].field']);
  assert.deepEqual(paths(withDecision({ note: 'extra' })), ['decisions[0].note']);
  assert.equal(validateContract(withDecision({ at: '2026-10-04T11:00:00Z' })).ok, true);
  const twice = broken((c) => {
    c.decisions = [
      { id: 'D1', question: 'a', proposal: 'b', status: 'pending', at: null },
      { id: 'D1', question: 'c', proposal: 'd', status: 'pending', at: null },
    ];
  });
  assert.deepEqual(paths(twice), ['decisions[1].id']);
});

test('validate · a decision basis must name a decision that exists AND is approved', () => {
  /** @type {(status: string | null) => unknown} */
  const promoted = (status) => broken((c) => {
    c.environment = { value: 'A small server', status: 'DECLARED', basis: 'decision:D1' };
    if (status !== null) c.decisions = [{ id: 'D1', question: 'Where?', proposal: 'A small server', status, at: null }];
  });
  assert.deepEqual(paths(promoted(null)), ['environment.basis']);
  assert.deepEqual(paths(promoted('pending')), ['environment.basis']);
  assert.deepEqual(paths(promoted('rejected')), ['environment.basis']);
  assert.equal(validateContract(promoted('approved')).ok, true);
});

test('validate · technologies.approved never holds a guess', () => {
  /** @type {(status: string) => string[]} */
  const approvedWith = (status) => paths(broken((c) => {
    c.technologies.approved = [{ value: 'Rust', status, basis: 'it feels right' }];
  }));
  assert.deepEqual(approvedWith('INFERRED'), ['technologies.approved[0].status']);
  assert.deepEqual(approvedWith('PROPOSED'), ['technologies.approved[0].status']);
  assert.deepEqual(approvedWith('VERIFIED'), []);
  assert.deepEqual(approvedWith('DECLARED'), []);
  // UNKNOWN fails twice over: it is not approvable, and an UNKNOWN entry carries no value.
  assert.deepEqual(approvedWith('UNKNOWN'), ['technologies.approved[0].value', 'technologies.approved[0].status']);
});

test('validate · extensions are named, JSON-plain, shallow and small', () => {
  /** @type {(value: unknown) => unknown} */
  const ext = (value) => broken((c) => { c.extensions = value; });
  assert.equal(validateContract(ext({ 'x-house-rule': { note: 'ok', list: [1, 2] } })).ok, true);
  assert.deepEqual(paths(ext({ houseRule: true })), ['extensions.houseRule']);
  assert.deepEqual(paths(ext({ 'x-fn': () => 1 })), ['extensions.x-fn']);
  assert.deepEqual(paths(ext({ 'x-deep': { a: { b: { c: { d: { e: 1 } } } } } })), ['extensions.x-deep.a.b.c.d']);
  assert.deepEqual(paths(ext({ 'x-big': 'y'.repeat(5000) })), ['extensions']);
  assert.deepEqual(paths(ext([])), ['extensions']);
});

test('validate · approval is a boolean and an instant, together or not at all', () => {
  assert.deepEqual(paths(broken((c) => { c.approval = { approved: true, at: null }; })), ['approval.at']);
  assert.deepEqual(paths(broken((c) => { c.approval = { approved: 'yes', at: null }; })), ['approval.approved']);
  assert.deepEqual(paths(broken((c) => { c.approval = { approved: true, at: 'yesterday' }; })), ['approval.at']);
  assert.equal(validateContract(broken((c) => { c.approval = { approved: true, at: '2026-10-04T11:00:00.000Z' }; })).ok, true);
});

test('validateDraft · a fresh draft is valid, and the contract inside is judged too', () => {
  assert.deepEqual(validateDraft(emptyDraft('new')), { ok: true, errors: [] });
  for (const value of [null, 'draft', [], {}]) assert.equal(validateDraft(value).ok, false);
  const wrongSchema = { ...emptyDraft('new'), schema: j('cellular-mode', '/', 'other') };
  assert.deepEqual(validateDraft(wrongSchema).errors.map((e) => e.path), ['draft.schema']);
  const badAsked = { ...emptyDraft('new'), asked: ['objective', 7] };
  assert.deepEqual(validateDraft(badAsked).errors.map((e) => e.path), ['draft.asked']);
  const innerFault = emptyDraft('new');
  innerFault.contract.objective = /** @type {never} */ ({ value: 'x', status: 'SETTLED', basis: 'typed' });
  assert.deepEqual(validateDraft(innerFault).errors.map((e) => e.path), ['draft.objective.status']);
});

test('validateDraft · a proposal names a real field and carries a real entry', () => {
  const draft = emptyDraft('new');
  draft.proposals = [{ questionId: 'involvement', field: 'involvement', entry: entry('guided', 'PROPOSED', 'recommendation:involvement') }];
  assert.deepEqual(validateDraft(draft), { ok: true, errors: [] });
  const nowhere = { ...draft, proposals: [{ ...draft.proposals[0], field: 'nowhere' }] };
  assert.deepEqual(validateDraft(nowhere).errors.map((e) => e.path), ['draft.proposals[0].field']);
  const noBasis = { ...draft, proposals: [{ questionId: 'involvement', field: 'involvement', entry: { value: 'guided', status: 'PROPOSED' } }] };
  assert.deepEqual(validateDraft(noBasis).errors.map((e) => e.path), ['draft.proposals[0].entry.basis']);
});
