// validate-parts.mjs — the vocabulary `validate.mjs` is written in: the declared key sets,
// the field table, and the three checks that recur (a closed container, one Entry, a list of
// Entries). Split out for one reason only — a hand-written file stays under 200 lines — so
// nothing here knows what a contract IS; it only knows how to complain about a shape.
//
// Every check is PURE and TOTAL and reports through a shared context instead of throwing:
// a validator that stops at the first fault makes somebody repair a file one line per run.
import { MAX_VALUE_LENGTH, STATUSES } from './contract-shape.mjs';

/** @typedef {import('./types.mjs').ValidationError} ValidationError */

/** The closed top-level key set. Anything else is an error; projects extend `extensions`. */
export const TOP_LEVEL_KEYS = Object.freeze([
  'schema', 'version', 'path', 'identity', 'objective', 'users', 'problem', 'smallestVersion',
  'scope', 'requirements', 'integrations', 'technologies', 'security', 'environment',
  'involvement', 'deployment', 'risks', 'openQuestions', 'decisions', 'acceptance',
  'approval', 'extensions',
]);

/** Every field that holds entries, and whether it holds one or a list. Shared with
 * readiness.mjs, conflicts.mjs and publication.mjs, so a new field is declared once.
 * @type {Readonly<Record<string, 'entry' | 'entries'>>} */
export const FIELD_KINDS = Object.freeze({
  'identity.name': 'entry',
  objective: 'entry',
  users: 'entry',
  problem: 'entry',
  smallestVersion: 'entry',
  'scope.in': 'entries',
  'scope.out': 'entries',
  'requirements.functional': 'entries',
  'requirements.nonfunctional': 'entries',
  integrations: 'entries',
  'technologies.approved': 'entries',
  'technologies.proposed': 'entries',
  'security.sensitiveData': 'entry',
  'security.constraints': 'entries',
  environment: 'entry',
  involvement: 'entry',
  deployment: 'entries',
  risks: 'entries',
  acceptance: 'entries',
});

export const ENTRY_KEYS = Object.freeze(['value', 'status', 'basis']);
export const DECISION_KEYS = Object.freeze(['id', 'question', 'proposal', 'status', 'at', 'field']);
export const DECISION_STATUSES = Object.freeze(['pending', 'approved', 'rejected']);
export const QUESTION_KEYS = Object.freeze(['id', 'question', 'field']);
export const DRAFT_KEYS = Object.freeze(['schema', 'version', 'contract', 'asked', 'skipped', 'proposals']);
/** Control characters, except the tab and the newline an answer may legitimately contain. */
export const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;
export const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
export const DECISION_ID = /^D\d+$/;
export const DECISION_BASIS = /^decision:(D\d+)$/;
export const EXTENSION_KEY = /^x-[a-z0-9-]+$/;
export const MAX_EXTENSION_BYTES = 4096;
export const MAX_EXTENSION_DEPTH = 4;

/** @type {(value: unknown) => boolean} */
export const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @type {(value: unknown) => Record<string, unknown>} */
export const rec = (value) => /** @type {Record<string, unknown>} */ (value);

/** What a validation run carries: the errors so far, and which decisions exist and are
 * approved (a `decision:<id>` basis is judged against these).
 * @typedef {{ errors: ValidationError[], approved: Set<string>, known: Set<string> }} Ctx */

/** @returns {Ctx} */
export const newCtx = () => ({ errors: [], approved: new Set(), known: new Set() });

/** @type {(ctx: Ctx, path: string, message: string) => void} */
export const fail = (ctx, path, message) => { ctx.errors.push({ path, message }); };

/** PURE. A closed-key-set container. `required` also demands every declared key be present.
 * @param {Ctx} ctx @param {unknown} value @param {string} path
 * @param {ReadonlyArray<string>} keys @param {boolean} [required] @returns {boolean} */
export function container(ctx, value, path, keys, required = true) {
  if (!isRecord(value)) {
    fail(ctx, path, 'must be an object');
    return false;
  }
  for (const key of Object.keys(rec(value))) {
    if (!keys.includes(key)) fail(ctx, `${path}.${key}`, 'unknown key');
  }
  if (required) for (const key of keys) if (!(key in rec(value))) fail(ctx, `${path}.${key}`, 'missing');
  return true;
}

