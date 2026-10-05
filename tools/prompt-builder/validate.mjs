// validate.mjs — the contract judged against its own schema. PURE and TOTAL: any value may
// be handed in, nothing is thrown, and every error is reported rather than only the first.
// The shape vocabulary lives in validate-parts.mjs; the RULES live here.
//
// THREE RULES THAT ARE NOT MERE SHAPE CHECKS:
//   * UNKNOWN carries no value, and every non-DECLARED entry carries a basis. The entry
//     constructor enforces this for entries IT built; this catches the ones an editor built.
//   * `basis: "decision:<id>"` must name a decision that EXISTS and is APPROVED. That string
//     is the only thing between a PROPOSED recommendation and a promoted fact, so a dangling
//     or still-pending reference is an error, not a detail.
//   * `technologies.approved` holds DECLARED or VERIFIED entries only — a decision-promoted
//     entry is DECLARED with `basis: "decision:<id>"` (decisions.mjs). A guess about
//     technology must never read as a settled choice.
// What this file does NOT answer: whether the contract is READY to approve (readiness.mjs) or
// whether it CONTRADICTS itself (conflicts.mjs). A valid contract can be both unready and
// self-contradictory, and merging the questions would let a validator settle a decision that
// was the human's to make. `identity.slug` is checked against cellmode's own `slugify` —
// imported, never re-implemented — so a cell proposed from this contract cannot carry a name
// the vault would rename; an EMPTY slug is legal here and a readiness blocker instead.
import { PROJECT_PATHS, SCHEMA, VERSION } from './contract-shape.mjs';
import { DRAFT_SCHEMA, DRAFT_VERSION } from './draft.mjs';
import { slugify } from '../cellmode/slug.mjs';
import {
  DECISION_BASIS, DECISION_ID, DECISION_KEYS, DECISION_STATUSES, DRAFT_KEYS, EXTENSION_KEY,
  FIELD_KINDS, ISO_8601, MAX_EXTENSION_BYTES, QUESTION_KEYS, TOP_LEVEL_KEYS, at, checkEntry,
  checkEntryList, checkPlain, container, fail, isRecord, newCtx, rec,
} from './validate-parts.mjs';
/** @typedef {import('./types.mjs').ValidationResult} ValidationResult */
/** @typedef {import('./validate-parts.mjs').Ctx} Ctx */
export { FIELD_KINDS, TOP_LEVEL_KEYS };

/** Records which decisions exist and which are approved, before any basis is judged.
 * @type {(ctx: Ctx, value: unknown) => void} */
function indexDecisions(ctx, value) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!isRecord(item) || typeof rec(item).id !== 'string') continue;
    const id = String(rec(item).id);
    ctx.known.add(id);
    if (rec(item).status === 'approved') ctx.approved.add(id);
  }
}

/** @type {(ctx: Ctx, value: unknown) => void} */
function checkDecisions(ctx, value) {
  if (!Array.isArray(value)) {
    fail(ctx, 'decisions', 'must be a list of decisions');
    return;
  }
  /** @type {Set<string>} */
  const seen = new Set();
  value.forEach((item, i) => {
    const path = `decisions[${i}]`;
    if (!container(ctx, item, path, DECISION_KEYS, false)) return;
    const node = rec(item);
    for (const key of ['id', 'question', 'proposal']) {
      if (typeof node[key] !== 'string' || String(node[key]).trim() === '') fail(ctx, `${path}.${key}`, 'must be a non-empty string');
    }
    const id = typeof node.id === 'string' ? node.id : '';
    if (id !== '' && !DECISION_ID.test(id)) fail(ctx, `${path}.id`, 'must look like D1, D2, …');
    if (id !== '' && seen.has(id)) fail(ctx, `${path}.id`, `duplicate decision id ${id}`);
    seen.add(id);
    if (typeof node.status !== 'string' || !DECISION_STATUSES.includes(/** @type {never} */ (node.status))) {
      fail(ctx, `${path}.status`, `must be one of ${DECISION_STATUSES.join(', ')}`);
    }
    if (node.at !== null && (typeof node.at !== 'string' || !ISO_8601.test(node.at))) {
      fail(ctx, `${path}.at`, 'must be an ISO-8601 instant or null');
    }
    if (node.field !== undefined && (typeof node.field !== 'string' || !(node.field in FIELD_KINDS))) {
      fail(ctx, `${path}.field`, 'must name a contract field that holds entries');
    }
  });
}

/** @type {(ctx: Ctx, value: unknown) => void} */
function checkExtensions(ctx, value) {
  if (!isRecord(value)) return fail(ctx, 'extensions', 'must be an object');
  for (const [key, item] of Object.entries(rec(value))) {
    if (!EXTENSION_KEY.test(key)) fail(ctx, `extensions.${key}`, 'an extension key must match ^x-[a-z0-9-]+$');
    checkPlain(ctx, item, `extensions.${key}`, 1);
  }
  let bytes = MAX_EXTENSION_BYTES + 1;
  try {
    bytes = Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
  } catch { /* a value JSON refuses is already reported by checkPlain */ }
  if (bytes > MAX_EXTENSION_BYTES) fail(ctx, 'extensions', `must serialise to at most ${MAX_EXTENSION_BYTES} bytes`);
}

/** The amended rule of CONTRACTS.md: nothing INFERRED, PROPOSED or UNKNOWN is an approved
 * technology. @type {(ctx: Ctx, value: unknown) => void} */
function checkTechnologiesApproved(ctx, value) {
  if (!Array.isArray(value)) return;
  value.forEach((item, i) => {
    if (!isRecord(item)) return;
    const { status, basis } = rec(item);
    const promoted = typeof basis === 'string' && DECISION_BASIS.test(basis.trim());
    if (status !== 'DECLARED' && status !== 'VERIFIED' && !promoted) {
      fail(ctx, `technologies.approved[${i}].status`,
        'an approved technology must be DECLARED, VERIFIED, or carry basis decision:<id>');
    }
  });
}

