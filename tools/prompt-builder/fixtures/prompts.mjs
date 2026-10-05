// prompts.mjs — the two inputs an export needs (an approved contract and one cell), assembled
// from the shared imagined people of scenarios.mjs. Test plumbing, not product code.
//
// WHY IT IS A FIXTURE AND NOT A HELPER INSIDE ONE TEST FILE. Three test files ask about the
// same export: its sections, its safety and its size. A helper living in whichever of them was
// written first would make the other two import a `*.test.mjs` — which the test runner would
// then execute twice. So the assembly lives here, once, beside the scenarios it replays.
//
// It calls the real `applyAnswer` and the real `proposeFirstCell` on purpose: a prompt test is
// only worth running against a contract built the way a discovery session builds one.
import { applyAnswer } from '../answers.mjs';
import { entry } from '../contract-shape.mjs';
import { emptyDraft } from '../draft.mjs';
import { appendField, setField } from '../fields.mjs';
import { proposeFirstCell } from '../first-cell.mjs';
import { scenario } from './scenarios.mjs';

/** A fixed instant: an exported prompt must be reproducible, so nothing here reads a clock. */
export const APPROVED_AT = '2026-01-01T00:00:00.000Z';

/** Every scripted answer of a scenario, applied in order.
 * @param {string} id @returns {import('../types.mjs').Draft} */
export function playScenario(id) {
  const script = scenario(id);
  if (script === null) throw new Error(`no such scenario: ${id}`);
  return script.answers.reduce(
    (draft, answer) => applyAnswer(draft, answer.questionId, answer.text).draft,
    emptyDraft(script.path),
  );
}

/** @type {(contract: any, slug: string) => any} a discovery script says nothing about identity */
const identified = (contract, slug) => setField(
  setField(contract, 'identity.name', entry(slug, 'DECLARED')), 'identity.slug', slug,
);

/** @type {(contract: any) => any} */
export const approve = (contract) => setField(
  contract, 'approval', { approved: true, at: APPROVED_AT },
);

/**
 * An exportable pair for a scenario. `implementation` fills in the three things that make a
 * contract actionable, so hostile answer text travels as far as a cell boundary — the strictest
 * case for the injection tests.
 * @param {string} id
 * @param {{ approved?: boolean, implementation?: boolean }} [options]
 * @returns {{ contract: any, cell: any, proposal: any }}
 */
export function exportable(id, options = {}) {
  const draft = playScenario(id);
  let contract = identified(draft.contract, id);
  if (options.implementation === true) {
    contract = setField(contract, 'security.sensitiveData', entry('No.', 'DECLARED'));
    contract = appendField(contract, 'technologies.approved', [entry('Node.js', 'DECLARED')]);
    contract = appendField(contract, 'acceptance', [entry('the one real item works', 'DECLARED')]);
  }
  if (options.approved !== false) contract = approve(contract);
  const proposal = proposeFirstCell(contract, { draftProposals: draft.proposals });
  return { contract, cell: proposal.cell, proposal };
}
