// fields.mjs — the contract addressed by DOT PATH (`objective`, `scope.in`,
// `security.sensitiveData`), as pure, total functions.
//
// WHY: the question bank names a field as data, so every other module would otherwise need
// its own switch over field names — and a switch is where a new field gets forgotten. One
// reader and one writer, both immutable: `setField` returns a new contract and never
// mutates the one it was given, because a draft is passed around between pure functions
// and an in-place edit would make the caller's copy silently wrong.
import { BuilderError, CODES } from './errors.mjs';

/** @typedef {import('./types.mjs').Entry} Entry */
/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */

/** @type {(value: unknown) => boolean} */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** @type {(value: unknown) => Record<string, unknown>} */
const asRecord = (value) => /** @type {Record<string, unknown>} */ (value);

/** PURE. The value at `path`, or `undefined` when any step is missing.
 * @param {unknown} source @param {string} path @returns {unknown} */
export function getField(source, path) {
  /** @type {unknown} */
  let node = source;
  for (const key of path.split('.')) {
    if (!isRecord(node)) return undefined;
    node = asRecord(node)[key];
  }
  return node;
}

/** PURE. A deep copy of `contract` with `path` set to `value`. The contract is JSON data by
 * contract, so a structured clone is a faithful copy and not a guess.
 * @param {ProjectContract} contract @param {string} path @param {unknown} value
 * @returns {ProjectContract} */
export function setField(contract, path, value) {
  const keys = path.split('.');
  const last = keys[keys.length - 1];
  if (last === undefined || last === '') {
    throw new BuilderError(CODES.BAD_ENTRY, 'a field path must name at least one key');
  }
  const out = structuredClone(contract);
  /** @type {Record<string, unknown>} */
  let node = asRecord(out);
  for (const key of keys.slice(0, -1)) {
    const next = node[key];
    if (!isRecord(next)) {
      throw new BuilderError(CODES.BAD_ENTRY, `no such contract field: ${path}`);
    }
    node = asRecord(next);
  }
  if (!(last in node)) throw new BuilderError(CODES.BAD_ENTRY, `no such contract field: ${path}`);
  node[last] = value;
  return /** @type {ProjectContract} */ (out);
}

/** PURE. `setField` for a list field: appends, keeping the order answers arrived in.
 * @param {ProjectContract} contract @param {string} path @param {ReadonlyArray<Entry>} entries
 * @returns {ProjectContract} */
export function appendField(contract, path, entries) {
  const current = getField(contract, path);
  if (!Array.isArray(current)) throw new BuilderError(CODES.BAD_ENTRY, `${path} is not a list field`);
  return setField(contract, path, [...current, ...entries]);
}

/** PURE. Is `path` a list of entries rather than a single one?
 * @param {ProjectContract} contract @param {string} path @returns {boolean} */
export function isListField(contract, path) {
  return Array.isArray(getField(contract, path));
}

/** @type {(value: unknown) => Entry | null} */
const asEntry = (value) => (isRecord(value) && typeof asRecord(value).status === 'string'
  ? /** @type {Entry} */ (value)
  : null);

/** PURE. Every entry stored at `path`, whether the field holds one or many.
 * @param {ProjectContract} contract @param {string} path @returns {Entry[]} */
export function entriesAt(contract, path) {
  const value = getField(contract, path);
  if (Array.isArray(value)) {
    return value.map(asEntry).filter((/** @type {Entry | null} */ e) => e !== null);
  }
  const single = asEntry(value);
  return single === null ? [] : [single];
}

/** PURE. A field is answered once it holds at least one entry that is not UNKNOWN. An empty
 * list is unanswered: nobody has said what belongs in it yet.
 * @param {ProjectContract} contract @param {string} path @returns {boolean} */
export function isAnswered(contract, path) {
  return entriesAt(contract, path).some((e) => e.status !== 'UNKNOWN');
}

/** PURE. Was this field established by evidence? Such a field is never asked about: the
 * repository already answered, and asking again invites a weaker answer.
 * @param {ProjectContract} contract @param {string} path @returns {boolean} */
export function isVerified(contract, path) {
  return entriesAt(contract, path).some((e) => e.status === 'VERIFIED');
}
