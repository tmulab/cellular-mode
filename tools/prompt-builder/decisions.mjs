// decisions.mjs — the only route from PROPOSED to settled. PURE: no clock (the caller passes
// `now`), no filesystem, and the contract handed in is never mutated.
//
// HOW AN APPROVAL IS REPRESENTED (decided in Stage 6, Cell 3; the schema accepts exactly this
// and validate.mjs enforces it).
// An approved decision promotes the PROPOSED entry it was about to:
//     { value: <the proposal>, status: 'DECLARED', basis: 'decision:<id>' }
// DECLARED, because a human read the proposal and said yes — that is precisely what DECLARED
// means, and leaving it PROPOSED would make an approved choice indistinguishable from a
// pending suggestion in every prompt exported afterwards. The basis keeps the provenance, so
// the contract never loses the fact that this statement began as a recommendation: a reader
// (or a reviewer, or the next session) can follow `decision:<id>` to the question, the
// proposal and the instant it was approved. The alternative — inventing a sixth label such as
// APPROVED — was rejected: the constitution has five labels, and a tool does not get to add
// one.
// For `technologies`, approval also MOVES the entry: out of `technologies.proposed`, into
// `technologies.approved`. The two lists mean different things, and an approved technology
// that stayed in `proposed` would be read as undecided.
//
// HOW A REJECTION IS REPRESENTED (same decision).
// The PROPOSED entry is REMOVED from the list it sat in, and the Decision record — now
// `status: 'rejected'` with its instant — is the history. Marking the entry instead (a basis
// suffix, a sixth status) was rejected for two reasons: a rejected recommendation left in the
// contract still reads as something the project might do, and the decision list is already the
// append-only record of what was asked and answered. Nothing is lost: `decisions` keeps the
// question, the proposal, the verdict and the time.
//
// A decision whose proposal matches NO entry (the recommendation lived in the draft, or the
// field has since been answered) only records the verdict. Approving never invents an entry.
import { MAX_VALUE_LENGTH, entry, sanitizeValue } from './contract-shape.mjs';
import { BuilderError, CODES } from './errors.mjs';
import { getField, setField } from './fields.mjs';
import { normalizeItem } from './conflicts.mjs';
import { DECISION_STATUSES, FIELD_KINDS, ISO_8601 } from './validate-parts.mjs';

/** @typedef {import('./types.mjs').Decision} Decision */
/** @typedef {import('./types.mjs').Entry} Entry */
/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */
/** @typedef {import('./types.mjs').Proposal} Proposal */

/** @type {(now: unknown) => string} */
function instant(now) {
  const text = String(now ?? '');
  if (!ISO_8601.test(text)) throw new BuilderError(CODES.BAD_ENTRY, 'a decision records an ISO-8601 instant');
  return text;
}

/** @type {(contract: ProjectContract) => Decision[]} */
const decisionsOf = (contract) => (Array.isArray(contract.decisions) ? contract.decisions : []);

/** PURE. The next free decision id: one past the highest number already used, so an id is
 * never reused even after a decision is rejected.
 * @param {ProjectContract} contract @returns {string} */
export function nextDecisionId(contract) {
  const highest = decisionsOf(contract).reduce((/** @type {number} */ top, decision) => {
    const match = /^D(\d+)$/.exec(String(decision?.id ?? ''));
    return match === null ? top : Math.max(top, Number(match[1]));
  }, 0);
  return `D${highest + 1}`;
}

/** @type {(text: unknown, what: string) => string} */
function statement(text, what) {
  const clean = sanitizeValue(text).trim();
  if (clean === '') throw new BuilderError(CODES.BAD_ENTRY, `a decision needs its ${what}`);
  if (clean.length > MAX_VALUE_LENGTH) {
    throw new BuilderError(CODES.BAD_ENTRY, `a decision's ${what} must be at most ${MAX_VALUE_LENGTH} characters`);
  }
  return clean;
}

/**
 * PURE. Records a new PENDING decision and returns a NEW contract. Nothing is promoted: a
 * proposal put to the human is not a proposal the human accepted.
 * @param {ProjectContract} contract
 * @param {{ question: unknown, proposal: unknown, field?: unknown }} about
 * @param {unknown} now @returns {ProjectContract}
 */