/** @type {(ctx: Ctx, value: unknown) => void} */
function checkOpenQuestions(ctx, value) {
  if (!Array.isArray(value)) {
    fail(ctx, 'openQuestions', 'must be a list of open questions');
    return;
  }
  value.forEach((item, i) => {
    const path = `openQuestions[${i}]`;
    if (!container(ctx, item, path, QUESTION_KEYS)) return;
    for (const key of QUESTION_KEYS) {
      if (typeof rec(item)[key] !== 'string') fail(ctx, `${path}.${key}`, 'must be a string');
    }
  });
}

/** @type {(ctx: Ctx, value: unknown) => void} */
function checkApproval(ctx, value) {
  if (!container(ctx, value, 'approval', ['approved', 'at'])) return;
  const { approved, at: when } = rec(value);
  if (typeof approved !== 'boolean') fail(ctx, 'approval.approved', 'must be a boolean');
  if (when !== null && (typeof when !== 'string' || !ISO_8601.test(when))) fail(ctx, 'approval.at', 'must be an ISO-8601 instant or null');
  if (approved === true && when === null) fail(ctx, 'approval.at', 'an approved contract records when it was approved');
}

/** @type {(ctx: Ctx, value: unknown) => void} */
function checkContract(ctx, value) {
  if (!container(ctx, value, 'contract', TOP_LEVEL_KEYS)) return;
  const contract = rec(value);
  if (contract.schema !== SCHEMA) fail(ctx, 'schema', `must be "${SCHEMA}"`);
  if (contract.version !== VERSION) fail(ctx, 'version', `must be ${VERSION}`);
  if (typeof contract.path !== 'string' || !PROJECT_PATHS.includes(/** @type {never} */ (contract.path))) {
    fail(ctx, 'path', `must be one of ${PROJECT_PATHS.join(', ')}`);
  }
  indexDecisions(ctx, contract.decisions);
  checkDecisions(ctx, contract.decisions);
  if (container(ctx, contract.identity, 'identity', ['name', 'slug'])) {
    const slug = rec(contract.identity).slug;
    if (typeof slug !== 'string') fail(ctx, 'identity.slug', 'must be a string');
    else if (slug !== '' && slugify(slug) !== slug) fail(ctx, 'identity.slug', 'must be a slug: lower case, digits and single hyphens');
  }
  container(ctx, contract.scope, 'scope', ['in', 'out']);
  container(ctx, contract.requirements, 'requirements', ['functional', 'nonfunctional']);
  container(ctx, contract.technologies, 'technologies', ['approved', 'proposed']);
  container(ctx, contract.security, 'security', ['sensitiveData', 'constraints']);
  for (const [path, kind] of Object.entries(FIELD_KINDS)) {
    const node = at(value, path);
    if (node === undefined) continue;
    if (kind === 'entry') checkEntry(ctx, node, path);
    else checkEntryList(ctx, node, path);
  }
  checkTechnologiesApproved(ctx, at(value, 'technologies.approved'));
  checkOpenQuestions(ctx, contract.openQuestions);
  checkApproval(ctx, contract.approval);
  checkExtensions(ctx, contract.extensions);
}

/** PURE and TOTAL. Every schema complaint about `value`, or `{ ok: true, errors: [] }`.
 * @param {unknown} value @returns {ValidationResult} */
export function validateContract(value) {
  const ctx = newCtx();
  checkContract(ctx, value);
  return { ok: ctx.errors.length === 0, errors: ctx.errors };
}

/** PURE and TOTAL. The draft file: its frame, its proposals, and the contract inside it
 * (errors prefixed `draft.`). A draft is work in progress, judged by the SAME schema but never
 * by readiness — an unfinished draft is valid, just not approvable.
 * @param {unknown} value @returns {ValidationResult} */
export function validateDraft(value) {
  const ctx = newCtx();
  if (!container(ctx, value, 'draft', DRAFT_KEYS)) return { ok: false, errors: ctx.errors };
  const draft = rec(value);
  if (draft.schema !== DRAFT_SCHEMA) fail(ctx, 'draft.schema', `must be "${DRAFT_SCHEMA}"`);
  if (draft.version !== DRAFT_VERSION) fail(ctx, 'draft.version', `must be ${DRAFT_VERSION}`);
  for (const key of ['asked', 'skipped']) {
    const list = draft[key];
    if (!Array.isArray(list) || !list.every((item) => typeof item === 'string')) {
      fail(ctx, `draft.${key}`, 'must be a list of question ids');
    }
  }
  indexDecisions(ctx, at(draft.contract, 'decisions'));
  if (!Array.isArray(draft.proposals)) fail(ctx, 'draft.proposals', 'must be a list of proposals');
  else {
    draft.proposals.forEach((item, i) => {
      const path = `draft.proposals[${i}]`;
      if (!container(ctx, item, path, ['questionId', 'field', 'entry'])) return;
      const node = rec(item);
      if (typeof node.questionId !== 'string' || node.questionId === '') fail(ctx, `${path}.questionId`, 'must be a question id');
      if (typeof node.field !== 'string' || !(node.field in FIELD_KINDS)) fail(ctx, `${path}.field`, 'must name a contract field that holds entries');
      checkEntry(ctx, node.entry, `${path}.entry`);
    });
  }
  for (const error of validateContract(draft.contract).errors) {
    ctx.errors.push({ path: `draft.${error.path}`, message: error.message });
  }
  return { ok: ctx.errors.length === 0, errors: ctx.errors };
}
