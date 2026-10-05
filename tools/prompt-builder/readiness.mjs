// readiness.mjs — "may this contract be approved yet, and what is still open?" PURE and
// TOTAL. It answers a DIFFERENT question from validate.mjs: a contract can be perfectly valid
// and nowhere near approvable, and conflating the two would make an unfinished draft look
// broken instead of unfinished.
//
// The blocker list is exactly the "Required to approve" column of prompt-builder/CONTRACTS.md,
// in one place, so the column and the code cannot disagree:
//   schema validity · identity.name and a slug · objective not UNKNOWN · scope.in ≥ 1 ·
//   security.sensitiveData not UNKNOWN · acceptance ≥ 1 · no blocking conflict.
// Everything else in the contract may be UNKNOWN at approval time. That is the point: an
// honest "we do not know yet" is an approvable state, and a guess dressed as an answer is not.
//
// `openQuestions` is DERIVED and never hand-edited (CONTRACTS.md). It is rebuilt from the
// contract on demand, with ids Q1… assigned in a fixed traversal order, so the same contract
// always produces the same list and a diff of the file shows a change of substance rather than
// a reshuffle. Three sources, in this order: entries that are UNKNOWN, decisions still
// pending, and `review` conflicts (a gap the human should be asked about, not refused for).
import { entriesAt } from './fields.mjs';
import { slugify } from '../cellmode/slug.mjs';
import { conflicts } from './conflicts.mjs';
import { QUESTIONS } from './questions.mjs';
import { validateContract } from './validate.mjs';
import { FIELD_KINDS, at, isRecord, rec } from './validate-parts.mjs';

/** @typedef {import('./types.mjs').Blocker} Blocker */
/** @typedef {import('./types.mjs').OpenQuestion} OpenQuestion */
/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */
/** @typedef {import('./types.mjs').Readiness} Readiness */

/** The question bank's own wording wherever it has one: the human has already read that
 * sentence once, and a second phrasing of the same question reads as a second question.
 * @param {string} field @returns {string} */
export function questionFor(field) {
  const asked = QUESTIONS.find((question) => question.field === field);
  return asked === undefined ? `What should "${field}" say?` : asked.prompt;
}

/** @type {(contract: unknown, path: string) => import('./types.mjs').Entry[]} */
const entriesOf = (contract, path) => (at(contract, path) === undefined
  ? []
  : entriesAt(/** @type {ProjectContract} */ (contract), path));

/**
 * PURE and TOTAL. The open questions this contract implies, with deterministic ids Q1….
 * @param {unknown} contract @returns {OpenQuestion[]}
 */
export function deriveOpenQuestions(contract) {
  /** @type {{ question: string, field: string }[]} */
  const raw = [];
  for (const path of Object.keys(FIELD_KINDS)) {
    for (const entry of entriesOf(contract, path)) {
      if (entry.status === 'UNKNOWN') raw.push({ question: questionFor(path), field: path });
    }
  }
  const decisions = at(contract, 'decisions');
  if (Array.isArray(decisions)) {
    for (const decision of decisions) {
      if (!isRecord(decision) || rec(decision).status !== 'pending') continue;
      const { question, proposal, field } = rec(decision);
      raw.push({
        question: `${String(question)} (proposed: ${String(proposal)}) — approve or reject it`,
        field: typeof field === 'string' ? field : 'decisions',
      });
    }
  }
  for (const conflict of conflicts(contract)) {
    if (conflict.severity !== 'review') continue;
    raw.push({ question: conflict.message, field: conflict.fields[0] ?? 'security' });
  }
  return raw.map((item, i) => ({ id: `Q${i + 1}`, question: item.question, field: item.field }));
}

/** A required field is STATED only when something DECLARED or VERIFIED stands in it. Not
 * `isAnswered`: that is satisfied by any non-UNKNOWN entry, and a PROPOSED recommendation is
 * not an answer — approving a contract on the strength of its own suggestions is precisely the
 * move the epistemic labels exist to prevent. An INFERRED entry is no better.
 * @type {(out: Blocker[], contract: unknown) => void} */
function requiredFields(out, contract) {
  /** @type {(path: string) => boolean} */
  const answered = (path) => entriesOf(contract, path)
    .some((e) => e.status === 'DECLARED' || e.status === 'VERIFIED');
  if (!answered('identity.name')) out.push({ field: 'identity.name', reason: 'the project has no name yet' });
  const slug = at(contract, 'identity.slug');
  if (typeof slug !== 'string' || slug === '' || slugify(slug) !== slug) {
    out.push({ field: 'identity.slug', reason: 'the project needs a slug, in cellmode form (lower case, digits, single hyphens)' });
  }
  if (!answered('objective')) out.push({ field: 'objective', reason: 'the objective is still UNKNOWN — nothing can be scoped from it' });
  if (!answered('scope.in')) out.push({ field: 'scope.in', reason: 'the scope needs at least one stated item' });
  if (!answered('security.sensitiveData')) {
    out.push({ field: 'security.sensitiveData', reason: 'whether the project holds sensitive data must be answered, even if the answer is "none"' });
  }
  if (!answered('acceptance')) out.push({ field: 'acceptance', reason: 'approval needs at least one acceptance criterion' });
}

/**
 * PURE and TOTAL. What stops `contract` from being approved, and what is still open. Schema
 * errors come FIRST and as blockers of their own: an invalid contract is not "almost ready",
 * and reporting a missing objective inside a file whose shape is broken is noise.
 * @param {unknown} contract @returns {Readiness}
 */
export function readiness(contract) {
  /** @type {Blocker[]} */
  const blockers = [];
  const schema = validateContract(contract);
  for (const error of schema.errors) blockers.push({ field: error.path, reason: error.message });
  if (schema.ok) {
    requiredFields(blockers, contract);
    for (const conflict of conflicts(contract)) {
      if (conflict.severity === 'blocking') blockers.push({ field: conflict.fields.join(' + '), reason: conflict.message });
    }
  }
  return { ready: blockers.length === 0, blockers, openQuestions: deriveOpenQuestions(contract) };
}
