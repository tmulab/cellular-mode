// transitions.mjs — the four lifecycle transitions that need the integrity
// guard: open (new or 📋→🔵), resume (⏸→🔵), pause (🔵→⏸), complete (🔵→✔).
import { now, today } from './clock.mjs';
import { slugify, findCell } from './slug.mjs';
import { makeCell } from './cell-file.mjs';
import { upsertRow } from './index-table.mjs';
import { reconnectLines } from './projections.mjs';
import { checkState, formatFindings } from './check.mjs';
import { CliError, EXIT } from './errors.mjs';
import {
  readState, readCell, writeCell, writeIndex, writeCurrentActive, writeCurrentIdle, appendLog,
} from './state.mjs';
import {
  assertAllowed, assertNoPositional, requireOption, requireName,
} from './args.mjs';

/** @typedef {import('./types.mjs').Cell} Cell */
/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** @typedef {import('./types.mjs').State} State */
/** @typedef {import('./types.mjs').ParsedArgs} ParsedArgs */
/** @typedef {import('./types.mjs').CommandResult} CommandResult */

/** @param {string} root @returns {State} */
export function guardedState(root) {
  const st = readState(root);
  const findings = checkState(st);
  if (findings.length) {
    throw new CliError(`integrity check failed — the log is truth, fix the projections:\n${
      formatFindings(findings)}`, EXIT.INTEGRITY);
  }
  return st;
}

/** @param {State} st */
function refuseIfActive(st) {
  const active = st.indexRows.find((r) => r.status === '🔵');
  if (active) {
    throw new CliError(`cell "${active.name}" is active (🔵) — pause it first: `
      + 'cellmode pause --facts "..." --next "..."', EXIT.ACTIVE_CELL);
  }
}

/** @type {(row: IndexRow) => string} */
const rowSlug = (row) => row.slug || slugify(row.name);

// Drop absent options so an unset `--area` never erases what the cell file holds.
/** @type {(obj: Record<string, unknown>) => Record<string, unknown>} */
const defined = (obj) => Object.fromEntries(
  Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''),
);

/** @param {string} root @param {State} st
 * @param {{ row: IndexRow | undefined, name: string, slug: string,
 *   patch: Record<string, unknown>, env: NodeJS.ProcessEnv | undefined }} what @returns {Cell} */
function activate(root, st, { row, name, slug, patch, env }) {
  const day = today(env);
  const prior = readCell(root, slug);
  const opened = prior && prior.opened !== '—' ? prior.opened : day;
  const cell = makeCell({
    ...(prior ?? {}), name, id: slug, ...defined(patch), opened, status: '🔵',
  });
  if (!patch.area && row?.area && cell.area === '—') cell.area = row.area;
  writeCell(root, cell);
  const rows = upsertRow(st.indexRows, {
    name: cell.name, slug, area: cell.area, status: '🔵', lastVisit: day, nextStep: cell.nextStep,
  });
  writeIndex(root, rows);
  writeCurrentActive(root, cell);
  return cell;
}

/** @param {string} root @param {ParsedArgs} args @param {NodeJS.ProcessEnv} [env] @returns {CommandResult} */
export function cmdOpen(root, { positional, options }, env) {
  assertAllowed(options, ['root', 'area', 'objective', 'in', 'out', 'done'], 'open');
  const name = requireName(positional, 'open');
  const st = guardedState(root);
  refuseIfActive(st);
  const slug = slugify(name);
  const row = st.indexRows.find((r) => rowSlug(r) === slug);
  if (row && row.status === '✔') {
    throw new CliError(`cell "${row.name}" is done (✔) — ✔ is terminal; `
      + 'reopening means a NEW cell with a new name', EXIT.USAGE);
  }
  if (row && row.status === '⏸') {
    throw new CliError(`cell "${row.name}" is paused — use: cellmode resume "${row.name}"`,
      EXIT.USAGE);
  }
  const cell = activate(root, st, {
    row,
    name: row?.name || name,
    slug,
    env,
    patch: {
      area: options.area,
      objective: options.objective,
      boundaryIn: options.in,
      boundaryOut: options.out,
      doneCriterion: options.done,
    },
  });
  const promoted = row?.status === '📋' ? ' — promoted from 📋 (an opening, not a resume)' : '';
  return { lines: [`Opened "${cell.name}" (${slug}) · 🔵${promoted}`, `NEXT STEP: ${cell.nextStep}`] };
}

