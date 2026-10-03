// The path-confined `fs.read` PORTS over the REPOSITORY, for the auditor.
//
// `read-port.mjs` opens one directory — `vault/state` — with a closed set of names. An
// auditor cannot work that way: the 200-line rule, the secret scan, the import-direction
// rule and the dependency rule are questions about EVERY handwritten file. So this port
// widens the readable surface to the project root, and pays for that with four guards:
//
//   1. the EXCLUSION LIST is the gates' own (`tools/gates/exclusions.mjs`, the single
//      source `scan.mjs` also reads): `.git/`, `node_modules/`, the hash-pinned vendored
//      artefacts and binary extensions are not readable at all;
//   2. every path segment must pass `assertSafeSegment` — the SAME rule the write port
//      uses — which refuses absolute paths, drive letters, separators, `..`, NUL bytes
//      and dot-leading names. `.git` is therefore refused twice, by list and by shape;
//   3. containment is proved against the real directory by `confinedTarget`, so a
//      symbolic link or a Windows junction cannot redirect a read out of the tree;
//   4. a size cap and a file-count cap, so a report can never be a memory exhaustion.
//
// The invariant worth remembering: what `listRepoFiles` lists is exactly what
// `readRepoFile` will read. No caller has to guess, and a test asserts it.
//
// Still true here, as everywhere in this host: no path leaves through these ports.
// `listRepoFiles` answers repository-relative POSIX paths and `readRepoFile` answers text.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { BINARY, EXTRA_SEGMENTS, isExcluded } from '../../tools/gates/exclusions.mjs';
import { EVIDENCE_FILE, EVIDENCE_SEGMENTS } from '../../tools/gates/evidence.mjs';
import { readGitHead } from '../../tools/gates/git-head.mjs';
import { MAX_READ_BYTES } from './read-port.mjs';
import { assertSafeSegment, confinedTarget, refuseAccess } from './write-port.mjs';

/** One file as the auditor sees it listed. No absolute path, ever.
 * @typedef {{ path: string, size: number, modifiedMs: number }} RepoFile */

/** A bound on the walk. A repository larger than this is not a thing this port reports on
 * partially and silently: it refuses, and the refusal is the finding. */
export const MAX_REPO_FILES = 20000;

/** @type {(name: unknown, message: string) => never} */
const refuse = (name, message) => refuseAccess(name, message, 'read');

/** One leading dot, and therefore NOT `.` or `..`: the second character must not be a dot. */
const DOT_LEADING = /^\.[^.]/;

/**
 * PURE. One path segment, by the write port's rule PLUS one named allowance: a single
 * leading dot. `.claude/`, `.gitattributes` and `.gitignore` are handwritten parts of this
 * project and the gates do check them, so a reader that could not see them would answer
 * PASS exactly where the gates answer FAIL — a false green bought with a stricter-looking
 * regular expression. The rest of the segment still goes through `assertSafeSegment`, so
 * `.`, `..`, separators, absolute forms and NUL bytes are refused by the SHARED rule and
 * not by a second copy of it; `.git/` and `.cellular/` are refused by the exclusion list.
 * @param {unknown} segment @returns {string}
 */
export function assertRepoSegment(segment) {
  if (typeof segment === 'string' && EXTRA_SEGMENTS.includes(segment)) return segment;
  if (typeof segment === 'string' && DOT_LEADING.test(segment)) {
    assertSafeSegment(segment.slice(1));
    return segment;
  }
  return assertSafeSegment(segment);
}

/**
 * PURE. The segments a repository-relative name denotes, or a refusal. Every segment is
 * checked by the shared rule, which is why this function never has to interpret a path.
 * @param {unknown} rel @returns {string[]}
 */
export function assertRepoPath(rel) {
  if (typeof rel !== 'string' || rel === '') refuse(rel, 'a repository path must be a non-empty string');
  if (rel.includes('\0')) refuse(rel, 'a repository path may not contain a NUL byte');
  if (rel.includes('\\')) refuse(rel, 'a repository path uses forward slashes only');
  // Checked before the split, so the refusal names the real problem: a leading slash would
  // otherwise reach the segment rule as an EMPTY first segment.
  if (rel.startsWith('/')) refuse(rel, 'absolute paths are refused');
  const segments = rel.split('/');
  for (const segment of segments) assertRepoSegment(segment);
  if (BINARY.test(rel)) refuse(rel, 'this port reads text, not binary files');
  if (isExcluded(rel)) refuse(rel, 'this path is on the gates\' exclusion list');
  return segments;
}

