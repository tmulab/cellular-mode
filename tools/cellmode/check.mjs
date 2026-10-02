// check.mjs — the integrity guard, pure. Run at the start of every cell/pause
// operation. The log is truth; a projection that disagrees with it is a bug to
// report, never something to paper over.
import { entriesFor, lastEntryFor } from './log.mjs';
import { oneLine } from './fields.mjs';

/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** @typedef {import('./types.mjs').LogEntry} LogEntry */
/** @typedef {import('./types.mjs').CurrentCell} CurrentCell */
/** @typedef {import('./types.mjs').Finding} Finding */

export const CODES = {
  LOG_SHRUNK: 'log-shrunk',
  TWO_ACTIVE: 'two-active',
  CURRENT_MISMATCH: 'current-cell-mismatch',
  STATUS_MISMATCH: 'status-mismatch',
};

const RECORDED = ['⏸', '✔'];
/** @type {(r: { name?: unknown }) => string} */
const name = (r) => oneLine(r.name, 'unnamed');

/**
 * @param {{ indexRows?: ReadonlyArray<IndexRow>, logEntries?: ReadonlyArray<LogEntry>,
 *   current?: CurrentCell | null }} [state] @returns {Finding[]}
 */
export function checkState({ indexRows = [], logEntries = [], current = null } = {}) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {(code: string, message: string) => number} */
  const add = (code, message) => findings.push({ code, message });

  // 1. Resumable <=> recorded: every ⏸ or ✔ cell needs at least one log entry.
  //    (📋 planned cells are exempt — they never ran.)
  for (const row of indexRows) {
    if (!RECORDED.includes(row.status)) continue;
    if (entriesFor(logEntries, row.name).length === 0) {
      add(CODES.LOG_SHRUNK, `log shrunk: "${name(row)}" is ${row.status} in INDEX.md `
        + 'but has no entry in log.md');
    }
  }

  // 2. At most one active cell.
  const active = indexRows.filter((r) => r.status === '🔵');
  if (active.length > 1) {
    add(CODES.TWO_ACTIVE, `more than one active cell (🔵): ${active.map(name).join(', ')}`);
  }

  // 3. CURRENT-CELL.md must match the active cell, or say there is none.
  // `active[0]` is read once, as a value the checker can see is present.
  const want = active.length === 1 ? active[0] : undefined;
  if (want !== undefined) {
    const got = current;
    if (!got) {
      add(CODES.CURRENT_MISMATCH,
        `CURRENT-CELL.md shows no active cell but "${name(want)}" is 🔵 in INDEX.md`);
    } else if (oneLine(got.name).toLowerCase() !== oneLine(want.name).toLowerCase()) {
      add(CODES.CURRENT_MISMATCH,
        `CURRENT-CELL.md points to "${oneLine(got.name)}" but "${name(want)}" is 🔵 in INDEX.md`);
    }
  } else if (active.length === 0 && current) {
    add(CODES.CURRENT_MISMATCH,
      `CURRENT-CELL.md points to "${oneLine(current.name)}" but no cell is 🔵 in INDEX.md`);
  }

  // 4. Index status must agree with the last logged status for that cell.
  for (const row of indexRows) {
    if (!RECORDED.includes(row.status)) continue;
    const last = lastEntryFor(logEntries, row.name);
    if (!last || last.status === '') continue;
    if (last.status !== row.status) {
      add(CODES.STATUS_MISMATCH, `INDEX.md says ${row.status} for "${name(row)}" `
        + `but the last log entry says ${last.status}`);
    }
  }

  return findings;
}

/** @param {ReadonlyArray<Finding>} findings @returns {string} */
export function formatFindings(findings) {
  return findings.map((f) => `- [${f.code}] ${f.message}`).join('\n');
}
