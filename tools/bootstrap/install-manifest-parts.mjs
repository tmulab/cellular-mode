// install-manifest-parts.mjs — the per-entry rules of the install manifest, apart from the
// whole. PURE and TOTAL: no filesystem, no clock, no throw. Split from `install-manifest.mjs`
// for the 200-line rule and for the same reason `component-parts.mjs` is split from
// `component-schema.mjs`: the top-level shape is one question ("are these the declared keys?")
// and an entry is another ("is this path, hash and instant one we may publish?").
import { pathProblem } from './component-parts.mjs';
import { controlProblem } from './display.mjs';

/** @typedef {{ path: string, message: string }} ManifestError */

export const TOP_KEYS = Object.freeze(['schema', 'version', 'source', 'profile', 'components',
  'installedAt', 'target', 'files', 'integrations', 'approvals', 'host', 'limitations']);
export const SOURCE_KEYS = Object.freeze(['name', 'version', 'revision']);
export const COMPONENT_KEYS = Object.freeze(['id', 'componentVersion']);
export const FILE_KEYS = Object.freeze(['path', 'mode', 'created', 'sha256Before', 'sha256After', 'block']);
export const BLOCK_KEYS = Object.freeze(['component', 'sha256']);
export const INTEGRATION_KEYS = Object.freeze(['kind', 'status', 'detail']);
export const APPROVAL_KEYS = Object.freeze(['action', 'at']);
export const HOST_KEYS = Object.freeze(['languages', 'buildSystems', 'ci', 'hooks']);

/** What a recorded file was to this install. The same three words the plan uses. */
export const FILE_MODES = Object.freeze(['copy', 'generate', 'reference']);
/** The integration kinds a manifest may record. `first-cell` is one, because a planned cell is an
 * integration with the method's own state and a human must see whether it happened. */
export const INTEGRATION_KINDS = Object.freeze(['hooks', 'ci', 'verification', 'adapter', 'first-cell']);
/** `applied` happened, `proposed` did not and waits for a human, `skipped` will not happen. */
export const INTEGRATION_STATUS = Object.freeze(['applied', 'proposed', 'skipped']);

export const SHA256 = /^[0-9a-f]{64}$/;
export const COMMIT = /^[0-9a-f]{40}$/;
export const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
/** A directory basename and nothing that could be a path: no slash, no colon, no leading dot. */
export const BASENAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;

/** @type {(path: string, message: string) => ManifestError} */
export const fail = (path, message) => ({ path, message });
/** @type {(value: unknown) => boolean} */
export const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The record at `at`, with every undeclared key reported. `null` when it is not a record at all.
 * @param {unknown} value @param {string} at @param {ReadonlyArray<string>} keys
 * @param {ManifestError[]} errors @returns {Record<string, unknown> | null} */
export function container(value, at, keys, errors) {
  if (!isRecord(value)) {
    errors.push(fail(at, 'must be a JSON object'));
    return null;
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) {
      errors.push(fail(`${at}.${key}`, 'unknown key: the manifest holds exactly the declared contract'));
    }
  }
  return record;
}

/** @param {unknown} value @param {string} at @param {ManifestError[]} errors @returns {void} */
export function checkStrings(value, at, errors) {
  if (!Array.isArray(value)) {
    errors.push(fail(at, 'must be an array of strings'));
    return;
  }
  value.forEach((item, i) => {
    if (typeof item !== 'string' || item === '') {
      errors.push(fail(`${at}[${i}]`, 'must be a non-empty string'));
      return;
    }
    const problem = controlProblem(item);
    if (problem !== null) errors.push(fail(`${at}[${i}]`, problem));
  });
}

/** @param {unknown} value @param {string} at @param {ManifestError[]} errors @returns {void} */
export function checkFile(value, at, errors) {
  const record = container(value, at, FILE_KEYS, errors);
  if (record === null) return;
  const problem = pathProblem(record.path);
  if (problem !== null) errors.push(fail(`${at}.path`, `path ${problem}`));
  if (typeof record.mode !== 'string' || !FILE_MODES.includes(record.mode)) {
    errors.push(fail(`${at}.mode`, `mode must be one of ${FILE_MODES.join(', ')}`));
  }
  if (typeof record.created !== 'boolean') errors.push(fail(`${at}.created`, 'created must be a boolean'));
  if (record.sha256Before !== null && !SHA256.test(String(record.sha256Before))) {
    errors.push(fail(`${at}.sha256Before`, 'sha256Before must be lower-case hex SHA-256, or null'));
  }
  if (!SHA256.test(String(record.sha256After))) {
    errors.push(fail(`${at}.sha256After`, 'sha256After must be lower-case hex SHA-256'));
  }
  if ('block' in record) checkBlock(record.block, `${at}.block`, errors);
}