/** True for a directory entry this port will descend into or report. The predicate IS the
 * refusal, so what `listRepoFiles` lists is exactly what `readRepoFile` accepts: one rule,
 * no chance of the two drifting into a report about files nobody can open.
 * @param {string} name @returns {boolean} */
const nameAllowed = (name) => {
  try {
    assertRepoSegment(name);
    return true;
  } catch {
    return false;
  }
};

/** @type {(dir: string, prefix: string, out: RepoFile[]) => Promise<void>} */
async function walk(dir, prefix, out) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!nameAllowed(entry.name)) continue;
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (isExcluded(rel)) continue;
    if (entry.isDirectory()) {
      await walk(join(dir, entry.name), rel, out);
      continue;
    }
    // A symbolic link is neither a file nor a directory here: `withFileTypes` reports it
    // as a link, so it is skipped without a stat and can never be followed.
    if (!entry.isFile() || BINARY.test(rel)) continue;
    if (out.length >= MAX_REPO_FILES) refuse(rel, `the repository has more than ${MAX_REPO_FILES} readable files`);
    const info = await stat(join(dir, entry.name)).catch(() => null);
    if (info === null) continue;
    out.push({ path: rel, size: info.size, modifiedMs: Math.round(info.mtimeMs) });
  }
}

/**
 * The four port descriptors granted to a plugin declaring `fs.read` for an audit.
 *
 *   `readRepoFile(rel)` -> the file's text, or `null` when it does not exist. Absence is a
 *     VALUE: a repository without a `policy/` file is a normal state to describe.
 *   `listRepoFiles()`   -> `[{ path, size, modifiedMs }]`, sorted, exclusions applied.
 *   `readEvidence()`    -> the parsed JSON of `.cellular/evidence/trilateral.json`, or
 *     `null`. ONE file, reachable no other way: `.cellular` is a dot-leading segment and
 *     `readRepoFile` refuses those, so this is the only door and it opens once.
 *   `readHead()`        -> the commit the tree is on, or `null` when unknown. Read as
 *     files; nothing in this feature spawns a process.
 *
 * @param {string} root the project root; only what the exclusion list leaves becomes readable
 */
export function createRepoReadPorts(root) {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new TypeError('createRepoReadPorts needs a project root');
  }

  return Object.freeze({
    readRepoFile: {
      permission: 'fs.read',
      /** @param {unknown} rel @returns {Promise<string | null>} */
      async fn(rel) {
        const segments = assertRepoPath(rel);
        /** @type {string | null} */
        let target = null;
        try {
          target = await confinedTarget(root, segments, rel, 'read', assertRepoSegment);
        } catch (cause) {
          const named = /** @type {{ details?: ReadonlyArray<{ message?: unknown }> }} */ (cause);
          if (named.details?.[0]?.message === 'the base directory does not exist') return null;
          throw cause;
        }
        const info = await stat(target).catch(() => null);
        if (info === null) return null;
        if (info.size > MAX_READ_BYTES) refuse(rel, `is larger than ${MAX_READ_BYTES} bytes`);
        return readFile(target, 'utf8');
      },
    },
    listRepoFiles: {
      permission: 'fs.read',
      /** @returns {Promise<RepoFile[]>} */
      async fn() {
        /** @type {RepoFile[]} */
        const out = [];
        await walk(root, '', out);
        return out;
      },
    },
    readEvidence: {
      permission: 'fs.read',
      /** @returns {Promise<unknown>} */
      async fn() {
        const base = join(root, ...EVIDENCE_SEGMENTS);
        /** @type {string | null} */
        let target = null;
        try {
          target = await confinedTarget(base, [EVIDENCE_FILE], EVIDENCE_FILE, 'read');
        } catch {
          // No record yet is the normal state of a fresh checkout, and it must read as
          // UNAVAILABLE upstream — never as a green leg.
          return null;
        }
        const info = await stat(target).catch(() => null);
        if (info === null || info.size > MAX_READ_BYTES) return null;
        try {
          return JSON.parse(await readFile(target, 'utf8'));
        } catch {
          return null;
        }
      },
    },
    readHead: {
      permission: 'fs.read',
      /** @returns {Promise<string | null>} */
      async fn() {
        return readGitHead(root);
      },
    },
  });
}
