// commands.mjs — the commands that do not change the active cell:
// init, plan, park, status, check. Lifecycle transitions live in transitions.mjs.
import { today } from './clock.mjs';
import { slugify } from './slug.mjs';
import { makeCell } from './cell-file.mjs';
import { upsertRow } from './index-table.mjs';
import { reconnectLines, summaryLines } from './projections.mjs';
import { checkState, formatFindings } from './check.mjs';
import { renderDependencies } from './deps.mjs';
import { oneLine } from './fields.mjs';
import { STATE_REL } from './paths.mjs';
import { CliError, EXIT } from './errors.mjs';
import {
  isInitialized, writeSkeleton, readState, readCell, writeCell, writeIndex, appendParkingLot,
  activeOperation,
} from './state.mjs';
import {
  assertAllowed, assertNoPositional, requireOption, requireName,
} from './args.mjs';
import {
  cmdOpen, cmdResume, cmdPause, cmdComplete,
} from './transitions.mjs';
import { cmdOp } from './operation-commands.mjs';
import { crossState, renderTable, worst } from './conflicts.mjs';
import {
  openInOperation, resumeInOperation, pauseInOperation, completeInOperation,
} from './cell-in-operation.mjs';

/** @typedef {import('./types.mjs').ParsedArgs} ParsedArgs */
/** @typedef {import('./cell-in-operation.mjs').InOperationFn} InOperationFn */
/** @typedef {import('./types.mjs').CommandResult} CommandResult */
/** @typedef {import('./types.mjs').CommandFn} CommandFn */

/** @param {string} root @param {ParsedArgs} args @returns {CommandResult} */
export function cmdInit(root, { positional, options }) {
  assertAllowed(options, ['root'], 'init');
  assertNoPositional(positional, 'init');
  if (isInitialized(root)) {
    throw new CliError(`${STATE_REL} already exists — refusing to overwrite existing state`,
      EXIT.USAGE);
  }
  writeSkeleton(root);
  return {
    lines: [
      `Initialized cellular-mode state in ${STATE_REL}`,
      'Next: cellmode open "<cell name>" --area "<package or topic>"',
    ],
  };
}

/** @param {string} root @param {ParsedArgs} args @param {NodeJS.ProcessEnv} [env] @returns {CommandResult} */
export function cmdPlan(root, { positional, options }, env) {
  assertAllowed(options, ['root', 'area', 'objective', 'deps'], 'plan');
  const name = requireName(positional, 'plan');
  const area = requireOption(options, 'area', 'plan');
  const st = readState(root);
  const slug = slugify(name);
  const clash = st.indexRows.find((r) => (r.slug || slugify(r.name)) === slug);
  if (clash) {
    throw new CliError(`cell "${clash.name}" already exists in INDEX.md (${clash.status})`,
      EXIT.USAGE);
  }
  const cell = makeCell({
    name, id: slug, area, objective: options.objective, opened: today(env), status: '📋',
    dependencies: renderDependencies(options.deps),
  });
  writeCell(root, cell);
  writeIndex(root, upsertRow(st.indexRows, {
    name, slug, area, status: '📋', lastVisit: '—', nextStep: '—',
  }));
  return {
    lines: [
      `Planned "${name}" (${slug}) · 📋 — no log entry: a planned cell never ran`,
      `Open it with: cellmode open "${name}"`,
    ],
  };
}

/** @param {string} root @param {ParsedArgs} args @param {NodeJS.ProcessEnv} [env] @returns {CommandResult} */
export function cmdPark(root, { positional, options }, env) {
  assertAllowed(options, ['root'], 'park');
  const idea = requireName(positional, 'park');
  const st = readState(root);
  const active = st.indexRows.find((r) => r.status === '🔵');
  const context = active ? `cell ${oneLine(active.name, 'unnamed')}` : 'no active cell';
  appendParkingLot(root, `- [${today(env)}] ${oneLine(idea)} (context: ${context})`);
  return { lines: [`Parked: ${oneLine(idea)} (context: ${context})`] };
}

