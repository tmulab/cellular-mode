// display.mjs — the only place Bootstrap turns untrusted strings into lines for a human.
//
// A target directory is UNTRUSTED. A file called `ok.md\n  ✅ everything passed` would, printed
// raw, forge a line of a dry-run report; a bidirectional override would reorder a path so that
// `evil.mjs` reads as `js`. So every path and every free-text detail that reaches a renderer
// passes through `sanitize`: control characters, newlines and the bidi and zero-width
// formatting codes become visible `\uXXXX` escapes, and the result is length-capped. Nothing
// here validates — validation refuses, display renders inert. Both exist on purpose.

/** Code-point ranges that must never reach a terminal verbatim, each with the reason it is here.
 * Written as numbers and compiled below, never as literal characters in this file: a module that
 * defends against invisible characters must not itself contain any.
 * @type {ReadonlyArray<{ lo: number, hi: number, why: string }>} */
const UNSAFE_RANGES = Object.freeze([
  Object.freeze({ lo: 0x00, hi: 0x1f, why: 'C0 controls, including the newline that forges a line' }),
  Object.freeze({ lo: 0x7f, hi: 0x9f, why: 'DEL and the C1 controls' }),
  Object.freeze({ lo: 0xad, hi: 0xad, why: 'soft hyphen' }),
  Object.freeze({ lo: 0x200b, hi: 0x200f, why: 'zero-width space and joiners, and the bidi marks' }),
  Object.freeze({ lo: 0x2028, hi: 0x2029, why: 'line and paragraph separators' }),
  Object.freeze({ lo: 0x202a, hi: 0x202e, why: 'bidi embeddings and overrides' }),
  Object.freeze({ lo: 0x2060, hi: 0x2064, why: 'word joiner and the invisible operators' }),
  Object.freeze({ lo: 0x2066, hi: 0x2069, why: 'bidi isolates' }),
  Object.freeze({ lo: 0xfeff, hi: 0xfeff, why: 'byte-order mark' }),
]);

/** @param {number} code @returns {string} */
const escapeCode = (code) => `\\u${code.toString(16).padStart(4, '0')}`;

const UNSAFE = new RegExp(`[${UNSAFE_RANGES.map((range) => (range.lo === range.hi
  ? escapeCode(range.lo)
  : `${escapeCode(range.lo)}-${escapeCode(range.hi)}`)).join('')}]`, 'g');

/** The default display cap. Long enough for a deep path, short enough that one bad entry
 * cannot push a report off the screen. */
export const MAX_DISPLAY = 160;

/** @param {string} char @returns {string} */
const escapeChar = (char) => escapeCode(char.charCodeAt(0));

/**
 * PURE and TOTAL. `value` rendered so that it occupies exactly one line and no more than
 * `limit` characters. A non-string becomes its JSON form, so a renderer never prints
 * `[object Object]` or `undefined` by accident.
 * @param {unknown} value @param {number} [limit] @returns {string}
 */
export function sanitize(value, limit = MAX_DISPLAY) {
  const text = typeof value === 'string' ? value : safeJson(value);
  const flat = text.replace(UNSAFE, escapeChar);
  return flat.length <= limit ? flat : `${flat.slice(0, Math.max(0, limit - 1))}…`;
}

/** @param {unknown} value @returns {string} */
function safeJson(value) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '[unprintable]';
  }
}

/**
 * PURE and TOTAL. Why a string is not safe to carry as a path, or `null` when it is. This is the
 * VALIDATION half: `pathProblem` in `component-parts.mjs` answers the structural question
 * (relative, no `..`, no NUL, forward slashes) and this one answers the presentation question,
 * because a name holding a newline or a bidi override is an attack on the report, not a typo.
 * @param {unknown} value @returns {string | null}
 */
export function controlProblem(value) {
  if (typeof value !== 'string') return 'must be a string';
  UNSAFE.lastIndex = 0;
  const found = UNSAFE.exec(value);
  if (found === null) return null;
  return `must not contain the formatting character ${escapeChar(String(found[0]))}`;
}

/**
 * PURE. The first `limit` items plus how many were withheld. One helper so that every capped
 * list in every renderer counts the remainder the same way.
 * @template T @param {ReadonlyArray<T>} items @param {number} limit
 * @returns {{ shown: ReadonlyArray<T>, hidden: number }}
 */
export function capList(items, limit) {
  if (limit < 0 || items.length <= limit) return { shown: Object.freeze([...items]), hidden: 0 };
  return { shown: Object.freeze(items.slice(0, limit)), hidden: items.length - limit };
}

/** PURE. `3 files` / `1 file`. @param {number} count @param {string} one
 * @param {string} [many] @returns {string} */
export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
