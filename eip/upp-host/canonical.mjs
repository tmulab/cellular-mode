// Canonical JSON and its digest: the two operations a manifest PIN is made of.
//
// A pin compares two manifests that travelled differently — one read from disk by the
// operator, one answered by a plugin over the wire — so the comparison cannot be made on
// bytes. Key order, indentation and escaping are all free choices of whoever serialised
// the object, and none of them changes what the manifest SAYS. So the digest is taken of a
// canonical form: keys sorted, no whitespace, arrays in their declared order.
//
// Deliberately NOT a general canonicaliser. It refuses what JSON cannot carry (a cycle, a
// function, a non-finite number) instead of coercing it, because a pin computed over a
// silently coerced value is a pin over something nobody reviewed.
import { createHash } from 'node:crypto';

/** @type {(v: unknown) => v is Record<string, unknown>} */
const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Serialise `value` with object keys in code-unit order and no insignificant whitespace.
 * @param {unknown} value @param {WeakSet<object>} [seen] cycle guard, threaded by recursion
 * @returns {string}
 * @throws {TypeError} when the value is not representable as JSON
 */
export function canonicalJson(value, seen = new WeakSet()) {
  if (value === null) return 'null';
  const kind = typeof value;
  if (kind === 'boolean') return value === true ? 'true' : 'false';
  if (kind === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('a canonical manifest holds no NaN or Infinity');
    return JSON.stringify(value);
  }
  if (kind === 'string') return JSON.stringify(value);
  if (kind !== 'object') throw new TypeError(`a canonical manifest holds no ${kind}`);
  const object = /** @type {object} */ (value);
  if (seen.has(object)) throw new TypeError('a canonical manifest has no cycles');
  seen.add(object);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJson(item, seen)).join(',')}]`;
    }
    if (!isPlain(value)) throw new TypeError('a canonical manifest holds only plain objects');
    const keys = Object.keys(value).sort();
    const members = keys
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], seen)}`);
    return `{${members.join(',')}}`;
  } finally {
    seen.delete(object);
  }
}

/** Lower-case hex SHA-256 of a UTF-8 string. @param {string} text @returns {string} */
export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The pin value of a manifest: `sha256Hex(canonicalJson(manifest))`.
 * @param {unknown} manifest @returns {string} */
export function manifestDigest(manifest) {
  return sha256Hex(canonicalJson(manifest));
}

/** Constant-time-ish equality for two hex digests. Case-insensitive, length-checked.
 * Not a secret comparison — a digest is public — but a single predicate keeps every
 * caller from inventing its own normalisation.
 * @param {unknown} a @param {unknown} b @returns {boolean} */
export function digestsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return a.toLowerCase() === b.toLowerCase();
}
