// component-schema.mjs — the whole-manifest validator for `bootstrap/components/<id>.json`.
// PURE and TOTAL: no filesystem, no clock, no throw. A manifest is DATA read from a tree
// Bootstrap does not own, so every rejection comes back as a structured error rather than as
// an exception somebody forgot to catch, and an unknown key is a rejection rather than a
// shrug — that is how a contract rots: the writer adds a field, the reader ignores it, and
// six weeks later two modules disagree about what the file means.
//
// The per-entry rules (paths, argv, host conditions) live in `./component-parts.mjs`.
import {
  ID, ID_LIST_KEYS, TEXT_LIST_KEYS, UNKNOWN_KEY_MESSAGE,
  checkFileEntry, checkHost, checkLists, checkVerifyEntry, fail, isRecord,
} from './component-parts.mjs';

/** @typedef {import('./component-parts.mjs').ManifestError} ManifestError */
/** @typedef {{ ok: boolean, errors: ReadonlyArray<ManifestError> }} ManifestResult */

/** The only schema name and version these rules accept. */
export const SCHEMA = 'cellular-mode/component-manifest';
export const VERSION = 1;

/** @type {ReadonlyArray<string>} */
export const MANIFEST_KEYS = Object.freeze([
  'schema', 'version', 'id', 'componentVersion', 'description', 'files', 'exclude',
  'dependsOn', 'optionalDependsOn', 'conflicts', 'host', 'config', 'verify', 'uninstall',
]);

/** The keys a manifest may not omit. The rest default to "nothing", which is a safe default
 * for every one of them: no dependency, no conflict, no host requirement, no check to run. */
export const REQUIRED_KEYS = Object.freeze([
  'schema', 'version', 'id', 'componentVersion', 'description', 'files', 'uninstall',
]);

/** @type {ReadonlyArray<string>} */
export const UNINSTALL = Object.freeze(['remove-owned', 'keep', 'manual']);

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export {
  FILE_MODES, HOST_CONDITIONS, UNKNOWN_KEY_MESSAGE, pathProblem,
} from './component-parts.mjs';

/** @param {Record<string, unknown>} record @param {ManifestError[]} errors @returns {void} */
function checkIdentity(record, errors) {
  if ('schema' in record && record.schema !== SCHEMA) {
    errors.push(fail('schema', `schema must be "${SCHEMA}"`));
  }
  if ('version' in record && record.version !== VERSION) {
    errors.push(fail('version', `version must be the number ${VERSION}`));
  }
  if ('id' in record && (typeof record.id !== 'string' || !ID.test(record.id))) {
    errors.push(fail('id', 'id must be a kebab-case name'));
  }
  const componentVersion = record.componentVersion;
  if ('componentVersion' in record
    && (typeof componentVersion !== 'string' || !SEMVER.test(componentVersion))) {
    errors.push(fail('componentVersion', 'componentVersion must be a semver major.minor.patch'));
  }
  const description = record.description;
  if ('description' in record && (typeof description !== 'string' || description.trim() === '')) {
    errors.push(fail('description', 'description must be a non-empty sentence'));
  }
  if ('uninstall' in record
    && (typeof record.uninstall !== 'string' || !UNINSTALL.includes(record.uninstall))) {
    errors.push(fail('uninstall', `uninstall must be one of ${UNINSTALL.join(', ')}`));
  }
}

/**
 * PURE and TOTAL. Validates one component manifest against `cellular-mode/component-manifest`
 * version 1. Errors are collected, never thrown, and reported one per offending path, so a
 * human fixing a manifest sees every problem in one pass.
 * @param {unknown} value @returns {ManifestResult}
 */
export function validateComponent(value) {
  if (!isRecord(value)) return { ok: false, errors: Object.freeze([fail('', 'a manifest must be a JSON object')]) };
  const record = /** @type {Record<string, unknown>} */ (value);
  /** @type {ManifestError[]} */
  const errors = [];
  for (const key of Object.keys(record)) {
    if (!MANIFEST_KEYS.includes(key)) errors.push(fail(key, UNKNOWN_KEY_MESSAGE));
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in record)) errors.push(fail(key, 'required: this contract has no optional core field'));
  }
  checkIdentity(record, errors);
  if ('files' in record) {
    if (!Array.isArray(record.files) || record.files.length === 0) {
      errors.push(fail('files', 'files must be a non-empty array'));
    } else record.files.forEach((entry, i) => checkFileEntry(entry, `files[${i}]`, errors));
  }
  checkLists(record, errors);
  if ('host' in record) checkHost(record.host, 'host', errors);
  if ('verify' in record) {
    if (!Array.isArray(record.verify)) errors.push(fail('verify', 'verify must be an array'));
    else record.verify.forEach((entry, i) => checkVerifyEntry(entry, `verify[${i}]`, errors));
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/** The declared key sets, for a reader that wants to know what a manifest may say without
 * reading the validator. `TEXT_LIST_KEYS` and `ID_LIST_KEYS` are re-exported here so that
 * nothing outside this pair of modules has to import the parts file directly. */
export { ID_LIST_KEYS, TEXT_LIST_KEYS };
