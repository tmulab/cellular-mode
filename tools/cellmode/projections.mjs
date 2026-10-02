// projections.mjs — CURRENT-CELL.md and the reconnection text.
// With an active cell the file is a copy of the cell file. Without one it names
// how many cells are waiting and the 3 most recently paused next steps —
// reconnection matters MOST when nothing is active.
import { renderCellFile, parseCellFile } from './cell-file.mjs';
import { oneLine } from './fields.mjs';

/** @typedef {import('./types.mjs').Cell} Cell */
/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** @typedef {import('./types.mjs').CurrentCell} CurrentCell */

export const PAUSED_SHOWN = 3;

/** @param {Cell} cell @returns {string} */
export function renderCurrentCell(cell) {
  return renderCellFile(cell);
}

/** @param {ReadonlyArray<IndexRow>} rows @returns {IndexRow[]} */
export function byRecency(rows) {
  return rows.slice().sort((a, b) => String(b.lastVisit).localeCompare(String(a.lastVisit)));
}

/** @param {ReadonlyArray<IndexRow>} pausedRows @returns {string} */
export function renderNoActive(pausedRows) {
  const paused = byRecency(pausedRows);
  /** @type {string[]} */
  const lines = [
    '# Current cell',
    '',
    `No active cell · ${paused.length} paused — see INDEX.md`,
    '',
  ];
  for (const row of paused.slice(0, PAUSED_SHOWN)) {
    lines.push(`- **${oneLine(row.name, 'unnamed')}** → ${oneLine(row.nextStep)}`);
  }
  if (paused.length === 0) lines.push('Cells know how to wait.');
  lines.push('');
  return lines.join('\n');
}

// Which cell, if any, does CURRENT-CELL.md claim is active?
/** @param {unknown} text @returns {CurrentCell | null} */
export function parseCurrentCell(text) {
  const cell = parseCellFile(text);
  return cell ? { name: cell.name, id: cell.id, cell } : null;
}

// <=5 lines of reconnection for an active cell (spec: status output).
/** @param {Cell} cell @returns {string[]} */
export function reconnectLines(cell) {
  return [
    `Cell: ${oneLine(cell.name, 'unnamed')} (${oneLine(cell.area)}) · ${cell.status}`,
    `Last fact: ${oneLine(cell.lastFact)}`,
    `Build/typecheck: ${oneLine(cell.build)}`,
    `NEXT STEP: ${oneLine(cell.nextStep)}`,
  ];
}

// Summarized waiting list: <=8 lines, else 6 most recent plus a count line.
/** @param {ReadonlyArray<IndexRow>} rows @returns {string[]} */
export function summaryLines(rows) {
  const paused = byRecency(rows.filter((r) => r.status === '⏸'));
  const planned = rows.filter((r) => r.status === '📋');
  const head = `No active cell · ${paused.length} paused · ${planned.length} planned — see INDEX.md`;
  const shown = paused.length > 7 ? paused.slice(0, 6) : paused.slice(0, 7);
  const lines = [head, ...shown.map((r) => `- ${oneLine(r.name, 'unnamed')} → ${oneLine(r.nextStep)}`)];
  if (paused.length > shown.length) lines.push(`… and ${paused.length - shown.length} more`);
  return lines;
}