/** @param {string} root @param {ParsedArgs} args @param {NodeJS.ProcessEnv} [env] @returns {CommandResult} */
export function cmdResume(root, { positional, options }, env) {
  assertAllowed(options, ['root'], 'resume');
  const query = requireName(positional, 'resume');
  const st = guardedState(root);
  refuseIfActive(st);
  const paused = st.indexRows.filter((r) => r.status === '⏸');
  const hit = findCell(paused, query);
  if (hit.kind === 'none') {
    throw new CliError(`no paused cell matches "${query}"`, EXIT.USAGE);
  }
  if (hit.kind === 'ambiguous') {
    throw new CliError(`"${query}" matches more than one paused cell — be specific:\n${
      hit.candidates.map((c) => `- ${c.name}`).join('\n')}`, EXIT.AMBIGUOUS);
  }
  const cell = activate(root, st, {
    row: hit.row, name: hit.row.name, slug: rowSlug(hit.row), env, patch: {},
  });
  return { lines: [...reconnectLines(cell), 'Shall we continue?'] };
}

/** @param {string} root @param {State} st @param {IndexRow} row
 * @param {{ status: string, facts: string, next: string, decisions?: unknown,
 *   build?: unknown, note?: unknown }} entry @param {NodeJS.ProcessEnv} [env] @returns {Cell} */
function close(root, st, row, entry, env) {
  const slug = rowSlug(row);
  const stamp = now(env);
  const prior = readCell(root, slug) ?? makeCell({ name: row.name, id: slug, area: row.area });
  const build = entry.build ?? prior.build;
  // Log first: truth before projections.
  appendLog(root, { ...entry, timestamp: stamp, cell: row.name, build });
  const cell = makeCell({
    ...prior,
    name: row.name,
    id: slug,
    status: entry.status,
    lastFact: entry.facts,
    build,
    decisions: entry.decisions ?? prior.decisions,
    nextStep: entry.next,
  });
  writeCell(root, cell);
  const rows = upsertRow(st.indexRows, {
    name: row.name,
    slug,
    area: cell.area,
    status: entry.status,
    lastVisit: stamp.slice(0, 10),
    nextStep: entry.next,
  });
  writeIndex(root, rows);
  writeCurrentIdle(root, rows);
  return cell;
}

/** @param {State} st @returns {IndexRow} */
function activeRowOrFail(st) {
  const row = st.indexRows.find((r) => r.status === '🔵');
  if (!row) throw new CliError('no active cell — see `cellmode status`', EXIT.USAGE);
  return row;
}

/** @param {string} root @param {ParsedArgs} args @param {NodeJS.ProcessEnv} [env] @returns {CommandResult} */
export function cmdPause(root, { positional, options }, env) {
  assertAllowed(options, ['root', 'facts', 'next', 'decisions', 'build', 'note'], 'pause');
  assertNoPositional(positional, 'pause');
  const st = guardedState(root);
  const row = activeRowOrFail(st);
  const facts = requireOption(options, 'facts', 'pause');
  const next = requireOption(options, 'next', 'pause');
  const cell = close(root, st, row, {
    status: '⏸', facts, next, decisions: options.decisions, build: options.build, note: options.note,
  }, env);
  return { lines: [`Paused "${cell.name}" · ⏸`, `NEXT STEP: ${next}`, 'Cells know how to wait.'] };
}

/** @param {string} root @param {ParsedArgs} args @param {NodeJS.ProcessEnv} [env] @returns {CommandResult} */
export function cmdComplete(root, { positional, options }, env) {
  assertAllowed(options, ['root', 'facts', 'decisions', 'build', 'confirm', 'note'], 'complete');
  assertNoPositional(positional, 'complete');
  const st = guardedState(root);
  const row = activeRowOrFail(st);
  if (options.confirm !== true) {
    throw new CliError('human confirmation required: marking a cell ✔ is the human\'s call — '
      + 're-run with --confirm', EXIT.NEEDS_CONFIRMATION);
  }
  const facts = requireOption(options, 'facts', 'complete');
  const cell = close(root, st, row, {
    status: '✔', facts, next: '—', decisions: options.decisions, build: options.build, note: options.note,
  }, env);
  return { lines: [`Completed "${cell.name}" · ✔`, 'Cell file kept as history.'] };
}
