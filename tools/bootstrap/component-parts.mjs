// component-parts.mjs — the per-entry rules of a component manifest, apart from the whole.
// PURE and TOTAL: no filesystem, no clock, no throw. Split from `component-schema.mjs` for the
// 200-line rule and for a reader's sake: the top-level shape is one question ("are these the
// declared keys?") and an entry is another ("can this path and this argv be trusted?").
//
// The path rules are a security boundary, not tidiness. A manifest decides what is copied into
// a target directory, so a `source` or `target` that escapes (a `..` segment), anchors itself
// (a leading slash, or a Windows drive letter) or carries a NUL is refused here, before any
// writer sees it. `verify` argv entries
// are refused when a single element could be read as shell punctuation: they run with
// `shell: false`, and such an element is a sign the author believed otherwise.
//
// A path is refused as well when it carries a CONTROL, newline or bidirectional formatting
// character (`controlProblem`, the one implementation, in `display.mjs`). Closed in the stage 7
// hardening cell: such a name is not a typo but an attack on the report a human approves an install
// from — `ok.md` + a newline + `  all gates passed` would, printed raw, forge a line of it — and
// refusing it HERE rather than at the renderer means the writer can never be talked into creating
// the file either, because `confine` stands on this same answer.
import { controlProblem } from './display.mjs';

/** @typedef {{ path: string, message: string }} ManifestError */

/** @type {ReadonlyArray<string>} */
export const FILE_KEYS = Object.freeze(['source', 'target', 'mode', 'template']);
/** @type {ReadonlyArray<string>} */
export const FILE_MODES = Object.freeze(['copy', 'generate', 'reference']);

/** The closed list of host facts a component may require. Closed because a condition nobody
 * implements is a promise nobody keeps; extend it in the same commit as its detector. */
export const HOST_CONDITIONS = Object.freeze(['git']);

/** @type {ReadonlyArray<string>} */
export const ID_LIST_KEYS = Object.freeze(['dependsOn', 'optionalDependsOn', 'conflicts']);
/** @type {ReadonlyArray<string>} */
export const TEXT_LIST_KEYS = Object.freeze(['exclude', 'config']);

export const UNKNOWN_KEY_MESSAGE = 'unknown key: a manifest holds exactly the declared contract, nothing more';

