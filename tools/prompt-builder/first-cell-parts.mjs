// first-cell-parts.mjs — the field-level readers the first-cell proposal is assembled from,
// split out of first-cell.mjs for the same reason validate-parts.mjs is split out of
// validate.mjs: one file says WHICH cell to propose, this one says how a contract field
// becomes one line of it. PURE and TOTAL, no clock, no filesystem.
//
// THE EPISTEMIC RULE LIVES HERE, once. A cell file is read later as a statement of fact, so
// only a DECLARED or VERIFIED entry may appear in it bare. A PROPOSED entry — including a
// recommendation the tool itself made for an UNKNOWN field, which the draft keeps out of the
// contract (see types.mjs) — appears with its label attached to the same string, so no
// renderer downstream can separate the value from the warning. An UNKNOWN field contributes
// nothing but an open issue.
import { slugify } from '../cellmode/slug.mjs';
import { normalizeItem } from './conflicts.mjs';
import { entriesAt, getField } from './fields.mjs';
import { DEFERRAL_QUESTION, TECHNOLOGY_DEFERRAL } from './questions.mjs';
import { deriveOpenQuestions } from './readiness.mjs';
import { asProposed, inertText, joinInert } from './sanitize.mjs';

/** @typedef {import('./types.mjs').Entry} Entry */
/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */
/** @typedef {import('./types.mjs').Proposal} Proposal */

/** A statement somebody stands behind. Nothing else is a fact. */
const STATED = Object.freeze(['DECLARED', 'VERIFIED']);

/** The evidence every first cell owes, whatever its kind. */
export const VERIFICATION = 'Trilateral Verification (typecheck + build + tests) with real counts';

/** What a first cell may do. Deliberately small, and never widened by a contract. */
export const ALLOWED = 'edit files inside the project; run the project gates and tests';

/** What no cell this tool proposes may ever do. */
export const PROHIBITED = 'deploy; destructive commands; publication; production data; '
  + 'handling secrets; git push';

/** How many open questions a single line carries before it points at the contract instead. */
export const MAX_ISSUES = 5;

/** @type {(contract: unknown, path: string) => Entry[]} */
function entries(contract, path) {
  if (contract === null || typeof contract !== 'object') return [];
  return entriesAt(/** @type {ProjectContract} */ (contract), path);
}

/** PURE. Every stated value at `path`, inert, in contract order. @param {unknown} contract
 * @param {string} path @param {number} [limit] @returns {string[]} */
export function statedValues(contract, path, limit = Number.MAX_SAFE_INTEGER) {
  return entries(contract, path)
    .filter((entry) => STATED.includes(entry.status))
    .map((entry) => inertText(entry.value))
    .filter((value) => value !== '')
    .slice(0, limit);
}

/** PURE. Is this entry the question bank's TECHNOLOGY DEFERRAL — "decide the stack in a first
 * cell"? Two exact recognitions, no prose matching: the provenance basis the recommendation is
 * recorded with (`recommendation:technologies`), and normalized equality with the constant
 * questions.mjs exports — which is what survives promotion, since an approved deferral reads
 * DECLARED with `basis: "decision:<id>"` and loses its provenance.
 * @param {Entry} item @returns {boolean} */
export function isDeferral(item) {
  if (String(item?.basis ?? '').startsWith(`recommendation:${DEFERRAL_QUESTION}`)) return true;
  return normalizeItem(item?.value) === normalizeItem(TECHNOLOGY_DEFERRAL);
}

/** PURE. Why the stack is NOT settled, or `null` when it is. A deferral the human approved is
 * a decision to decide later, never a stack: counting it as one made a first cell claim "the
 * stack is stated" about a contract that states no technology at all.
 * @param {unknown} contract @returns {string | null} */
export function undecidedStack(contract) {
  const stated = entries(contract, 'technologies.approved').filter((e) => STATED.includes(e.status));
  if (stated.some((item) => !isDeferral(item))) return null;
  return stated.length === 0
    ? 'no technology is stated as approved — the stack is still open'
    : 'the only approved technology entry is the recorded deferral — the stack is still undecided';
}

/** PURE. One line for `path`: the first stated value, else the first PROPOSED one with its
 * label, else the draft's recommendation for the field with its label, else `''`.
 * @param {unknown} contract @param {string} path
 * @param {ReadonlyArray<Proposal>} [proposals] @returns {string} */
export function factAt(contract, path, proposals = []) {
  const list = entries(contract, path);
  const stated = list.find((entry) => STATED.includes(entry.status));
  if (stated !== undefined && inertText(stated.value) !== '') return inertText(stated.value);
  const proposed = list.find((entry) => entry.status === 'PROPOSED');
  if (proposed !== undefined && inertText(proposed.value) !== '') return asProposed(proposed.value);
  const recommended = (Array.isArray(proposals) ? proposals : [])
    .find((item) => item !== null && typeof item === 'object' && item.field === path);
  return recommended === undefined ? '' : asProposed(recommended.entry?.value);
}

/** PURE. The questions this contract leaves open, as one line, capped so a cell file stays
 * readable and pointing at `openQuestions` for the rest.
 * @param {unknown} contract @returns {{ line: string, questions: string[] }} */
export function openIssueLine(contract) {
  const questions = deriveOpenQuestions(contract)
    .map((item) => `${item.id} ${inertText(item.question)}`);
  const shown = questions.slice(0, MAX_ISSUES);
  const rest = questions.length - shown.length;
  const tail = rest > 0 ? [`(+${rest} more, see openQuestions in the project contract)`] : [];
  return { line: [...shown, ...tail].join(' · ') || 'none recorded', questions };
}

/** PURE. The project's identity in slug characters only — the contract slug when it is one,
 * else the name put through cellmode's own `slugify`. The cell name and the INDEX row are
 * built from THIS, so no quantity of hostile text in `identity.name` can reach the index
 * table: what arrives there is `[a-z0-9-]+` by construction.
 * @param {unknown} contract @returns {string} */
export function projectLabel(contract) {
  const slug = getField(contract, 'identity.slug');
  if (typeof slug === 'string' && slug !== '' && slugify(slug) === slug) return slug;
  const name = getField(contract, 'identity.name.value');
  const fromName = slugify(typeof name === 'string' ? name : '');
  return fromName === 'cell' ? 'project' : fromName;
}

/** PURE. `scope.out` plus the sentence that keeps a first cell first.
 * @param {unknown} contract @returns {string} */
export function exclusions(contract) {
  const out = statedValues(contract, 'scope.out');
  return joinInert([...out, 'everything else in scope beyond the first cell']);
}
