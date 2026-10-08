// byte-equivalence.mjs — are the bytes on disk the bytes git would commit?
//
// WHY THIS EXISTS. `fingerprint.mjs` hashes the WORKING bytes; a commit records the bytes
// that come out of git's clean/eol filters (`.gitattributes`, `core.autocrlf`). Those two are
// the same thing only when nothing is converted. On 2026-10-04 they were not: sixteen working
// copies in this repository carried CRLF while their committed blobs carried LF, so the
// mandatory suite ran on bytes that would never be committed while the record's `tree` named
// the normalised state. Nobody lied; the equivalence was simply assumed. See
// tools/gates/FINAL-VERIFICATION.md, "Byte equivalence".
//
// THE CHECK. For every controlled path, two blob ids from git itself:
//   raw      `git hash-object --no-filters --stdin-paths`  the bytes as they sit on disk
//   filtered `git hash-object --stdin-paths`               the bytes git would store there
// Equal for every path, or the run REFUSES before the suite. Two batch invocations, never one
// per file. A file with `-text` has no filter to apply, so it is equal by construction — the
// check costs it nothing and cannot false-positive on it.
//
// FAIL CLOSED: a git command that does not succeed, a count git did not return, or a path that
// cannot survive a line-oriented protocol is an ERROR. "Could not compare" is never "equal".
import { controlledFiles, gitRun } from './fingerprint.mjs';

/** @typedef {{ equivalent: boolean, checked: number, differing: string[] }} Equivalence */

/** The one sentence a refusal must leave behind: what to do, as a command. */
export const CORRECTIVE_ACTION = 'restore the working copy from the index — `git add -A` then '
  + '`git checkout -- <files>` — or set the editor to LF, then re-run '
  + '`node tools/gates/verify-final.mjs` (or `npm run verify:final` where that script exists)';

/** At most this many paths are copied into the evidence record. A longer list belongs in the
 * terminal: a record is not a report. */
export const MAX_RECORDED = 50;

/** PURE. Paths a line-oriented stdin protocol cannot carry. Git's `--stdin-paths` reads one
 * path per line, so a name containing a newline would be read as two different files — which
 * is a comparison nobody should trust.
 * @param {ReadonlyArray<string>} paths @returns {string[]} */
export function unsafeForStdin(paths) {
  return paths.filter((path) => path.includes('\n') || path.includes('\r'));
}

/** PURE. The verdict over two id lists, in the order the paths were given.
 * @param {ReadonlyArray<string>} paths @param {ReadonlyArray<string>} raw
 * @param {ReadonlyArray<string>} filtered @returns {Equivalence} */
export function compareIds(paths, raw, filtered) {
  if (raw.length !== paths.length || filtered.length !== paths.length) {
    throw new Error(`git answered ${raw.length} raw and ${filtered.length} filtered id(s) `
      + `for ${paths.length} path(s): the comparison is UNKNOWN, never equal`);
  }
  /** @type {string[]} */
  const differing = [];
  for (const [index, path] of paths.entries()) {
    if (raw[index] !== filtered[index]) differing.push(path);
  }
  differing.sort();
  return { equivalent: differing.length === 0, checked: paths.length, differing };
}

/** The blob ids git computes for these paths, in order. `--no-filters` asks for the bytes as
 * they are; without it, every attribute that applies to the path is applied — which is exactly
 * what `git add` would do.
 * @param {string} root @param {ReadonlyArray<string>} paths @param {boolean} filters
 * @returns {string[]} */
export function hashPaths(root, paths, filters) {
  if (paths.length === 0) return [];
  const args = ['hash-object', ...(filters ? [] : ['--no-filters']), '--stdin-paths'];
  const result = gitRun(root, args, {}, { input: `${paths.join('\n')}\n` });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (exit ${result.status}): ${result.stderr.trim()}`);
  }
  return result.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

/** The check, over the controlled set (the same set `fingerprint.mjs` hashes) or over an
 * explicit list of repository-relative POSIX paths.
 * @param {string} [root] @param {ReadonlyArray<string>} [paths] @returns {Equivalence} */
export function checkByteEquivalence(root = process.cwd(), paths = undefined) {
  const list = paths === undefined ? controlledFiles(root) : [...paths];
  const unsafe = unsafeForStdin(list);
  if (unsafe.length > 0) {
    throw new Error(`${unsafe.length} controlled path(s) contain a line break and cannot be `
      + `compared this way: ${unsafe.map((p) => JSON.stringify(p)).join(', ')}`);
  }
  return compareIds(list, hashPaths(root, list, false), hashPaths(root, list, true));
}

/** PURE. The refusal sentence, with the paths in it. The count is always stated, because a
 * truncated list must not read as the whole truth.
 * @param {Equivalence} result @returns {string} */
export function equivalenceReason(result) {
  const shown = result.differing.slice(0, MAX_RECORDED);
  const rest = result.differing.length - shown.length;
  return `the working bytes of ${result.differing.length} of ${result.checked} controlled file(s) `
    + `are not the bytes git would commit: ${shown.join(', ')}${rest > 0 ? ` (+${rest} more)` : ''}`;
}
