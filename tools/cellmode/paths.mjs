// paths.mjs — every path the CLI touches, derived from a single root.
import { join } from 'node:path';

export const STATE_REL = 'vault/state';

/** @param {string} root */
export function statePaths(root) {
  const state = join(root, 'vault', 'state');
  const cells = join(state, 'cells');
  return {
    root,
    state,
    cells,
    log: join(state, 'log.md'),
    index: join(state, 'INDEX.md'),
    current: join(state, 'CURRENT-CELL.md'),
    parkingLot: join(state, 'parking-lot.md'),
    /** @type {(slug: string) => string} */
    cellFile: (slug) => join(cells, `${slug}.md`),
  };
}
