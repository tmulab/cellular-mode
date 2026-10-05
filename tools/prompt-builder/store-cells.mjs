// store-cells.mjs — the ONE place the Builder writes inside `vault/state/`, and it writes
// exactly one thing: a 📋 PLANNED cell.
//
// WHY A SECOND DISK MODULE. store.mjs is the Builder's filesystem boundary for its OWN
// documents (`vault/builder/`, `vault/project-contract.json`) and is at the 200-line limit.
// This file is a different boundary with a different rule, and merging them would hide that:
// store.mjs never writes in `vault/state/` at all — it only READS the index through cellmode's
// parser — whereas everything here delegates the write to cellmode's own commands.
//
// NOTHING HERE IMPLEMENTS A TRANSITION. `cmdPlan` creates the row and the cell file; the
// drafted boundary is then written back through cellmode's `writeCell`, the same function
// `cmdPlan` itself used. So the Builder adds no second way for a cell to come into existence:
//   * no log entry — a planned cell never ran, and `cmdPlan` writes none;
//   * no 🔵 and no CURRENT-CELL write — activation is `cellmode open`, and the human's;
//   * nothing is overwritten — an existing slug is refused before `cmdPlan` is called.
// The drafted fields survive the human's later `cellmode open`: `activate()` spreads the cell
// file it finds BEFORE the command's options and drops absent options, so a boundary nobody
// passed on the command line is kept. accept.test.mjs proves that by running `cmdOpen`.
import { existsSync } from 'node:fs';
import { makeCell } from '../cellmode/cell-file.mjs';
import { statePaths } from '../cellmode/paths.mjs';
import { slugify } from '../cellmode/slug.mjs';
import { cmdPlan } from '../cellmode/commands.mjs';
import { readCell, readState, writeCell } from '../cellmode/state.mjs';
import { BuilderError, CODES } from './errors.mjs';

/** @typedef {import('../cellmode/types.mjs').Cell} Cell */

export const CELLS_REL = 'vault/state/cells';

/** READ-ONLY. Is there already a cell under this slug — a row in the index, or a file?
 * Both are asked: a hand-written cell file with no row is still somebody's work.
 * @param {string} root @param {string} slug @returns {boolean} */
export function plannedCellExists(root, slug) {
  if (existsSync(statePaths(root).cellFile(slug))) return true;
  return readState(root).indexRows.some((row) => (row.slug || slugify(row.name)) === slug);
}

/**
 * Creates a 📋 PLANNED cell carrying the drafted boundary, through cellmode's own API.
 * Two writes, both cellmode's: `cmdPlan` (index row + cell file + no log entry), then
 * `writeCell` with the drafted fields merged over what `cmdPlan` wrote, keeping its `opened`
 * date and its 📋 status.
 * @param {string} root @param {Cell} cell
 * @param {{ env?: NodeJS.ProcessEnv | undefined }} [options]
 * @returns {{ slug: string, file: string, lines: string[] }}
 */
export function createPlannedCell(root, cell, options = {}) {
  const name = String(cell?.name ?? '').trim();
  if (name === '') throw new BuilderError(CODES.BAD_ENTRY, 'a planned cell needs a name');
  const slug = String(cell.id ?? '').trim() || slugify(name);
  if (plannedCellExists(root, slug)) {
    throw new BuilderError(
      CODES.CELL_EXISTS,
      `a cell already exists under "${slug}" — the Builder never overwrites one`,
      { slug },
    );
  }
  const planResult = cmdPlan(
    root,
    { positional: [name], options: { area: cell.area, objective: cell.objective } },
    options.env,
  );
  const planned = readCell(root, slug);
  writeCell(root, makeCell({
    ...cell,
    id: slug,
    opened: planned !== null && planned.opened !== '—' ? planned.opened : cell.opened,
    status: '📋',
  }));
  return { slug, file: `${CELLS_REL}/${slug}.md`, lines: planResult.lines ?? [] };
}
