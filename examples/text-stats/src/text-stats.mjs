// text-stats.mjs — a deliberately tiny library, built one cell at a time.
//
// Cell 1 "Word count"   ✔ countWords
// Cell 2 "Reading time" ✔ readingTime
// Cell 3 "Sentence count" 📋 — planned, not written. The backlog is visible on
// purpose: see ../vault/state/INDEX.md.
//
// No dependencies, Node built-ins only.

// Unicode whitespace, plus the byte-order mark, which is whitespace in practice
// but not in the White_Space property.
const SPACE = /[\p{White_Space}\uFEFF]+/u;
const EDGES = /^[\p{White_Space}\uFEFF]+|[\p{White_Space}\uFEFF]+$/gu;

/**
 * Number of whitespace-separated words in `text`.
 * Unicode-aware: a non-breaking space, an ideographic space and a newline all
 * separate words. An empty or whitespace-only string has zero words.
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  if (typeof text !== 'string') {
    throw new TypeError('countWords expects a string');
  }
  const trimmed = text.replace(EDGES, '');
  if (trimmed === '') return 0;
  return trimmed.split(SPACE).length;
}

/**
 * Minutes needed to read `text`, rounded up — a partial minute is still a
 * minute of someone's attention. Zero words means zero minutes, not one.
 * @param {string} text
 * @param {{wpm?: number}} [options] words per minute; default 200
 * @returns {number}
 */
export function readingTime(text, { wpm = 200 } = {}) {
  if (!Number.isFinite(wpm) || wpm <= 0) {
    throw new RangeError('readingTime: wpm must be a positive finite number');
  }
  const words = countWords(text);
  if (words === 0) return 0;
  return Math.ceil(words / wpm);
}