export function proposeDecision(contract, about, now) {
  const at = instant(now);
  /** @type {Decision} */
  const decision = {
    id: nextDecisionId(contract),
    question: statement(about.question, 'question'),
    proposal: statement(about.proposal, 'proposal'),
    status: 'pending',
    at,
  };
  if (about.field !== undefined) {
    const field = String(about.field);
    if (!(field in FIELD_KINDS)) throw new BuilderError(CODES.BAD_ENTRY, `no such contract field: ${field}`);
    decision.field = field;
  }
  return setField(contract, 'decisions', [...decisionsOf(contract), decision]);
}

/** Where a PROPOSED entry matching `proposal` sits: a field path and an index, or null.
 * @type {(contract: ProjectContract, proposal: string, hint: string | undefined)
 *   => { field: string, index: number } | null} */
function locateProposed(contract, proposal, hint) {
  const key = normalizeItem(proposal);
  const paths = hint === undefined ? Object.keys(FIELD_KINDS) : [hint];
  for (const field of paths) {
    const node = getField(contract, field);
    if (Array.isArray(node)) {
      const index = node.findIndex((item) => item?.status === 'PROPOSED' && normalizeItem(item?.value) === key);
      if (index >= 0) return { field, index };
    } else if (node !== null && typeof node === 'object') {
      const single = /** @type {Entry} */ (node);
      if (single.status === 'PROPOSED' && normalizeItem(single.value) === key) return { field, index: -1 };
    }
  }
  return null;
}

/** @type {(contract: ProjectContract, id: string, found: { field: string, index: number },
 *   value: string) => ProjectContract} */
function promote(contract, id, found, value) {
  const promoted = entry(value, 'DECLARED', `decision:${id}`);
  if (found.index < 0) return setField(contract, found.field, promoted);
  const list = /** @type {Entry[]} */ (getField(contract, found.field)).slice();
  if (found.field.endsWith('.proposed')) {
    const target = `${found.field.slice(0, -'.proposed'.length)}.approved`;
    list.splice(found.index, 1);
    const approved = /** @type {Entry[]} */ (getField(contract, target)) ?? [];
    return setField(setField(contract, found.field, list), target, [...approved, promoted]);
  }
  list[found.index] = promoted;
  return setField(contract, found.field, list);
}

/** @type {(contract: ProjectContract, found: { field: string, index: number }) => ProjectContract} */
function withdraw(contract, found) {
  if (found.index < 0) return contract;
  const list = /** @type {Entry[]} */ (getField(contract, found.field)).slice();
  list.splice(found.index, 1);
  return setField(contract, found.field, list);
}

/**
 * PURE. Settles decision `id` and returns a NEW contract. `approved` promotes the matching
 * PROPOSED entry (see the header); `rejected` withdraws it. `promotedFrom` lets a caller pass
 * the draft-level proposal the decision was about, for the single-Entry fields whose
 * recommendation never entered the contract.
 * @param {ProjectContract} contract @param {unknown} id
 * @param {'approved' | 'rejected'} verdict @param {unknown} now
 * @param {Proposal} [promotedFrom] @returns {ProjectContract}
 */
export function decide(contract, id, verdict, now, promotedFrom) {
  const at = instant(now);
  if (verdict !== 'approved' && verdict !== 'rejected') {
    throw new BuilderError(CODES.BAD_ENTRY, `a verdict is one of ${DECISION_STATUSES.slice(1).join(', ')}`);
  }
  const wanted = String(id ?? '');
  const index = decisionsOf(contract).findIndex((decision) => decision?.id === wanted);
  if (index < 0) throw new BuilderError(CODES.UNKNOWN_DECISION, `no such decision: ${wanted}`);
  const decision = /** @type {Decision} */ (decisionsOf(contract)[index]);
  if (decision.status !== 'pending') {
    throw new BuilderError(CODES.ALREADY_DECIDED, `decision ${wanted} is already ${decision.status} — record a new one instead`);
  }
  const settled = decisionsOf(contract).map((item, i) => (i === index ? { ...decision, status: verdict, at } : item));
  let out = setField(contract, 'decisions', settled);
  const fromDraft = promotedFrom !== undefined && FIELD_KINDS[promotedFrom.field] === 'entry'
    ? { field: promotedFrom.field, index: -1 }
    : null;
  const found = locateProposed(contract, decision.proposal, decision.field) ?? fromDraft;
  if (found === null) return out;
  out = verdict === 'approved'
    ? promote(out, decision.id, found, decision.proposal)
    : withdraw(out, found);
  return out;
}
