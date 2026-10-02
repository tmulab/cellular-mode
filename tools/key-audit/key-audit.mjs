// key-audit.mjs — compares the keys declared in a markdown "key map" with the
// source files that are supposed to implement them. Generic, standalone, zero
// dependencies. Disk access lives in cli.mjs; this module stays pure.
//
// WHY IT EXISTS: an ad-hoc scan for `name: 'key'` UNDERCOUNTS. Some keys are
// provided by composition (a function, not an object with a `name:` field) and
// vanish from the count. The temptation is to add those to the implemented
// count and announce "39 of 46"; refusing to do that is the whole point.
//
// THREE BUCKETS, and the middle one is added to nothing:
//   1. named     — a literal `name: 'key'` (or `'key:variant'`) exists. Verifiable fact.
//   2. proseOnly — the key appears in the sources, but only in prose/comments.
//                  REQUIRES HUMAN READING. Never counted as implemented.
//   3. absent    — the key appears nowhere.
//
// A "nearly implemented" bucket folded into a total is the same mistake an audit
// is supposed to catch (prose said 17, the table had 18). A count that rounds in
// its own favour is worse than no count, because it looks like an audit.

/** Default key shape: `domain.name`, lowercase, dash-separated segments. */
export const DEFAULT_KEY_PATTERN = '[a-z][a-z0-9-]*\\.[a-z][a-z0-9-]*';

/** @typedef {{ file: string, text: string }} Source */
/** @typedef {{ named: Array<{ key: string, file: string, evidence: string }>,
 *   proseOnly: Array<{ key: string, file: string }>, absent: string[] }} Buckets */

/** @type {(s: string) => string} */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `name: 'key'` or `name: 'key:variant'`, in single, double or backtick quotes.
 * @type {(key: string) => RegExp} */
const literalOf = (key) =>
  new RegExp(`name:\\s*['"\`]${escapeRegExp(key)}(:[a-z0-9-]+)?['"\`]`);

/**
 * Keys declared in the FIRST column of a markdown table row, backticked.
 * Rows whose first cell is not a key (package rows, which use `domain-name`)
 * are ignored, which is why the pattern is anchored on both sides.
 *
 * @param {string} text markdown source of the key map
 * @param {{prefix?: string}} [options] `prefix` is a REGEX SOURCE for the whole
 *   key (not a literal string), so a project can narrow the audit to its own
 *   namespaces, e.g. `(?:shop|billing)\\.[a-z-]+`.
 */
export function keysFromMap(text, options = {}) {
  const prefix = options.prefix ?? DEFAULT_KEY_PATTERN;
  const row = new RegExp('^\\|\\s*`(?:(' + prefix + '))`');
  /** @type {string[]} */
  const found = [];
  for (const line of String(text).split('\n')) {
    const m = row.exec(line);
    const key = m?.[1];
    if (key !== undefined && !found.includes(key)) found.push(key);
  }
  return found;
}

/**
 * Classifies each key into exactly three buckets.
 *
 * `sources` is a list of `{ file, text }` — reading from disk stays outside, so
 * the test can exercise the classification without inventing a repository.
 *
 * @param {ReadonlyArray<string>} keys
 * @param {ReadonlyArray<Source>} sources
 * @returns {Buckets}
 */
export function classify(keys, sources) {
  /** @type {Buckets['named']} */
  const named = [];
  /** @type {Buckets['proseOnly']} */
  const proseOnly = [];
  /** @type {string[]} */
  const absent = [];

  for (const key of keys) {
    const withName = sources.find((s) => literalOf(key).test(s.text));
    if (withName) {
      const evidence = literalOf(key).exec(withName.text)?.[0] ?? key;
      named.push({ key, file: withName.file, evidence });
      continue;
    }
    // A prose mention is NOT an implementation. It becomes a question, not credit.
    const mentioned = sources.find(
      (s) => s.text.includes('`' + key + '`') || s.text.includes(key + ' '),
    );
    if (mentioned) proseOnly.push({ key, file: mentioned.file });
    else absent.push(key);
  }
  // No `total` field: whoever wants a single number has to pick which one it is,
  // and own the choice. Rounding an audit in its own favour is worse than no audit.
  return { named, proseOnly, absent };
}

/**
 * Plain-text report. Three separate numbers, never one blended total.
 *
 * @param {string} mapText markdown source of the key map
 * @param {ReadonlyArray<Source>} sources
 * @param {{prefix?: string}} [options] @returns {string}
 */
export function report(mapText, sources, options = {}) {
  const keys = keysFromMap(mapText, options);
  const { named, proseOnly, absent } = classify(keys, sources);
  return [
    `keys with a named implementation: ${named.length} of ${keys.length}`,
    '',
    `prose only (${proseOnly.length}) — present in the sources but only in prose, REQUIRE human reading:`,
    ...proseOnly.map((c) => `  · ${c.key} — ${c.file}`),
    '',
    `absent (${absent.length}):`,
    ...absent.map((k) => `  · ${k}`),
  ].join('\n');
}
