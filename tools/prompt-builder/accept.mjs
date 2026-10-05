// accept.mjs — the step between "here is a proposal" and "a cell exists": the human accepts
// it, and a 📋 PLANNED cell appears. Nothing else happens, and that is the whole design.
//
// prompt-builder/CONTRACTS.md names four steps — prepare → approve → activate → complete —
// and this module is step 2 ONLY. It does not open the cell, does not write a log entry, does
// not touch CURRENT-CELL and does not mark anything ✔. Step 3 is the human running
// `cellmode open` / `/cell`; step 4 is the existing pause/complete ritual. A Builder that
// activated what it proposed would make "one ACTIVE cell at a time" its decision rather than
// the human's.
//
// THREE REFUSALS, IN THIS ORDER, each with its own code — the same arrangement as approve.mjs:
//   1. NEEDS_CONFIRMATION — `confirm` was not literally `true`. Asked first, before anything
//      is read: a human who has not confirmed is not told what else would have been wrong.
//   2. NOT_APPROVED — the contract behind the proposal is not approved. A first cell is bounded
//      by a contract, so a cell planned from an unapproved one would carry a boundary nobody
//      agreed to. Approval is `approveContract`'s to grant, and `isApproved` is the only reader.
//   3. CELL_EXISTS — raised by store-cells.mjs, before any write: a slug that already names a
//      cell belongs to somebody's work, and the Builder never overwrites one.
import { isApproved } from './approve.mjs';
import { BuilderError, CODES } from './errors.mjs';
import { createPlannedCell } from './store-cells.mjs';

/** @typedef {import('./first-cell.mjs').FirstCellProposal} FirstCellProposal */

/**
 * Creates the 📋 PLANNED cell for an accepted proposal. The only Builder function that writes
 * inside `vault/state/`, and it delegates every write to cellmode (see store-cells.mjs).
 * @param {string} root @param {FirstCellProposal} proposal
 * @param {{ confirm?: unknown, contract?: unknown,
 *   env?: NodeJS.ProcessEnv | undefined }} options
 * @returns {{ slug: string, kind: string, file: string, lines: string[] }}
 */
export function acceptFirstCell(root, proposal, options) {
  if (options?.confirm !== true) {
    throw new BuilderError(
      CODES.NEEDS_CONFIRMATION,
      'planning the first cell is a human decision — re-run it with --confirm',
    );
  }
  if (!isApproved(options.contract)) {
    throw new BuilderError(
      CODES.NOT_APPROVED,
      'the project contract is not approved — approve it before planning the first cell',
    );
  }
  const cell = proposal?.cell;
  if (cell === null || typeof cell !== 'object') {
    throw new BuilderError(CODES.BAD_ENTRY, 'a first-cell proposal must carry its cell');
  }
  const created = createPlannedCell(root, cell, { env: options.env });
  return { ...created, kind: String(proposal.kind ?? '') };
}
