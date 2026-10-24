// projections.mjs — CURRENT-CELL.md and the reconnection text.
// With an active cell the file is a copy of the cell file. Without one it names
// how many cells are waiting and the 3 most recently paused next steps —
// reconnection matters MOST when nothing is active.
import { renderCellFile, parseCellFile } from './cell-file.mjs';
import { oneLine } from './fields.mjs';

/** @typedef {import('./types.mjs').Cell} Cell */
/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** @typedef {import('./types.mjs').CurrentCell} CurrentCell */
/** @typedef {import('./types.mjs').Operation} Operation */

export const PAUSED_SHOWN = 3;

/** The header an ACTIVE operation adds above the cell projection (docs/03 §5). Plain
 * text on purpose: no `**Key:**` field, so `parseCurrentCell` still reads the cell
 * below it and no operation value can be mistaken for a cell value.
 * @param {Operation | null} [op] @returns {string[]} */
export function operationHeaderLines(op) {
  if (!op || op.status !== '🔵') return [];
  const ceiling = oneLine(op.pack.spendCeiling, '');
  const spend = `spend ${oneLine(op.spendSoFar)}${ceiling === '' ? '' : `/${ceiling}`}`;
  const items = op.finishLine.map((t, i) => `${i + 1}. ${t}`).join(' · ');
  return [
    `# Operation: ${oneLine(op.name, 'unnamed')} · ${op.status} · ${spend}`,
    `Finish line: ${items === '' ? '—' : items}`,
    '',
  ];
}

/** @type {(value: unknown) => string} */
const tableCell = (value) => oneLine(value).replaceAll('|', '\\|');

/** The table of the 🔵 cells an operation carries above the cell projection (docs/03 §5,
 * with the columns cell R4a declares: the conflict column belongs to the crossing, which
 * is not built). Rendered from the SECOND active cell on: with one active cell
 * CURRENT-CELL.md must stay exactly the operation header plus the cell file, byte for byte.
 * @param {ReadonlyArray<{ name?: unknown, area?: unknown, baseCommit?: unknown,
 *   nextStep?: unknown }>} cells @returns {string[]} */
export function activeCellsLines(cells) {
  if (cells.length < 2) return [];
  return [
    '| Cell | Area | Base commit | Next step |',
    '|---|---|---|---|',
    ...cells.map((c) => `| ${tableCell(c.name)} | ${tableCell(c.area)} | `
      + `${tableCell(c.baseCommit)} | ${tableCell(c.nextStep)} |`),
    '',
  ];
}

/** @param {Cell} cell @param {Operation | null} [op]
 * @param {ReadonlyArray<{ name?: unknown, area?: unknown, baseCommit?: unknown,
 *   nextStep?: unknown }>} [activeCells] @returns {string} */
export function renderCurrentCell(cell, op = null, activeCells = []) {
  const header = operationHeaderLines(op);
  // No header means no operation is 🔵, and then there is no table either: the table is
  // part of the operation projection, never of the plain one-active-cell file.
  const head = header.length === 0 ? [] : [...header, ...activeCellsLines(activeCells)];
  return head.length === 0 ? renderCellFile(cell) : `${head.join('\n')}\n${renderCellFile(cell)}`;
}

/** @param {ReadonlyArray<IndexRow>} rows @returns {IndexRow[]} */
export function byRecency(rows) {
  return rows.slice().sort((a, b) => String(b.lastVisit).localeCompare(String(a.lastVisit)));
}

/** @param {ReadonlyArray<IndexRow>} pausedRows @param {Operation | null} [op]
 * @returns {string} */
export function renderNoActive(pausedRows, op = null) {
  const paused = byRecency(pausedRows);
  /** @type {string[]} */
  const lines = [
    ...operationHeaderLines(op),
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
