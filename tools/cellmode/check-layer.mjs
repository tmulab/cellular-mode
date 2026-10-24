// check-layer.mjs — the one impure step of the operation layer of the integrity guard.
// It takes the reads `state.mjs` has already performed (the raw operation files, the
// parsed operations, a reader for the cell files) and composes the PURE operation rules
// (`check-operation.mjs`) with the git ones (`check-git.mjs`).
//
// It opens no vault file of its own, so `state.mjs` stays the only module that does, and
// `check.mjs` stays PURE: `readState` hands these findings to `checkState`, which appends
// them to its own four. That is what keeps `tools/cellmode/check.mjs` importable by the
// Observer plugins as a pure function (tools/gates/allowlists.mjs).
//
// A vault with NO operation file, or with none still open, adds NOTHING: the same
// findings in the same order, and the same bytes in the output, as before this layer
// existed — the property `check-operation.test.mjs` pins.
import { slugify } from './slug.mjs';
import { parseOperationEntries, checkOperations, DONE } from './check-operation.mjs';
import { checkGit } from './check-git.mjs';

/** @typedef {import('./types.mjs').Finding} Finding */
/** @typedef {import('./types.mjs').Cell} Cell */
/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** @typedef {import('./types.mjs').Operation} Operation */

/** The UNKNOWN notice is printed at most once per process: it is a line in the output,
 * never a finding, and repeating it per command would not make it truer. */
let noticed = false;

/**
 * @param {{ root?: string, logText?: string, rows?: ReadonlyArray<IndexRow>,
 *   texts?: ReadonlyArray<{ slug: string, text: string }>,
 *   operations?: ReadonlyArray<Operation>, cell?: (slug: string) => Cell | null,
 *   stderr?: { write: (text: string) => unknown } }} [input] @returns {Finding[]}
 */
export function operationLayerFindings({
  root = '', logText = '', rows = [], texts = [], operations = [],
  cell = () => null, stderr = process.stderr,
} = {}) {
  if (texts.length === 0) return [];
  const cells = rows.flatMap((r) => cell(r.slug || slugify(r.name)) ?? []);
  const entries = parseOperationEntries(logText);
  const findings = checkOperations({ operations, texts, entries, cells });
  // With every operation ✔ there is nothing left for git to be asked about, so it is not
  // asked and there is no UNKNOWN to report: the two rules read OPEN operations only.
  if (operations.every((o) => o.status === DONE)) return findings;
  const { findings: gitFindings, notice } = checkGit({
    root, operations, cells, entries, logText,
  });
  if (notice !== '' && !noticed) {
    noticed = true;
    stderr.write(`cellmode check · ${notice}\n`);
  }
  return [...findings, ...gitFindings];
}
