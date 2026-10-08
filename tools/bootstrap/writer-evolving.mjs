// writer-evolving.mjs — the fourth and narrowest member of the writer family: the ONE way
// Bootstrap may REPLACE a file it already wrote, allowed for the EVOLVING files only.
//
// WHY IT IS A SEPARATE DOOR. `writer.mjs` promises two things that make an install auditable:
// never overwrite (`wx`) and never replace (a managed block is the only change to somebody
// else's file). The verification contract breaks neither promise and needs neither: it is the
// adopter's own live document (ownership class *evolving*, H3) and `verification add/run/approve`
// rewrites it on purpose. Giving `writeNew` a "replace" mode would have handed that power to
// every caller for every path; a separate function with a CLOSED path list hands it to one.
//
// THE LIST IS THE SECURITY BOUNDARY, and it is checked BEFORE `confine`, so a path outside it is
// refused whatever it resolves to. Everything else still applies: the path goes through `confine`
// (no `..`, no NUL, no symlinked segment, no escape from the target), and the replace is ATOMIC —
// a temporary file beside the target, then `rename` — so a crash leaves the previous contract
// intact rather than half a document that fails closed for a reason nobody can read.
import { existsSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { CODES, refuse } from './errors.mjs';
import { VERIFICATION_FILE } from './plan-constants.mjs';
import { confine, sha256 } from './writer-base.mjs';

/** @typedef {{ path: string, sha256After: string }} ReplaceRecord */

/** The closed list of files this door opens. Both ownership-class *evolving*; today, one file. */
export const REPLACEABLE = Object.freeze([VERIFICATION_FILE]);

/** The suffix of the temporary file an atomic replace goes through. Inside the target, so the
 * rename cannot cross a device boundary. */
export const TEMP_SUFFIX = '.cellular-replace-tmp';

/**
 * Replaces one evolving file, atomically. The file must already be there: this function updates a
 * document, and CREATING one is `writeNew`'s job and is recorded in the install manifest.
 * @param {string} targetRoot @param {string} rel @param {string | Uint8Array} bytes
 * @returns {ReplaceRecord}
 */
export function replaceEvolving(targetRoot, rel, bytes) {
  if (!REPLACEABLE.includes(String(rel))) {
    throw refuse(CODES.OUTSIDE_TARGET,
      `refused to replace ${String(rel)}: only the evolving files may be rewritten (${REPLACEABLE.join(', ')})`,
      { path: String(rel) });
  }
  const absolute = confine(targetRoot, rel);
  if (!existsSync(absolute)) {
    throw refuse(CODES.BAD_FACTS, `${rel} is not there, so there is nothing to replace`, { path: rel });
  }
  const temporary = confine(targetRoot, `${rel}${TEMP_SUFFIX}`);
  writeFileSync(temporary, bytes);
  try {
    renameSync(temporary, absolute);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The replace already failed; a leftover temporary is reported by `status` as unowned.
    }
    throw error;
  }
  return { path: String(rel), sha256After: sha256(bytes) };
}