/** The managed-block record of one file: `{ component, sha256 }`, closed like every other
 * container here. A bare component NAME is accepted as the form written before the digest was
 * recorded — a reader then knows the block's integrity is UNKNOWN instead of assuming it.
 * @param {unknown} value @param {string} at @param {ManifestError[]} errors @returns {void} */
export function checkBlock(value, at, errors) {
  if (typeof value === 'string') {
    if (value === '') errors.push(fail(at, 'block names the component whose managed block this file holds'));
    return;
  }
  const record = container(value, at, BLOCK_KEYS, errors);
  if (record === null) return;
  if (typeof record.component !== 'string' || record.component === '') {
    errors.push(fail(`${at}.component`, 'component names the component whose managed block this file holds'));
  }
  if (!SHA256.test(String(record.sha256))) {
    errors.push(fail(`${at}.sha256`, 'sha256 is the digest of the block as written, markers included'));
  }
}

/** PURE and TOTAL. The component a file's `block` entry belongs to, and the digest recorded for it
 * — `null` when no digest was recorded, which is UNKNOWN and never "intact".
 * @param {unknown} value @returns {{ component: string, sha256: string | null } | null} */
export function blockOf(value) {
  if (typeof value === 'string' && value !== '') return { component: value, sha256: null };
  if (!isRecord(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (typeof record.component !== 'string' || record.component === '') return null;
  return { component: record.component, sha256: SHA256.test(String(record.sha256)) ? String(record.sha256) : null };
}

/** @param {unknown} value @param {string} at @param {ManifestError[]} errors @returns {void} */
function checkComponents(value, at, errors) {
  if (!Array.isArray(value)) {
    errors.push(fail(at, 'must be an array'));
    return;
  }
  value.forEach((entry, i) => {
    const record = container(entry, `${at}[${i}]`, COMPONENT_KEYS, errors);
    if (record === null) return;
    for (const key of COMPONENT_KEYS) {
      if (typeof record[key] !== 'string' || record[key] === '') {
        errors.push(fail(`${at}[${i}].${key}`, `${key} must be a non-empty string`));
      }
    }
  });
}

/** @param {unknown} value @param {string} at @param {ManifestError[]} errors @returns {void} */
function checkIntegrations(value, at, errors) {
  if (!Array.isArray(value)) {
    errors.push(fail(at, 'must be an array'));
    return;
  }
  value.forEach((entry, i) => {
    const record = container(entry, `${at}[${i}]`, INTEGRATION_KEYS, errors);
    if (record === null) return;
    if (!INTEGRATION_KINDS.includes(String(record.kind))) {
      errors.push(fail(`${at}[${i}].kind`, `kind must be one of ${INTEGRATION_KINDS.join(', ')}`));
    }
    if (!INTEGRATION_STATUS.includes(String(record.status))) {
      errors.push(fail(`${at}[${i}].status`, `status must be one of ${INTEGRATION_STATUS.join(', ')}`));
    }
    if (typeof record.detail !== 'string') errors.push(fail(`${at}[${i}].detail`, 'detail must be a string'));
  });
}

/** @param {unknown} value @param {string} at @param {ManifestError[]} errors @returns {void} */
function checkApprovals(value, at, errors) {
  if (!Array.isArray(value)) {
    errors.push(fail(at, 'must be an array'));
    return;
  }
  value.forEach((entry, i) => {
    const record = container(entry, `${at}[${i}]`, APPROVAL_KEYS, errors);
    if (record === null) return;
    if (typeof record.action !== 'string' || record.action === '') {
      errors.push(fail(`${at}[${i}].action`, 'action names what was approved'));
    }
    if (!ISO.test(String(record.at))) errors.push(fail(`${at}[${i}].at`, 'at must be an ISO-8601 instant'));
  });
}

/** Every list of the manifest, checked entry by entry.
 * @param {Record<string, unknown>} manifest @param {ManifestError[]} errors @returns {void} */
export function checkLists(manifest, errors) {
  checkComponents(manifest.components, 'components', errors);
  if (!Array.isArray(manifest.files)) errors.push(fail('files', 'must be an array'));
  else manifest.files.forEach((entry, i) => checkFile(entry, `files[${i}]`, errors));
  checkIntegrations(manifest.integrations, 'integrations', errors);
  checkApprovals(manifest.approvals, 'approvals', errors);
  checkStrings(manifest.limitations, 'limitations', errors);
}
