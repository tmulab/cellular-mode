// proposals.mjs — the PROPOSED recommendations a draft is holding, as data. PURE: no clock,
// no filesystem, nothing mutated.
//
// WHY A MODULE OF ITS OWN. A recommendation is recorded in one of two places (types.mjs says
// which, and why): inside the contract, as a PROPOSED entry in the list the question names, or
// at draft level, for a single-Entry field whose UNKNOWN value must stay empty. Every reader
// that wants to SHOW a recommendation, or to promote one, needs both places — and a second
// walk written at the call site is how `status` and `decide` end up disagreeing about which
// suggestions exist. So the walk lives here, once, and returns values.
//
// THE PROVENANCE IS A PREFIX, NOT A GUESS. `answers.mjs` records a recommendation with
// `basis: "recommendation:<questionId> — assumes …; trade-off: …"`. That prefix is how a
// recorded proposal is found again from the question it came from, which is what lets a human
// accept their own tool's suggestion without retyping it.
import { entriesAt } from './fields.mjs';
import { PROPOSED_LABEL, inertText } from './sanitize.mjs';
import { FIELD_KINDS } from './validate-parts.mjs';

/** @typedef {import('./types.mjs').Draft} Draft */
/** @typedef {import('./types.mjs').Entry} Entry */
/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */

/** One recorded recommendation: the question it answers (when the basis says so), the dot path
 * it is about, and the entry itself.
 * @typedef {{ questionId: string | null, field: string, entry: Entry }} Recorded */

/** The basis a recommendation carries, and the question id inside it. */
export const RECOMMENDATION = /^recommendation:([a-z0-9-]+)/;

/** PURE. The "assumes …; trade-off: …" half of a recommendation's basis, inert, or `''`.
 * @param {Entry} item @returns {string} */
export function rationale(item) {
  const basis = String(item?.basis ?? '');
  const match = RECOMMENDATION.exec(basis);
  if (match === null) return inertText(basis);
  return inertText(basis.slice(match[0].length).replace(/^\s*[—-]\s*/, ''));
}

/**
 * PURE. Every PROPOSED recommendation this draft holds, contract entries first and in contract
 * order, then the draft-level ones. Nothing is filtered by question: a proposal with no
 * provenance in its basis is still shown, because hiding it would hide a suggestion the human
 * is being asked to live with.
 * @param {Draft} draft @returns {Recorded[]}
 */
export function recordedProposals(draft) {
  const contract = /** @type {ProjectContract} */ (draft?.contract);
  /** @type {Recorded[]} */
  const out = [];
  if (contract !== undefined && contract !== null) {
    for (const field of Object.keys(FIELD_KINDS)) {
      for (const item of entriesAt(contract, field)) {
        if (item.status !== 'PROPOSED') continue;
        const match = RECOMMENDATION.exec(String(item.basis ?? ''));
        out.push({ questionId: match === null ? null : String(match[1]), field, entry: item });
      }
    }
  }
  for (const item of Array.isArray(draft?.proposals) ? draft.proposals : []) {
    out.push({ questionId: item.questionId, field: item.field, entry: item.entry });
  }
  return out;
}

/** PURE. The recommendation recorded for `questionId`, or `null`. The first match wins, and
 * there is at most one: a question is answered once.
 * @param {Draft} draft @param {unknown} questionId @returns {Recorded | null} */
export function proposalFor(draft, questionId) {
  const wanted = String(questionId ?? '');
  return recordedProposals(draft).find((item) => item.questionId === wanted) ?? null;
}

/**
 * PURE. The proposals as the human reads them: the TEXT, labelled PROPOSED, with what it
 * assumes and what it costs, and the one command that accepts it. Every value crosses
 * `inertText` here, so a recommendation printed in a terminal cannot become structure.
 * @param {Draft} draft @returns {string[]}
 */
export function proposalLines(draft) {
  return recordedProposals(draft).flatMap((item) => {
    const why = rationale(item.entry);
    const how = item.questionId === null
      ? `decide propose --question "…" --proposal "…" --field ${item.field}`
      : `decide accept-proposal ${item.questionId} --confirm`;
    return [
      `  - ${item.field} · ${PROPOSED_LABEL} ${inertText(item.entry.value)}`,
      ...(why === '' ? [] : [`      ${why}`]),
      `      accept it: ${how}`,
    ];
  });
}
