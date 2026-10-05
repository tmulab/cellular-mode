// conflicts.mjs — what the contract says twice, and differently. PURE and TOTAL.
//
// A conflict is NEVER resolved here. The whole point of the module is that the contract can
// hold a contradiction, be reported as holding it, and still be the human's to settle: an
// automatic fix would silently pick one of two things somebody said, which is exactly the
// kind of invention the epistemic labels exist to prevent.
//
// Two severities, and the difference is operational:
//   * `blocking` — approval is refused while it stands (readiness.mjs turns it into a
//     blocker). Something is both in and out of scope, or a technology is approved and
//     rejected: no prompt can be written from that without choosing for the human.
//   * `review` — reported, and raised as a recommended open question, but approval is still
//     the human's call. Sensitive data with no constraint recorded, or the same item twice in
//     one list, is a gap worth naming and not a contradiction worth refusing.
//
// ONE CASE DELIBERATELY ABSENT. "A VERIFIED fact contradicted by a DECLARED one on the same
// single field" cannot occur: a single-Entry field holds exactly one entry, so the second
// statement replaces the first rather than sitting beside it. There is nothing to detect, and
// a check that can never fire reads as coverage it does not provide.
import { entriesAt } from './fields.mjs';
import { FIELD_KINDS, at } from './validate-parts.mjs';

/** @typedef {import('./types.mjs').Conflict} Conflict */
/** @typedef {import('./types.mjs').Entry} Entry */
/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */

/** PURE. The comparison key for "the same item said twice": case, accents, punctuation and
 * spacing are presentation, not meaning. Exported because decisions.mjs matches a decision's
 * proposal against a PROPOSED entry by the same key, and two keys would drift apart.
 * @param {unknown} text @returns {string} */
export function normalizeItem(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Answers that mean "there is no sensitive data here". Written out rather than inferred: a
 * wrong guess in this direction drops a security constraint nobody asked for. */
const NO_SENSITIVE = /^(?:no|none|nothing|not|nao|nenhum|nenhuma|never)\b/;

/** PURE. Does `security.sensitiveData` say the project HOLDS sensitive data? Only a stated
 * answer counts: an UNKNOWN field is a readiness blocker, not a conflict.
 * @param {unknown} contract @returns {boolean} */
export function holdsSensitiveData(contract) {
  const field = at(contract, 'security.sensitiveData');
  if (field === null || typeof field !== 'object') return false;
  const { value, status } = /** @type {Entry} */ (field);
  if (status !== 'DECLARED' && status !== 'VERIFIED') return false;
  const normalized = normalizeItem(value);
  return normalized !== '' && !NO_SENSITIVE.test(normalized);
}

/** @type {(contract: unknown, path: string) => Entry[]} */
const listAt = (contract, path) => (Array.isArray(at(contract, path))
  ? entriesAt(/** @type {ProjectContract} */ (contract), path)
  : []);

/** @type {(out: Conflict[], contract: unknown) => void} */
function scopeOverlap(out, contract) {
  const inside = new Map(listAt(contract, 'scope.in').map((e) => [normalizeItem(e.value), e.value]));
  for (const excluded of listAt(contract, 'scope.out')) {
    const key = normalizeItem(excluded.value);
    const original = inside.get(key);
    if (key === '' || original === undefined) continue;
    out.push({
      kind: 'scope-overlap',
      severity: 'blocking',
      fields: ['scope.in', 'scope.out'],
      message: `"${original}" is both in scope and out of scope — only you can say which it is`,
    });
  }
}

/** A technology that is approved and ALSO the proposal of a decision the human rejected. The
 * rejection is the later statement and the approval contradicts it.
 * @type {(out: Conflict[], contract: unknown) => void} */
function approvedButRejected(out, contract) {
  const decisions = at(contract, 'decisions');
  if (!Array.isArray(decisions)) return;
  const rejected = new Map();
  for (const decision of decisions) {
    if (decision === null || typeof decision !== 'object') continue;
    const { status, proposal, id } = /** @type {Record<string, unknown>} */ (decision);
    if (status === 'rejected') rejected.set(normalizeItem(proposal), String(id));
  }
  for (const technology of listAt(contract, 'technologies.approved')) {
    const id = rejected.get(normalizeItem(technology.value));
    if (id === undefined) continue;
    out.push({
      kind: 'technology-approved-and-rejected',
      severity: 'blocking',
      fields: ['technologies.approved', 'decisions'],
      message: `"${technology.value}" is an approved technology, but decision ${id} rejected it`,
    });
  }
}

/** @type {(out: Conflict[], contract: unknown) => void} */
function sensitiveWithoutConstraint(out, contract) {
  if (!holdsSensitiveData(contract)) return;
  if (listAt(contract, 'security.constraints').length > 0) return;
  out.push({
    kind: 'sensitive-data-without-constraint',
    severity: 'review',
    fields: ['security.sensitiveData', 'security.constraints'],
    message: 'the project holds sensitive data and no security constraint is recorded — what must it never do with that data?',
  });
}

/** The same item twice in one list. Reported, never deduplicated: a repetition can be two
 * genuinely different things said in the same words, and that is worth a human glance.
 * @type {(out: Conflict[], contract: unknown) => void} */
function duplicates(out, contract) {
  for (const [path, kind] of Object.entries(FIELD_KINDS)) {
    if (kind !== 'entries') continue;
    /** @type {Set<string>} */
    const seen = new Set();
    for (const item of listAt(contract, path)) {
      const key = normalizeItem(item.value);
      if (key === '') continue;
      if (seen.has(key)) {
        out.push({
          kind: 'duplicate-entry',
          severity: 'review',
          fields: [path],
          message: `${path} lists "${item.value}" more than once`,
        });
      }
      seen.add(key);
    }
  }
}

/**
 * PURE and TOTAL. Every contradiction the contract carries, in a deterministic order: scope
 * first, then technology, then the security gap, then repetitions. Nothing is changed and
 * nothing is resolved.
 * @param {unknown} contract @returns {Conflict[]}
 */
export function conflicts(contract) {
  /** @type {Conflict[]} */
  const out = [];
  if (contract === null || typeof contract !== 'object') return out;
  scopeOverlap(out, contract);
  approvedButRejected(out, contract);
  sensitiveWithoutConstraint(out, contract);
  duplicates(out, contract);
  return out;
}

/** PURE. Only the conflicts that refuse approval. @param {unknown} contract @returns {Conflict[]} */
export function blockingConflicts(contract) {
  return conflicts(contract).filter((c) => c.severity === 'blocking');
}
