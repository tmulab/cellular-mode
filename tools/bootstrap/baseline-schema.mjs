// baseline-schema.mjs — the validator of `cellular-mode/adoption-baseline`, version 1.
//
// Separate from `baseline.mjs` for the reason every validator in this project is separate from its
// builder: a validator enforced only where the document is produced is a validator with a bypass.
// `vault/adoption-baseline.json` is read again by every later comparison, and it is checked then
// too, by this same function.
//
// CLOSED, RELATIVE, PUBLISHABLE — the three properties of every record Bootstrap writes. An unknown
// key is an error; `instructionFiles` and `docs` hold target-relative paths and nothing else; and
// `publicationFindings` runs over the whole document, keys as well as values, so a secret-shaped or
// machine-specific string cannot reach it through a field nobody thought about. The baseline of a
// project is committed project history, exactly like the install manifest.
import { pathProblem } from './component-parts.mjs';
import { CODES, refuse } from './errors.mjs';
import { publicationFindings } from './publication.mjs';

/** @typedef {{ path: string, message: string }} BaselineError */

export const BASELINE_SCHEMA = 'cellular-mode/adoption-baseline';
export const BASELINE_VERSION = 1;

/** The target-relative path the baseline is written to at install time. */
export const BASELINE_REL = 'vault/adoption-baseline.json';

/** The closed key set. An unknown key is an error: a record whose next version nobody can read
 * with confidence is not a baseline. */
export const BASELINE_KEYS = Object.freeze([
  'schema', 'version', 'recordedAt', 'commit', 'tree', 'clean', 'changedCount', 'languages',
  'buildSystems', 'commands', 'ci', 'hooks', 'instructionFiles', 'docs', 'securityTooling',
  'invariants', 'knownFailing', 'checkResults', 'limitations',
]);

const COMMIT = /^[0-9a-f]{40}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/** @type {(path: string, message: string) => BaselineError} */
const fail = (path, message) => ({ path, message });

/** @param {Record<string, unknown>} record @param {BaselineError[]} errors @returns {void} */
function checkPathLists(record, errors) {
  for (const key of ['instructionFiles', 'docs']) {
    const list = record[key];
    if (!Array.isArray(list)) {
      errors.push(fail(key, `${key} must be an array of target-relative paths`));
      continue;
    }
    list.forEach((value, i) => {
      const problem = pathProblem(value);
      if (problem !== null) errors.push(fail(`${key}[${i}]`, `path ${problem}`));
    });
  }
}

/** @param {Record<string, unknown>} record @param {BaselineError[]} errors @returns {void} */
function checkChecks(record, errors) {
  const list = record.checkResults;
  if (!Array.isArray(list)) {
    errors.push(fail('checkResults', 'checkResults must be an array'));
    return;
  }
  const allowed = ['passed', 'failed', 'timeout', 'not-runnable'];
  list.forEach((value, i) => {
    const entry = /** @type {Record<string, unknown>} */ (value);
    if (typeof entry !== 'object' || entry === null) {
      errors.push(fail(`checkResults[${i}]`, 'must be an object'));
      return;
    }
    if (!Array.isArray(entry.argv) || entry.argv.length === 0) {
      errors.push(fail(`checkResults[${i}].argv`, 'must be a non-empty argv array'));
    }
    if (!allowed.includes(String(entry.status))) {
      errors.push(fail(`checkResults[${i}].status`, `status must be one of ${allowed.join(', ')}`));
    }
    if (entry.exitCode !== null && typeof entry.exitCode !== 'number') {
      errors.push(fail(`checkResults[${i}].exitCode`, 'exitCode is a number or null when none was available'));
    }
    if (typeof entry.durationMs !== 'number' || entry.durationMs < 0) {
      errors.push(fail(`checkResults[${i}].durationMs`, 'durationMs must be a non-negative number'));
    }
  });
}

/** PURE and TOTAL. Every complaint about a candidate baseline, publication findings included.
 * @param {unknown} value @returns {{ ok: boolean, errors: ReadonlyArray<BaselineError> }} */
export function validateBaseline(value) {
  /** @type {BaselineError[]} */
  const errors = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: Object.freeze([fail('', 'the baseline must be a JSON object')]) };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  for (const key of Object.keys(record)) {
    if (!BASELINE_KEYS.includes(key)) errors.push(fail(key, 'unknown key: the baseline holds exactly the declared contract'));
  }
  if (record.schema !== BASELINE_SCHEMA) errors.push(fail('schema', `must be "${BASELINE_SCHEMA}"`));
  if (record.version !== BASELINE_VERSION) errors.push(fail('version', `must be ${BASELINE_VERSION}`));
  if (!ISO.test(String(record.recordedAt))) errors.push(fail('recordedAt', 'must be an ISO-8601 instant'));
  for (const key of ['commit', 'tree']) {
    if (record[key] !== null && !COMMIT.test(String(record[key]))) {
      errors.push(fail(key, `${key} is a 40-character object id, or null when it was not established`));
    }
  }
  if (record.clean !== null && typeof record.clean !== 'boolean') errors.push(fail('clean', 'clean is a boolean, or null when it was not established'));
  if (record.changedCount !== null && typeof record.changedCount !== 'number') errors.push(fail('changedCount', 'changedCount is a number, or null'));
  if (!Array.isArray(record.invariants) || record.invariants.length > 0) {
    errors.push(fail('invariants', 'invariants is written empty: what must never change is a human statement, never a detector guess'));
  }
  checkPathLists(record, errors);
  checkChecks(record, errors);
  for (const finding of publicationFindings(value)) {
    errors.push(fail(finding.path, `must not be published: it ${finding.finding}`));
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/** The baseline, or a BAD_FACTS refusal. @param {unknown} value @returns {Record<string, unknown>} */
export function assertBaseline(value) {
  const result = validateBaseline(value);
  if (!result.ok) {
    throw refuse(CODES.BAD_FACTS, `the adoption baseline is not usable: ${result.errors.length} error(s)`,
      { errors: result.errors.map((error) => `${error.path}: ${error.message}`) });
  }
  return /** @type {Record<string, unknown>} */ (value);
}
