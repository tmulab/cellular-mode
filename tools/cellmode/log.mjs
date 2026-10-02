// log.mjs — vault/state/log.md: the single source of truth. APPEND-ONLY.
// One entry per closure (pause or completion), newest last. Nothing here
// rewrites text; rendering produces the block that callers append verbatim.
import { parseFields, oneLine } from './fields.mjs';

/** @typedef {import('./types.mjs').LogEntry} LogEntry */
/** @typedef {import('./types.mjs').LogDraft} LogDraft */

export const HEADER = [
  '# Cell log',
  '',
  'APPEND-ONLY — never edit or reorder past entries. Newest entry last.',
  'This file is the single source of truth; INDEX.md, CURRENT-CELL.md and',
  'cells/*.md are projections of it. Planned (📋) cells have no entry: they',
  'never ran, and inventing one would be fiction in an append-only record.',
  '',
].join('\n');

const HEAD = /^##\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+·\s+Cell:\s*(.+)$/;

/** @param {LogDraft} entry @returns {string} */
export function renderLogEntry(entry) {
  const lines = [
    '---',
    `## ${entry.timestamp} · Cell: ${oneLine(entry.cell, 'unnamed')}`,
    `**Status:** ${entry.status}`,
    `**Facts:** ${oneLine(entry.facts)}`,
    `**Decisions:** ${oneLine(entry.decisions)}`,
    `**Build:** ${oneLine(entry.build)}`,
    `**Next step:** ${oneLine(entry.next)}`,
  ];
  if (oneLine(entry.note, '') !== '') {
    lines.push(`**Personal note (optional):** ${oneLine(entry.note)}`);
  }
  return `\n${lines.join('\n')}\n`;
}

/** @param {unknown} text @returns {LogEntry[]} */
export function parseLog(text) {
  /** @type {LogEntry[]} */
  const entries = [];
  const lines = String(text ?? '').split('\n');
  /** @type {{ timestamp: string, cell: string, body: string[] } | null} */
  let open = null;
  const flush = () => {
    if (!open) return;
    const f = parseFields(open.body.join('\n'));
    entries.push({
      timestamp: open.timestamp,
      date: open.timestamp.slice(0, 10),
      cell: open.cell,
      status: f.Status ?? '',
      facts: f.Facts ?? '',
      decisions: f.Decisions ?? '',
      build: f.Build ?? '',
      next: f['Next step'] ?? '',
      note: f['Personal note (optional)'] ?? '',
    });
    open = null;
  };
  for (const raw of lines) {
    const hit = HEAD.exec(raw.trim());
    if (hit) {
      flush();
      open = { timestamp: hit[1] ?? '', cell: (hit[2] ?? '').trim(), body: [] };
      continue;
    }
    if (open) open.body.push(raw);
  }
  flush();
  return entries;
}

/** @type {(s: unknown) => string} */
const norm = (s) => String(s ?? '').trim().toLowerCase();

/** @param {ReadonlyArray<LogEntry>} entries @param {unknown} cellName @returns {LogEntry[]} */
export function entriesFor(entries, cellName) {
  return entries.filter((e) => norm(e.cell) === norm(cellName));
}

/** @param {ReadonlyArray<LogEntry>} entries @param {unknown} cellName
 * @returns {LogEntry | null} */
export function lastEntryFor(entries, cellName) {
  const own = entriesFor(entries, cellName);
  return own[own.length - 1] ?? null;
}
