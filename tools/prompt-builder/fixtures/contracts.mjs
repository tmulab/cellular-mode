// contracts.mjs — contract fixtures that are deliberately WRONG, as data.
//
// They are typed `unknown` on purpose. A validator is only worth running against values the
// type checker would have refused, so these are built by hand and never through
// `contract-shape.entry()` — that constructor exists precisely to make them impossible.
//
// `invalidContract` breaks the epistemic rules (a status that does not exist, a VERIFIED
// statement with no basis, an UNKNOWN statement that still carries a value). `conflicting` is
// well-formed and CONTRADICTORY: the same item in scope and out of scope, a technology both
// approved and rejected, sensitive data declared with no constraint. The difference matters —
// the first is an error, the second is a question for the human, and a validator that mixes
// them up auto-resolves a decision that was never anybody's to make.

/** A contract whose entries break the entry invariants. @type {unknown} */
export const invalidContract = Object.freeze({
  schema: 'cellular-mode/project-contract',
  version: 1,
  path: 'new',
  identity: { name: { value: 'half-filled', status: 'CONFIRMED' }, slug: 'half-filled' },
  objective: { value: 'Ship something', status: 'VERIFIED' },
  users: { value: 'somebody', status: 'UNKNOWN', basis: 'not yet asked' },
  problem: { value: '', status: 'DECLARED' },
  smallestVersion: { value: 'later', status: 'INFERRED' },
  scope: { in: [{ value: 'one thing', status: 'PROPOSED' }], out: [] },
  requirements: { functional: [], nonfunctional: [] },
  integrations: [],
  technologies: { approved: [{ value: 'Rust', status: 'INFERRED', basis: 'it feels right' }], proposed: [] },
  security: { sensitiveData: { value: '', status: 'UNKNOWN', basis: 'not yet asked' }, constraints: [] },
  environment: { value: '', status: 'UNKNOWN', basis: 'not yet asked' },
  involvement: { value: '', status: 'UNKNOWN', basis: 'not yet asked' },
  deployment: [],
  risks: [],
  openQuestions: [],
  decisions: [],
  acceptance: [],
  approval: { approved: true, at: null },
  extensions: { notAnExtensionName: true },
});

/** @type {(value: string) => { value: string, status: string }} */
const declared = (value) => ({ value, status: 'DECLARED' });

/** A well-formed contract that contradicts itself. @type {unknown} */
export const conflicting = Object.freeze({
  schema: 'cellular-mode/project-contract',
  version: 1,
  path: 'new',
  identity: { name: declared('shared-calendar'), slug: 'shared-calendar' },
  objective: declared('A shared calendar for two households.'),
  users: declared('Two families.'),
  problem: declared('Nobody knows who is collecting the children.'),
  smallestVersion: declared('One week visible to both households.'),
  scope: {
    in: [declared('weekly view'), declared('reminders by e-mail')],
    out: [declared('reminders by e-mail')],
  },
  requirements: { functional: [], nonfunctional: [] },
  integrations: [],
  technologies: {
    approved: [declared('Python')],
    proposed: [{ value: 'Python: rejected, the team only knows JavaScript', status: 'PROPOSED', basis: 'decision:D1' }],
  },
  security: { sensitiveData: declared("children's names and daily whereabouts"), constraints: [] },
  environment: declared('A small server at home.'),
  involvement: declared('Approve each decision.'),
  deployment: [],
  risks: [],
  openQuestions: [],
  decisions: [{ id: 'D1', question: 'Which language?', proposal: 'JavaScript', status: 'pending', at: null }],
  acceptance: [declared('Both households see the same week.')],
  approval: { approved: false, at: null },
  extensions: {},
});

/** The baseline for every approval test (Cell 3): valid, ready, contradiction-free, and fit to
 * publish. Each test breaks exactly ONE thing in a copy of it, so a failure names the rule it
 * broke instead of a pile of unrelated blockers. Everything in it is DECLARED, which is also
 * the point: nothing here is approvable on the strength of the tool's own suggestions.
 * @type {unknown} */
export const readyContract = Object.freeze({
  schema: 'cellular-mode/project-contract',
  version: 1,
  path: 'new',
  identity: { name: declared('shared-shopping-list'), slug: 'shared-shopping-list' },
  objective: declared('A shopping list two people can edit from their own phones.'),
  users: declared('Two people in one household.'),
  problem: declared('We both buy the same milk because neither knows what the other bought.'),
  smallestVersion: declared('One list: add an item, tick it off.'),
  scope: {
    in: [declared('add an item'), declared('tick an item off')],
    out: [declared('prices and budgets')],
  },
  requirements: { functional: [], nonfunctional: [] },
  integrations: [],
  technologies: { approved: [declared('Node.js')], proposed: [] },
  security: { sensitiveData: declared('No. Only the names of groceries.'), constraints: [] },
  environment: declared('A phone browser on the home network.'),
  involvement: declared('Approve each step.'),
  deployment: [],
  risks: [],
  openQuestions: [],
  decisions: [],
  acceptance: [declared('Both phones show the same list after one of us changes it.')],
  approval: { approved: false, at: null },
  extensions: {},
});

/** @type {ReadonlyArray<{ id: string, about: string, contract: unknown }>} */
export const CONTRACT_FIXTURES = Object.freeze([
  { id: 'invalid-contract', about: 'statuses and bases that break the entry invariants', contract: invalidContract },
  { id: 'conflicting', about: 'well-formed but self-contradictory', contract: conflicting },
  { id: 'ready', about: 'valid, ready to approve, and fit to publish', contract: readyContract },
]);
