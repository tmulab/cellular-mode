// slug.mjs — cell identity (slug) and the fuzzy lookup used by `open`/`resume`.

/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** @typedef {import('./types.mjs').Lookup} Lookup */

/** @param {unknown} name @returns {string} */
export function slugify(name) {
  const base = String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base === '' ? 'cell' : base;
}

/** @type {(s: unknown) => string} */
const norm = (s) => String(s ?? '').trim().toLowerCase();

// Returns { kind: 'exact'|'fuzzy'|'ambiguous'|'none', row?, candidates? }.
// Exact (name or slug, case-insensitive) always wins over substring matches, so
// a cell named "api" is reachable even when "api-cache" also exists.
/** @param {ReadonlyArray<IndexRow>} rows @param {unknown} query @returns {Lookup} */
export function findCell(rows, query) {
  const q = norm(query);
  const slugQ = slugify(query);
  if (q === '') return { kind: 'none', candidates: [] };

  const exact = rows.filter((r) => norm(r.name) === q || norm(r.slug) === q || norm(r.slug) === slugQ);
  const onlyExact = exact[0];
  if (exact.length === 1 && onlyExact !== undefined) return { kind: 'exact', row: onlyExact };
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact };

  const fuzzy = rows.filter((r) => norm(r.name).includes(q) || norm(r.slug).includes(slugQ));
  const onlyFuzzy = fuzzy[0];
  if (fuzzy.length === 1 && onlyFuzzy !== undefined) return { kind: 'fuzzy', row: onlyFuzzy };
  if (fuzzy.length > 1) return { kind: 'ambiguous', candidates: fuzzy };
  return { kind: 'none', candidates: [] };
}
