// draft.mjs — the discovery session shape: one constructor, one total check. PURE.
//
// A draft is the private scratchpad of a discovery session (`vault/builder/draft.json`,
// git-ignored). It is deliberately thin: the CONTRACT holds what is known, `asked` and
// `skipped` hold what the conversation already covered, and `proposals` holds the
// recommendations made for single-value fields that are still UNKNOWN (see types.mjs).
//
// `isDraft` is total rather than throwing: a draft is read on the way into a session, and a
// file somebody hand-edited must come back as "not a draft" instead of as an exception
// nobody caught. Deciding what to do about it belongs to the caller, not here.
import { emptyContract } from './contract-shape.mjs';

/** @typedef {import('./types.mjs').Draft} Draft */
/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */
/** @typedef {import('./types.mjs').ProjectPath} ProjectPath */

/** @type {'cellular-mode/builder-draft'} */
export const DRAFT_SCHEMA = 'cellular-mode/builder-draft';
/** @type {1} */
export const DRAFT_VERSION = 1;

/** PURE. A fresh draft for a discovery path, with nothing known and nothing asked.
 * @param {ProjectPath} path @param {ProjectContract} [contract] @returns {Draft} */
export function emptyDraft(path, contract) {
  return {
    schema: DRAFT_SCHEMA,
    version: DRAFT_VERSION,
    contract: contract ?? emptyContract(path),
    asked: [],
    skipped: [],
    proposals: [],
  };
}

/** @type {(value: unknown) => boolean} */
const isStringList = (value) => Array.isArray(value) && value.every((v) => typeof v === 'string');

/** PURE and TOTAL. Is this value a version-1 draft, as far as its frame goes? The contract
 * inside is checked by `validateContract` (a later cell), not here: one module, one claim.
 * @param {unknown} value @returns {boolean} */
export function isDraft(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = /** @type {Record<string, unknown>} */ (value);
  const contract = record.contract;
  return record.schema === DRAFT_SCHEMA
    && record.version === DRAFT_VERSION
    && typeof contract === 'object' && contract !== null && !Array.isArray(contract)
    && isStringList(record.asked)
    && isStringList(record.skipped)
    && Array.isArray(record.proposals);
}