export const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DRIVE = /^[A-Za-z]:/;
/** Punctuation that only means something to a shell. */
const SHELL_META = /[;|&$`<>\r\n*?(){}[\]!~"']/;

/** @type {(value: unknown) => boolean} */
export const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @type {(path: string, message: string) => ManifestError} */
export const fail = (path, message) => ({ path, message });

/**
 * PURE. Why a relative path is not usable, or `null` when it is. Exported because the catalog
 * and the writer must agree on exactly one answer to this question.
 * @param {unknown} value @returns {string | null}
 */
export function pathProblem(value) {
  if (typeof value !== 'string' || value === '') return 'must be a non-empty relative path';
  if (value.includes('\0')) return 'must not contain a NUL byte';
  if (value.includes('\\')) return 'must use forward slashes, never a backslash';
  if (value.startsWith('/') || DRIVE.test(value)) return 'must be relative, never absolute';
  const segments = value.split('/');
  if (segments.includes('..')) return 'must not contain a ".." segment';
  if (segments.includes('.')) return 'must not contain a "." segment';
  if (segments.some((s, i) => s === '' && i !== segments.length - 1)) return 'must not contain an empty segment';
  return controlProblem(value);
}

/** @param {unknown} entry @param {string} at @param {ManifestError[]} errors @returns {void} */
export function checkFileEntry(entry, at, errors) {
  if (!isRecord(entry)) {
    errors.push(fail(at, 'a files entry must be a JSON object'));
    return;
  }
  const record = /** @type {Record<string, unknown>} */ (entry);
  for (const key of Object.keys(record)) {
    if (!FILE_KEYS.includes(key)) errors.push(fail(`${at}.${key}`, UNKNOWN_KEY_MESSAGE));
  }
  const mode = record.mode;
  if (typeof mode !== 'string' || !FILE_MODES.includes(mode)) {
    errors.push(fail(`${at}.mode`, `mode must be one of ${FILE_MODES.join(', ')}`));
  }
  const target = pathProblem(record.target);
  if (target !== null) errors.push(fail(`${at}.target`, `target ${target}`));
  if (mode === 'generate') {
    if ('source' in record) {
      errors.push(fail(`${at}.source`, 'a generated artefact has no source: it comes from a template'));
    }
    if (typeof record.template !== 'string' || record.template === '') {
      errors.push(fail(`${at}.template`, 'template is required for mode "generate"'));
    }
    return;
  }
  if ('template' in record) {
    errors.push(fail(`${at}.template`, 'template is meaningful only for mode "generate"'));
  }
  const source = pathProblem(record.source);
  if (source !== null) errors.push(fail(`${at}.source`, `source ${source}`));
}

/** @param {unknown} value @param {string} at @param {ManifestError[]} errors @returns {void} */
export function checkVerifyEntry(value, at, errors) {
  if (!isRecord(value)) {
    errors.push(fail(at, 'a verify entry must be a JSON object'));
    return;
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  for (const key of Object.keys(record)) {
    if (key !== 'id' && key !== 'argv') errors.push(fail(`${at}.${key}`, UNKNOWN_KEY_MESSAGE));
  }
  if (typeof record.id !== 'string' || !ID.test(record.id)) {
    errors.push(fail(`${at}.id`, 'id must be a kebab-case name'));
  }
  const argv = record.argv;
  if (!Array.isArray(argv) || argv.length === 0) {
    errors.push(fail(`${at}.argv`, 'argv must be a non-empty array of strings'));
    return;
  }
  argv.forEach((element, i) => {
    if (typeof element !== 'string' || element === '') {
      errors.push(fail(`${at}.argv[${i}]`, 'every argv element must be a non-empty string'));
    } else if (SHELL_META.test(element)) {
      errors.push(fail(`${at}.argv[${i}]`,
        'argv runs with shell: false, so an element must carry no shell punctuation'));
    }
  });
}

/** @param {Record<string, unknown>} record @param {ManifestError[]} errors @returns {void} */
export function checkLists(record, errors) {
  for (const key of ID_LIST_KEYS) {
    if (!(key in record)) continue;
    const list = record[key];
    if (!Array.isArray(list)) {
      errors.push(fail(key, `${key} must be an array of component ids`));
      continue;
    }
    list.forEach((id, i) => {
      if (typeof id !== 'string' || !ID.test(id)) {
        errors.push(fail(`${key}[${i}]`, 'must be a kebab-case component id'));
      }
    });
  }
  for (const key of TEXT_LIST_KEYS) {
    if (!(key in record)) continue;
    const list = record[key];
    if (!Array.isArray(list)) {
      errors.push(fail(key, `${key} must be an array of strings`));
      continue;
    }
    list.forEach((value, i) => {
      if (typeof value !== 'string' || value === '' || value.includes('\0') || value.includes('\\')) {
        errors.push(fail(`${key}[${i}]`, 'must be a non-empty string with no NUL and no backslash'));
      }
    });
  }
}

/** @param {unknown} value @param {string} at @param {ManifestError[]} errors @returns {void} */
export function checkHost(value, at, errors) {
  if (!isRecord(value)) {
    errors.push(fail(at, 'host must be a JSON object'));
    return;
  }
  const host = /** @type {Record<string, unknown>} */ (value);
  for (const key of Object.keys(host)) {
    if (key !== 'requires') errors.push(fail(`${at}.${key}`, UNKNOWN_KEY_MESSAGE));
  }
  const requires = host.requires;
  if (!Array.isArray(requires)) {
    errors.push(fail(`${at}.requires`, 'host.requires must be an array'));
    return;
  }
  requires.forEach((condition, i) => {
    if (typeof condition !== 'string' || !HOST_CONDITIONS.includes(condition)) {
      errors.push(fail(`${at}.requires[${i}]`, `must be one of ${HOST_CONDITIONS.join(', ')}`));
    }
  });
}
