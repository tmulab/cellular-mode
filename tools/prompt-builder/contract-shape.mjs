// contract-shape.mjs — the two constructors of the contract: one ENTRY and one EMPTY
// CONTRACT. PURE: no clock, no filesystem, no randomness.
//
// The invariants live HERE and nowhere else, because an epistemic label is only worth
// something if it cannot be produced carelessly:
//   * UNKNOWN carries no value. A remembered half-answer under an UNKNOWN label is how a
//     guess becomes a fact two sessions later, so the value is dropped, not kept.
//   * every status but DECLARED needs a basis — evidence path, reasoning or recommendation
//     source. DECLARED needs none: the human said it, and that is the basis.
//   * 500 characters is the ceiling, and a longer answer is REFUSED rather than truncated.
//     Cutting someone's sentence in half and storing the half as DECLARED would be the
//     worst of the three options.
//   * control characters are stripped (newline and tab survive): the same text is later
//     quoted inside a delimited prompt block, and an escape sequence there is an injection.
import { BuilderError, CODES } from './errors.mjs';

/** @typedef {import('./types.mjs').Entry} Entry */
/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */
/** @typedef {import('./types.mjs').ProjectPath} ProjectPath */
/** @typedef {import('./types.mjs').Status} Status */

/** The five labels of the constitution, in reporting order.
 * @type {ReadonlyArray<Status>} */
export const STATUSES = Object.freeze(
  /** @type {Status[]} */ (['DECLARED', 'VERIFIED', 'INFERRED', 'PROPOSED', 'UNKNOWN']),
);

/** @type {ReadonlyArray<ProjectPath>} */
export const PROJECT_PATHS = Object.freeze(/** @type {ProjectPath[]} */ (['new', 'existing', 'resume']));

export const MAX_VALUE_LENGTH = 500;
export const NOT_ASKED = 'not yet asked';
/** @type {'cellular-mode/project-contract'} */
export const SCHEMA = 'cellular-mode/project-contract';
/** @type {1} */
export const VERSION = 1;

/** PURE. Removes every control character except newline and tab, and normalises line
 * endings so one answer has one representation.
 * @param {unknown} text @returns {string} */
export function sanitizeValue(text) {
  return String(text ?? '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

/**
 * PURE. The only way to build an Entry. Throws `BuilderError` with code `BAD_ENTRY` when an
 * invariant is broken, so a malformed entry never reaches a contract.
 * @param {unknown} value @param {Status} status @param {unknown} [basis] @returns {Entry}
 */
export function entry(value, status, basis) {
  if (!STATUSES.includes(status)) {
    throw new BuilderError(CODES.BAD_ENTRY, `status must be one of ${STATUSES.join(', ')}`);
  }
  const text = sanitizeValue(status === 'UNKNOWN' ? '' : value).trim();
  if (text.length > MAX_VALUE_LENGTH) {
    throw new BuilderError(
      CODES.BAD_ENTRY,
      `a statement must be at most ${MAX_VALUE_LENGTH} characters, got ${text.length} — say it shorter`,
    );
  }
  const why = sanitizeValue(basis).trim();
  if (status !== 'DECLARED' && why === '') {
    throw new BuilderError(CODES.BAD_ENTRY, `a ${status} statement must carry its basis`);
  }
  /** @type {Entry} */
  const out = { value: text, status };
  if (why !== '') out.basis = why;
  return out;
}

/** @type {() => Entry} */
const unknown = () => entry('', 'UNKNOWN', NOT_ASKED);

/**
 * PURE. A complete version-1 contract in which nothing is known yet: every single field
 * UNKNOWN with the basis "not yet asked", every list empty, approval refused. The shape is
 * complete on purpose — a reader never has to ask whether a key exists, only what it says.
 * @param {ProjectPath} path @returns {ProjectContract}
 */
export function emptyContract(path) {
  if (!PROJECT_PATHS.includes(path)) {
    throw new BuilderError(CODES.BAD_ENTRY, `path must be one of ${PROJECT_PATHS.join(', ')}`);
  }
  return {
    schema: SCHEMA,
    version: VERSION,
    path,
    identity: { name: unknown(), slug: '' },
    objective: unknown(),
    users: unknown(),
    problem: unknown(),
    smallestVersion: unknown(),
    scope: { in: [], out: [] },
    requirements: { functional: [], nonfunctional: [] },
    integrations: [],
    technologies: { approved: [], proposed: [] },
    security: { sensitiveData: unknown(), constraints: [] },
    environment: unknown(),
    involvement: unknown(),
    deployment: [],
    risks: [],
    openQuestions: [],
    decisions: [],
    acceptance: [],
    approval: { approved: false, at: null },
    extensions: {},
  };
}
