// index-table.mjs — parse and render vault/state/INDEX.md.
// Linear line scan (no regex over free text): a lesson carried over from the
// original dashboard parser — two clever regexes once lost rows in silence.
// Handles escaped pipes (`\|`), link-form cell names and several tables in one
// file (only tables whose header has both Cell and Status are cell tables).
import { oneLine } from './fields.mjs';

/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** Which column holds what. `name` and `status` are what makes a table a cell table.
 * @typedef {{ name: number, status: number, area?: number,
 *   lastVisit?: number, nextStep?: number }} Columns */

export const STATUSES = ['📋', '🔵', '⏸', '✔'];
export const HEADER = [
  '# INDEX',
  '',
  'Derived projection of `log.md` — if they disagree, the log wins.',
  'Status: 📋 planned · 🔵 active (max ONE) · ⏸ paused · ✔ done.',
  '',
  '| Cell | Area | Status | Last visit | Next step (1 line) |',
  '|---|---|---|---|---|',
].join('\n');

const ESC = '\u0000'; // stand-in for `\|`; never occurs in markdown

/** @type {(line: string) => string[]} */
function splitRow(line) {
  const parts = line.replaceAll('\\|', ESC).split('|');
  if (parts[0]?.trim() === '') parts.shift();
  if (parts[parts.length - 1]?.trim() === '') parts.pop();
  return parts.map((p) => p.replaceAll(ESC, '|').trim());
}

/** @type {(cells: string[]) => boolean} */
function isSeparator(cells) {
  return cells.length > 0 && cells.every((c) => c.length >= 3 && /^:?-+:?$/.test(c));
}

/** @type {(cells: string[]) => Columns | 'skip'} */
function mapColumns(cells) {
  /** @type {Record<string, number>} */
  const col = {};
  cells.forEach((/** @type {string} */ c, /** @type {number} */ i) => {
    if (c.startsWith('Cell')) col.name = i;
    else if (c.startsWith('Area')) col.area = i;
    else if (c.startsWith('Status')) col.status = i;
    else if (c.startsWith('Last visit')) col.lastVisit = i;
    else if (c.startsWith('Next step')) col.nextStep = i;
  });
  // Both present is exactly what `Columns` claims, so the assertion records the check.
  return col.name !== undefined && col.status !== undefined
    ? /** @type {Columns} */ (col)
    : 'skip';
}

// `[name](cells/slug.md)` -> { name, slug }; `Name — [note](x)` -> name before the link.
/** @type {(text: string) => { name: string, slug: string | null }} */
function splitLink(text) {
  if (text.startsWith('[') && text.endsWith(')')) {
    const close = text.indexOf('](');
    if (close > 0) {
      const href = text.slice(close + 2, -1);
      const tail = href.slice(href.lastIndexOf('/') + 1);
      return { name: text.slice(1, close).trim(), slug: tail.replace(/\.md$/, '') || null };
    }
  }
  const open = text.indexOf('[');
  const base = open >= 0 ? text.slice(0, open) : text;
  return { name: base.trim().replace(/[\s—·-]+$/, '').trim(), slug: null };
}

/** @param {unknown} text @returns {IndexRow[]} */
export function parseIndex(text) {
  /** @type {IndexRow[]} */
  const rows = [];
  /** @type {Columns | 'skip' | null} */
  let col = null;
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) { col = null; continue; }
    const cells = splitRow(line);
    if (isSeparator(cells)) continue;
    if (col === null) { col = mapColumns(cells); continue; }
    if (col === 'skip') continue;
    /** @type {(i: number | undefined) => string} */
    const at = (i) => (i === undefined ? '' : cells[i] ?? '');
    const statusRaw = at(col.status);
    rows.push({
      ...splitLink(at(col.name)),
      area: at(col.area),
      status: STATUSES.find((s) => statusRaw.includes(s)) ?? statusRaw,
      lastVisit: at(col.lastVisit),
      nextStep: at(col.nextStep),
    });
  }
  return rows;
}

/** @type {(value: unknown) => string} */
const cellText = (value) => oneLine(value, '—').replaceAll('|', '\\|');

/** @type {(row: IndexRow) => string} */
function renderRow(row) {
  const name = cellText(row.name);
  const label = row.slug ? `[${name}](cells/${row.slug}.md)` : name;
  return `| ${label} | ${cellText(row.area)} | ${row.status} | `
    + `${cellText(row.lastVisit)} | ${cellText(row.nextStep)} |`;
}

/** @param {ReadonlyArray<IndexRow>} rows @returns {string} */
export function renderIndex(rows) {
  const body = rows.map(renderRow).join('\n');
  return `${HEADER}\n${body}${body ? '\n' : ''}`;
}

// Replace the row with the same slug or the same name, else append. Matching on
// both keeps hand-written, slugless rows (the method allows manual editing) from
// being duplicated by the CLI.
/** @param {ReadonlyArray<IndexRow>} rows @param {IndexRow} row @returns {IndexRow[]} */
export function upsertRow(rows, row) {
  const name = String(row.name ?? '').trim().toLowerCase();
  const at = rows.findIndex((r) => (row.slug && r.slug === row.slug)
    || String(r.name ?? '').trim().toLowerCase() === name);
  if (at < 0) return [...rows, row];
  const next = rows.slice();
  next[at] = { ...rows[at], ...row };
  return next;
}
