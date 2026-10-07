// apply-extras.mjs — the two things that happen between "every planned file exists" and "the
// install manifest is written", both of which exist so that the manifest is TRUE rather than merely
// plausible.
//
// `refreshState` re-reads `vault/state/`. Planning the first cell writes a cell file and rewrites
// `INDEX.md`, both AFTER the skeleton was written and hashed. A manifest that kept the skeleton's
// hashes would be wrong about the target the moment it was written, and every later drift check
// would inherit the lie. VERIFIED: this function exists because the first run of the install test
// caught exactly that.
//
// `writeExtras` writes the files a FLOW contributes rather than a component — in this version, the
// adoption baseline of an existing project. They go through `writeNew` like everything else, so
// they are confined, never overwrite, and come back as `FileRecord`s the manifest records. They are
// written BEFORE the manifest for exactly the reason the manifest is last: a record that does not
// mention a file Bootstrap created is a record `uninstall` cannot act on.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { STATE_REL } from '../cellmode/paths.mjs';
import { confine, sha256, writeNew } from './writer.mjs';

/** @typedef {import('./install-manifest.mjs').FileRecord} FileRecord */
/** @typedef {{ path: string, bytes: string, mode: string }} Extra */

/** Re-reads `vault/state/` and makes the record TRUE again. Mutates `files` in place: entries it
 * already knows are corrected, files that appeared are added.
 * @param {string} targetRoot @param {FileRecord[]} files @returns {void} */
export function refreshState(targetRoot, files) {
  const base = `${STATE_REL}/`;
  /** @type {Map<string, FileRecord>} */
  const known = new Map(files.filter((file) => file.path.startsWith(base)).map((file) => [file.path, file]));
  /** @param {string} rel @returns {void} */
  const walk = (rel) => {
    for (const entry of readdirSync(confine(targetRoot, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) {
        const digest = sha256(readFileSync(confine(targetRoot, child)));
        const found = known.get(child);
        if (found === undefined) {
          files.push({ path: child, mode: 'generate', created: true, sha256Before: null, sha256After: digest });
        } else found.sha256After = digest;
      }
    }
  };
  if (existsSync(confine(targetRoot, STATE_REL))) walk(STATE_REL);
}

/** Writes the flow-contributed files and returns their records. @param {string} targetRoot
 * @param {ReadonlyArray<Extra>} extras @returns {FileRecord[]} */
export function writeExtras(targetRoot, extras) {
  return extras.map((extra) => ({ ...writeNew(targetRoot, extra.path, extra.bytes), mode: extra.mode }));
}
