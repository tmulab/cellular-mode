// source-read.mjs — the ONLY module that touches the source tree, and it only READS.
//
// Everything else in Bootstrap is pure and takes this object as a parameter, which is what
// makes the catalog testable from an in-memory tree and what keeps the rule "analysis writes
// nothing" checkable by inspection rather than by hope.
//
// The walk NEVER follows a symlink. A source tree is not necessarily trusted — a link could
// point at a key store, at `/`, or at the target directory — so a link is reported as a link
// and skipped, not resolved. Directory entries come back sorted by `posix` path, because a
// plan whose file order depends on the filesystem is not deterministic.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, sep } from 'node:path';
import { gitRevision } from './exec.mjs';

/** @typedef {{ read: (rel: string) => string, bytes: (rel: string) => Buffer,
 *   list: (rel: string) => ReadonlyArray<string>,
 *   walk: (rel: string) => ReadonlyArray<string>, has: (rel: string) => boolean,
 *   skipped: () => ReadonlyArray<string> }} Source */

/** @param {string} value @returns {string} */
const toPosix = (value) => (sep === '/' ? value : value.split(sep).join('/'));

/**
 * A read-only view of one source tree. `rel` is always a `/`-separated path relative to
 * `root`; the caller has already had it checked by `pathProblem`.
 * @param {string} root absolute path to the source checkout
 * @returns {Source}
 */
export function diskSource(root) {
  /** @type {string[]} */
  const skipped = [];
  /** @param {string} rel @returns {string} */
  const abs = (rel) => join(root, ...rel.split('/').filter((s) => s !== ''));

  /** @param {string} rel @returns {string[]} */
  const walk = (rel) => {
    /** @type {string[]} */
    const out = [];
    /** @type {string[]} */
    const pending = [rel.replace(/\/+$/, '')];
    while (pending.length > 0) {
      const dir = /** @type {string} */ (pending.pop());
      for (const entry of readdirSync(abs(dir), { withFileTypes: true })) {
        const child = dir === '' ? entry.name : `${dir}/${entry.name}`;
        if (entry.isSymbolicLink()) {
          skipped.push(child);
          continue;
        }
        if (entry.isDirectory()) pending.push(child);
        else if (entry.isFile()) out.push(child);
        else skipped.push(child);
      }
    }
    return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  };

  return {
    read: (rel) => readFileSync(abs(rel), 'utf8'),
    // The RAW bytes, for `copy`: a copy claims to be byte-identical upstream, and a round trip
    // through a string would silently normalise anything that is not valid UTF-8.
    bytes: (rel) => readFileSync(abs(rel)),
    list: (rel) => readdirSync(abs(rel), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => (rel === '' ? entry.name : posix.join(rel, entry.name)))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    walk,
    // Does this tree hold `rel` at all? The question `walk` cannot answer: an absent directory and
    // an empty one both walk to nothing, and the difference between them is the difference between
    // "this component installs no files" and "this checkout cannot install this component".
    has: (rel) => {
      try {
        statSync(abs(rel));
        return true;
      } catch {
        return false;
      }
    },
    skipped: () => Object.freeze([...skipped]),
  };
}

/** Whether a source-relative path is a directory in this tree. Used only to tell a directory
 * entry from a file entry when a manifest's `source` does not end in `/`.
 * @param {string} root @param {string} rel @returns {boolean} */
export function isDirectory(root, rel) {
  try {
    return statSync(join(root, ...rel.split('/'))).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The source checkout's own name, version and commit, for the install record and for the
 * version comparison `status` makes later. `revision: null` is UNKNOWN — not a repository, no git
 * on PATH, no commit yet — and the manifest records it as such rather than guessing.
 * @param {(rel: string) => string} read @param {string} sourceRoot @param {NodeJS.ProcessEnv} [env]
 * @returns {{ name: string, version: string, revision: string | null }}
 */
export function sourceIdentity(read, sourceRoot, env) {
  /** @type {Record<string, unknown>} */
  let pkg = {};
  try {
    pkg = JSON.parse(read('package.json'));
  } catch {
    pkg = {};
  }
  return {
    name: typeof pkg.name === 'string' && pkg.name !== '' ? pkg.name : 'cellular-mode',
    version: typeof pkg.version === 'string' && pkg.version !== '' ? pkg.version : '0.0.0',
    revision: gitRevision(sourceRoot, env),
  };
}

export { toPosix };
