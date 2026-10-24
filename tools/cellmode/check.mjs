// check.mjs — the integrity guard, pure. Run at the start of every cell/pause
// operation. The log is truth; a projection that disagrees with it is a bug to
// report, never something to paper over.
import { entriesFor, lastEntryFor } from './log.mjs';
import { oneLine } from './fields.mjs';

/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** @typedef {import('./types.mjs').LogEntry} LogEntry */
/** @typedef {import('./types.mjs').CurrentCell} CurrentCell */
/** @typedef {import('./types.mjs').Finding} Finding */
/** @typedef {import('./types.mjs').Operation} Operation */

export const CODES = {
  LOG_SHRUNK: 'log-shrunk',
  TWO_ACTIVE: 'two-active',
  OVER_CEILING: 'over-ceiling',
  CURRENT_MISMATCH: 'current-cell-mismatch',
  STATUS_MISMATCH: 'status-mismatch',
};

const RECORDED = ['⏸', '✔'];
/** @type {(r: { name?: unknown }) => string} */
const name = (r) => oneLine(r.name, 'unnamed');

/**
 * How many cells may be 🔵 at once. With no 🔵 operation the answer is the old rule, ONE.
 * Inside one it is the pack's `max-active-cells`; a pack that grants none — or grants
 * something that is not a positive whole number — also means one: fail closed, never a
 * guess. The in-operation transitions read the same function, so the ceiling the guard
 * reports and the ceiling `open` enforces cannot drift apart.
 * @param {Operation | null} [operation] @returns {number}
 */
export function ceilingOf(operation) {
  if (!operation || operation.status !== '🔵') return 1;
  const n = Number.parseInt(operation.pack.maxActiveCells, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/**
 * @param {{ indexRows?: ReadonlyArray<IndexRow>, logEntries?: ReadonlyArray<LogEntry>,
 *   current?: CurrentCell | null, operation?: Operation | null }} [state]
 * @returns {Finding[]}
 */
export function checkState({
  indexRows = [], logEntries = [], current = null, operation = null,
} = {}) {
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

  // 2. At most one active cell — or, inside an operation, at most the pack's ceiling.
  //    Two findings, because the two states are different: outside an operation a second
  //    🔵 cell is the old breach, inside one it is a breach of a NAMED ceiling.
  const active = indexRows.filter((r) => r.status === '🔵');
  const inOperation = operation !== null && operation.status === '🔵';
  const ceiling = ceilingOf(operation);
  if (active.length > ceiling) {
    const who = active.map(name).join(', ');
    if (inOperation) {
      add(CODES.OVER_CEILING, `${active.length} active cells (🔵) in operation `
        + `"${name(operation)}" — max-active-cells: ${ceiling}: ${who}`);
    } else {
      add(CODES.TWO_ACTIVE, `more than one active cell (🔵): ${who}`);
    }
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
  } else if (inOperation && active.length > 1) {
    // Several cells are legitimately 🔵: the file projects the most recent of them above
    // the table of all of them, so the test is MEMBERSHIP and not equality.
    const shown = current === null ? '' : oneLine(current.name);
    if (shown === '') {
      add(CODES.CURRENT_MISMATCH, `CURRENT-CELL.md shows no active cell but ${active.length} `
        + 'cells are 🔵 in INDEX.md');
    } else if (!active.some((r) => oneLine(r.name).toLowerCase() === shown.toLowerCase())) {
      add(CODES.CURRENT_MISMATCH, `CURRENT-CELL.md points to "${shown}" but it is not one of `
        + `the ${active.length} 🔵 cells in INDEX.md`);
    }
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
