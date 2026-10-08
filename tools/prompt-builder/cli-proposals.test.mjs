// The Builder's own recommendations, through the CLI: they are SHOWN wherever they are
// recorded, and they are settled without anybody retyping them.
//
// Both findings come from the adoption trial of 2026-10-07. A-05: `answer … "I don't know"`
// said a PROPOSED option had been recorded and `status` printed a count, so the only way to
// read the suggestion was to open the private draft by hand. A-06: promoting that suggestion
// meant authoring `decide propose --question … --proposal …` and retyping the Builder's own
// sentence verbatim — the one place a human quietly edits a recommendation and then approves
// something the tool never said.
//
// RULE FOR THIS FILE, as for cli.test.mjs: it writes exclusively inside the directory
// `mkdtemp` just created for it, and removes exactly that directory after a prefix check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeSkeleton } from '../cellmode/state.mjs';
import { freshRoot, runCli } from './fixtures/cli-harness.mjs';
import { TECHNOLOGY_DEFERRAL } from './questions.mjs';

const PREFIX = 'builder-proposals-';
/** @type {string[]} */
const created = [];

test.after(() => {
  for (const root of created) {
    assert.ok(root.includes(PREFIX), `refusing to remove ${root}`);
    rmSync(root, { recursive: true, force: true });
  }
});

/** A temporary root whose draft already holds one unknown-technology recommendation and one
 * draft-level recommendation (`involvement`). @returns {string} */
function rootWithProposals() {
  const root = freshRoot(PREFIX, created);
  writeSkeleton(root);
  assert.equal(runCli(['start', 'new', '--name', 'Task Board'], root).code, 0);
  assert.equal(runCli(['answer', 'technologies', 'I do not know'], root).code, 0);
  assert.equal(runCli(['answer', 'involvement', 'not sure'], root).code, 0);
  return root;
}

/** @type {(root: string) => any} */
const draftOf = (root) => JSON.parse(readFileSync(join(root, 'vault', 'builder', 'draft.json'), 'utf8'));

test('cli · the PROPOSED text is printed where it is created and by status, not just counted', () => {
  const root = freshRoot(PREFIX, created);
  writeSkeleton(root);
  runCli(['start', 'new', '--name', 'Task Board'], root);
  const answered = runCli(['answer', 'technologies', 'I do not know'], root);
  assert.equal(answered.code, 0, answered.all);
  assert.ok(answered.out.includes(`PROPOSED: ${TECHNOLOGY_DEFERRAL}`), answered.all);
  assert.match(answered.out, /assumes .+; trade-off: .+/);
  assert.match(answered.out, /decide accept-proposal technologies --confirm/);

  for (const mode of [[], ['--mode', 'tired']]) {
    const status = runCli(['status', ...mode], root);
    assert.equal(status.code, 0, status.all);
    assert.match(status.out, /Proposed, not approved \(1\):/);
    assert.ok(status.out.includes(`PROPOSED: ${TECHNOLOGY_DEFERRAL}`), `${mode.join(' ')}: ${status.all}`);
    assert.match(status.out, /assumes .+; trade-off: .+/);
  }
});

test('cli · accept-proposal promotes the recorded proposal with no retyping', () => {
  const root = rootWithProposals();
  const unconfirmed = runCli(['decide', 'accept-proposal', 'technologies'], root);
  assert.equal(unconfirmed.code, 5, unconfirmed.all);
  assert.deepEqual(draftOf(root).contract.decisions, [], 'exit 5 writes nothing');

  const accepted = runCli(['decide', 'accept-proposal', 'technologies', '--confirm'], root);
  assert.equal(accepted.code, 0, accepted.all);
  const { contract } = draftOf(root);
  assert.deepEqual(contract.technologies.proposed, [], 'an approved technology no longer reads as undecided');
  assert.deepEqual(contract.technologies.approved,
    [{ value: TECHNOLOGY_DEFERRAL, status: 'DECLARED', basis: 'decision:D1' }]);
  assert.equal(contract.decisions.length, 1);
  assert.equal(contract.decisions[0].status, 'approved');
  assert.equal(contract.decisions[0].proposal, TECHNOLOGY_DEFERRAL, 'the proposal text is the entry, not a retyping');
  assert.match(contract.decisions[0].question, /language, framework or service/);
  // A draft-level recommendation (a single-Entry field) promotes the field itself.
  assert.equal(runCli(['decide', 'accept-proposal', 'involvement', '--confirm'], root).code, 0);
  const after = draftOf(root);
  assert.equal(after.contract.involvement.status, 'DECLARED');
  assert.equal(after.contract.involvement.basis, 'decision:D2');
  assert.deepEqual(after.proposals, [], 'a promoted draft proposal is no longer pending');
});

test('cli · reject-proposal withdraws the entry and keeps the decision as the history', () => {
  const root = rootWithProposals();
  const rejected = runCli(['decide', 'reject-proposal', 'technologies', '--confirm'], root);
  assert.equal(rejected.code, 0, rejected.all);
  const { contract } = draftOf(root);
  assert.deepEqual(contract.technologies.proposed, [], 'a rejected recommendation is withdrawn');
  assert.deepEqual(contract.technologies.approved, []);
  assert.equal(contract.decisions[0].status, 'rejected');
  assert.equal(contract.decisions[0].proposal, TECHNOLOGY_DEFERRAL);
});

test('cli · a question with no recorded proposal is refused with exit 1 and writes nothing', () => {
  const root = rootWithProposals();
  const before = readFileSync(join(root, 'vault', 'builder', 'draft.json'), 'utf8');
  for (const id of ['objective', 'nothing-like-this']) {
    const refused = runCli(['decide', 'accept-proposal', id, '--confirm'], root);
    assert.equal(refused.code, 1, refused.all);
    assert.match(refused.err, /no PROPOSED recommendation is recorded for question/);
  }
  assert.equal(readFileSync(join(root, 'vault', 'builder', 'draft.json'), 'utf8'), before);
});

test('cli · next reports the waiting proposals once there is nothing left to ask', () => {
  const root = rootWithProposals();
  for (const id of ['objective', 'users', 'problem', 'smallest-version', 'scope-in', 'scope-out',
    'sensitive-data', 'environment', 'acceptance']) {
    assert.equal(runCli(['skip', id], root).code, 0, id);
  }
  const next = runCli(['next'], root);
  assert.equal(next.code, 0, next.all);
  assert.match(next.out, /No question left on this path/);
  assert.ok(next.out.includes(`PROPOSED: ${TECHNOLOGY_DEFERRAL}`), next.all);
});