/** PURE. One Entry: closed keys, a real status, a bounded and control-free value, UNKNOWN
 * with no value, a basis wherever the status is not DECLARED, and a `decision:<id>` basis
 * that names an existing, approved decision.
 * @param {Ctx} ctx @param {unknown} value @param {string} path @returns {void} */
export function checkEntry(ctx, value, path) {
  if (!container(ctx, value, path, ENTRY_KEYS, false)) return;
  const { value: text, status, basis } = rec(value);
  if (typeof status !== 'string' || !STATUSES.includes(/** @type {never} */ (status))) {
    fail(ctx, `${path}.status`, `must be one of ${STATUSES.join(', ')}`);
  }
  if (typeof text !== 'string') fail(ctx, `${path}.value`, 'must be a string');
  else {
    if (text.length > MAX_VALUE_LENGTH) fail(ctx, `${path}.value`, `must be at most ${MAX_VALUE_LENGTH} characters`);
    if (CONTROL.test(text)) fail(ctx, `${path}.value`, 'must not contain control characters');
    if (status === 'UNKNOWN' && text !== '') fail(ctx, `${path}.value`, 'an UNKNOWN statement carries no value');
    if (status !== 'UNKNOWN' && text.trim() === '') fail(ctx, `${path}.value`, 'only an UNKNOWN statement may be empty');
  }
  const hasBasis = typeof basis === 'string' && basis.trim() !== '';
  if (basis !== undefined && !hasBasis) fail(ctx, `${path}.basis`, 'must be a non-empty string when present');
  if (hasBasis) checkDecisionBasis(ctx, String(basis).trim(), `${path}.basis`);
  if (typeof status === 'string' && status !== 'DECLARED' && !hasBasis) {
    fail(ctx, `${path}.basis`, `a ${status} statement must carry its basis`);
  }
}

/** @type {(ctx: Ctx, basis: string, path: string) => void} */
function checkDecisionBasis(ctx, basis, path) {
  const reference = DECISION_BASIS.exec(basis);
  if (reference === null) return;
  const id = /** @type {string} */ (reference[1]);
  if (!ctx.known.has(id)) fail(ctx, path, `names decision ${id}, which does not exist`);
  else if (!ctx.approved.has(id)) fail(ctx, path, `names decision ${id}, which is not approved`);
}

/** PURE. A list of Entries. @param {Ctx} ctx @param {unknown} value @param {string} path */
export function checkEntryList(ctx, value, path) {
  if (!Array.isArray(value)) {
    fail(ctx, path, 'must be a list of entries');
    return;
  }
  value.forEach((item, i) => checkEntry(ctx, item, `${path}[${i}]`));
}

/** PURE. JSON-plain, shallow and small. `extensions` is the one open door in a closed
 * schema, and an open door with no frame is a hinge for anything: no functions, no class
 * instances, bounded depth.
 * @param {Ctx} ctx @param {unknown} value @param {string} path @param {number} depth */
export function checkPlain(ctx, value, path, depth) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(ctx, path, 'must be a finite number');
    return;
  }
  if (depth > MAX_EXTENSION_DEPTH) {
    fail(ctx, path, `must not nest deeper than ${MAX_EXTENSION_DEPTH} levels`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => checkPlain(ctx, item, `${path}[${i}]`, depth + 1));
    return;
  }
  if (!isRecord(value)) {
    fail(ctx, path, 'must be JSON-plain data (no functions, no class instances)');
    return;
  }
  for (const [key, item] of Object.entries(rec(value))) checkPlain(ctx, item, `${path}.${key}`, depth + 1);
}

/** PURE. The value at a dot path, or `undefined` when any step is missing. A local copy of
 * the walk in fields.mjs, because that one is typed for a well-formed contract and this file
 * is handed values nobody has validated yet.
 * @param {unknown} source @param {string} path @returns {unknown} */
export function at(source, path) {
  return path.split('.').reduce((/** @type {unknown} */ node, key) => (isRecord(node) ? rec(node)[key] : undefined), source);
}
