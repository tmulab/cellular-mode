// deps.mjs — the `**Dependencies:**` field of a cell file, pure.
//
// A dependency is a declaration, not an inference: nothing in this project derives
// an edge between two cells from prose, from an area name or from a timestamp. The
// field is the whole source, which is why reading and writing it is one small module
// with no filesystem in it.
//
// Values are normalised to SLUGS (the cell ID), never kept as free-form names. A
// slug is what `INDEX.md` links to and what `cells/<slug>.md` is called, so a
// dependency written as "Reading time", "reading-time" or "READING TIME" resolves to
// the same cell; a name kept verbatim would resolve to three different ones. The
// cost is that a dependency on a cell that does not exist stays readable but is
// NOT silently invented into existence — it is reported as dangling by whoever
// builds a graph from these fields.
import { slugify } from './slug.mjs';

/** What an empty field looks like in the file format. */
export const NONE = '—';

/** A token with no letter and no digit cannot name a cell. */
const NAMEABLE = /[\p{L}\p{N}]/u;

/**
 * PURE. `"Reading time, word-count"` -> `['reading-time', 'word-count']`.
 * Comma or semicolon separated, de-duplicated, order preserved, `—` is empty.
 * @param {unknown} value @returns {string[]}
 */
export function parseDependencies(value) {
  const text = String(value ?? '').trim();
  if (text === '' || text === NONE) return [];
  /** @type {string[]} */
  const out = [];
  for (const raw of text.split(/[,;]/)) {
    const token = raw.trim();
    if (token === '' || token === NONE || !NAMEABLE.test(token)) continue;
    const slug = slugify(token);
    if (!out.includes(slug)) out.push(slug);
  }
  return out;
}

/**
 * PURE. The field value for a list or for a raw `--deps` string. Always one line.
 * @param {unknown} value a string as typed, or an array of ids
 * @returns {string} `—` when there is nothing to declare
 */
export function renderDependencies(value) {
  const list = Array.isArray(value)
    ? parseDependencies(value.join(','))
    : parseDependencies(value);
  return list.length === 0 ? NONE : list.join(', ');
}
