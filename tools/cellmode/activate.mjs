// activate.mjs — the machinery the lifecycle transitions share, extracted from
// transitions.mjs so that each file stays one responsibility and under the limit:
// the integrity guard every transition runs FIRST, the one-active-cell refusal, and
// the single write path that turns a cell 🔵 (new, promoted from 📋, resumed from ⏸).
//
// There is exactly one way to become active, and it lives here. That is what makes
// "the cell file, the INDEX row and CURRENT-CELL always agree after an activation" a
// property of the code rather than a habit of whoever wrote the last transition.
import { today } from './clock.mjs';
import { slugify } from './slug.mjs';
import { makeCell } from './cell-file.mjs';
import { upsertRow } from './index-table.mjs';
import { checkState, formatFindings } from './check.mjs';
import { CliError, EXIT } from './errors.mjs';
import {
  readState, readCell, writeCell, writeIndex, writeCurrentActive,
} from './state.mjs';

/** @typedef {import('./types.mjs').Cell} Cell */
/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** @typedef {import('./types.mjs').State} State */

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
export function refuseIfActive(st) {
  const active = st.indexRows.find((r) => r.status === '🔵');
  if (active) {
    throw new CliError(`cell "${active.name}" is active (🔵) — pause it first: `
      + 'cellmode pause --facts "..." --next "..."', EXIT.ACTIVE_CELL);
  }
}

/** @type {(row: IndexRow) => string} */
export const rowSlug = (row) => row.slug || slugify(row.name);

// Drop absent options so an unset `--area` never erases what the cell file holds.
/** @type {(obj: Record<string, unknown>) => Record<string, unknown>} */
const defined = (obj) => Object.fromEntries(
  Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''),
);

/** @param {string} root @param {State} st
 * @param {{ row: IndexRow | undefined, name: string, slug: string,
 *   patch: Record<string, unknown>, env: NodeJS.ProcessEnv | undefined }} what @returns {Cell} */
export function activate(root, st, { row, name, slug, patch, env }) {
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
