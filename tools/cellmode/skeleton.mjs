// skeleton.mjs — the empty vault/state produced by `cellmode init`.
// templates/vault/state/ ships byte-identical copies of these files so that
// adopters who prefer no tooling can simply copy the folder. A test asserts
// the identity, so this function is the only place the skeleton is defined.
import { HEADER as LOG_HEADER } from './log.mjs';
import { renderIndex } from './index-table.mjs';
import { renderNoActive } from './projections.mjs';

export const PARKING_LOT_HEADER = [
  '# Parking lot',
  '',
  'One line per captured idea. Nothing is ever deleted here.',
  'Format: `- [YYYY-MM-DD] <idea> (context: cell <name>)`',
  'Promoted to a cell → append `✔ → cell <name>` to its line.',
  '',
].join('\n');

export const CELLS_README = [
  '# Cells',
  '',
  'One file per cell: `<slug>.md`, where the slug is the cell ID.',
  'These files are projections of `../log.md` — if they disagree, the log wins.',
  'A done (✔) cell file is history: never delete it. Reopening means a new cell.',
  '',
].join('\n');

// Relative POSIX paths -> file content. Keys are relative to the state folder.
/** @returns {Record<string, string>} */
export function skeletonFiles() {
  return {
    'log.md': LOG_HEADER,
    'INDEX.md': renderIndex([]),
    'CURRENT-CELL.md': renderNoActive([]),
    'parking-lot.md': PARKING_LOT_HEADER,
    'cells/README.md': CELLS_README,
  };
}
