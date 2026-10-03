// PURE. Which listed files count as SOURCE, and which of them is the newest.
//
// This is the whole arithmetic behind "the evidence is stale". It is a separate module
// because it is the one piece of the freshness rule that is a judgement rather than a
// comparison: a README edited after the test run does not invalidate the test run, and
// treating it as if it did would train people to ignore a warning that cries wolf.
//
// So: source means CODE. The three legs of Trilateral Verification read `.mjs`, `.js` and
// `.ts`; nothing else can change what a type checker, a module load or a test run would say.

/** @typedef {import('./types.mjs').RepoFile} RepoFile */

/** The extensions whose change can alter a typecheck, a module load or a test result. */
export const CODE_EXTENSIONS = Object.freeze(['.mjs', '.js', '.cjs', '.ts']);

/** PURE. @param {string} path @returns {boolean} */
export const isSource = (path) => CODE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext));

/**
 * PURE. The most recently modified source file, or `null` when the listing has none.
 * Ties are broken by path so the answer is the same on every run.
 * @param {ReadonlyArray<RepoFile>} listed @returns {RepoFile | null}
 */
export function newestSource(listed) {
  /** @type {RepoFile | null} */
  let newest = null;
  for (const file of listed) {
    if (!isSource(file.path)) continue;
    if (newest === null
      || file.modifiedMs > newest.modifiedMs
      || (file.modifiedMs === newest.modifiedMs && file.path < newest.path)) {
      newest = file;
    }
  }
  return newest;
}