/** @param {string} root @param {ParsedArgs} args @returns {CommandResult} */
export function cmdStatus(root, { positional, options }) {
  assertAllowed(options, ['root'], 'status');
  assertNoPositional(positional, 'status');
  const st = readState(root);
  const active = st.indexRows.find((r) => r.status === '🔵');
  if (!active) return { lines: summaryLines(st.indexRows) };
  const cell = readCell(root, active.slug || slugify(active.name))
    ?? makeCell({ name: active.name, area: active.area, nextStep: active.nextStep });
  return { lines: reconnectLines(cell) };
}

/**
 * `conflicts <cell>` — the mechanical crossing of one cell against every OTHER 🔵 cell of
 * the active operation (`conflicts.mjs`). READ-ONLY: it writes nothing, ever, and a
 * verdict is a report rather than a refusal — the refusal is `open`'s (exit 3).
 * @param {string} root @param {ParsedArgs} args @returns {CommandResult}
 */
export function cmdConflicts(root, { positional, options }) {
  assertAllowed(options, ['root'], 'conflicts');
  const name = requireName(positional, 'conflicts');
  const st = readState(root);
  if (st.operation === null) {
    throw new CliError('no operation is 🔵 — the crossing is between the cells of ONE '
      + 'operation (see `cellmode op status`)', EXIT.USAGE);
  }
  const slug = slugify(name);
  const cell = readCell(root, slug);
  if (cell === null) {
    throw new CliError(`no cell file for "${name}" (${slug}) — \`plan\` or \`open\` it first`,
      EXIT.USAGE);
  }
  const rows = crossState(root, st.indexRows, st.operation, cell.name || name, slug, cell);
  return {
    lines: [
      `Conflicts for "${cell.name || name}" (${slug}) · operation `
      + `"${oneLine(st.operation.name, 'unnamed')}" · ${rows.length} other 🔵 cell(s)`,
      ...renderTable(rows),
      `Verdict: ${worst(rows)}`,
    ],
  };
}

/** @param {string} root @param {ParsedArgs} args @returns {CommandResult} */
export function cmdCheck(root, { positional, options }) {
  assertAllowed(options, ['root'], 'check');
  assertNoPositional(positional, 'check');
  const st = readState(root);
  const findings = checkState(st);
  if (findings.length) {
    throw new CliError(`integrity check failed — the log is truth, fix the projections:\n${
      formatFindings(findings)}`, EXIT.INTEGRITY);
  }
  /** @type {(s: string) => number} */
  const count = (s) => st.indexRows.filter((r) => r.status === s).length;
  return {
    lines: [`Integrity check passed · ${count('🔵')} active · ${count('⏸')} paused · `
      + `${count('📋')} planned · ${count('✔')} done · ${st.logEntries.length} log entries`],
  };
}

/**
 * A cell transition has TWO laws, and which one applies is a fact on disk rather than a
 * flag: with no 🔵 operation the old one-active-cell law runs unchanged (same code, same
 * bytes, same exit codes), and with one the in-operation form runs. Nothing else in the
 * CLI branches on the operation layer.
 * @param {CommandFn} plain @param {InOperationFn} inOperation @returns {CommandFn}
 */
function byOperation(plain, inOperation) {
  return (root, args, env) => {
    // No state at all answers `null` without throwing, so "run `cellmode init` first"
    // keeps coming from the transition itself.
    const op = activeOperation(root);
    return op === null ? plain(root, args, env) : inOperation(root, args, env, op);
  };
}

/** @type {Record<string, CommandFn>} */
export const COMMANDS = {
  init: cmdInit,
  plan: cmdPlan,
  open: byOperation(cmdOpen, openInOperation),
  resume: byOperation(cmdResume, resumeInOperation),
  pause: byOperation(cmdPause, pauseInOperation),
  complete: byOperation(cmdComplete, completeInOperation),
  park: cmdPark,
  status: cmdStatus,
  check: cmdCheck,
  conflicts: cmdConflicts,
  op: cmdOp,
};
