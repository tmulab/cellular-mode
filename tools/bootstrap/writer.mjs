// writer.mjs — the ONE door through which Bootstrap touches a target directory. Everything else
// produces bytes and asks this file to place them, or names a path and asks it to remove it.
//
// The family is four files, for the 200-line rule, and this one is the public face of all four:
//   `writer-base.mjs`     — `confine` (the security boundary), `sha256`, the reads, the markers.
//   `writer.mjs`          — the writes: `writeNew`, `appendBlock`, `mkdirIn`.
//   `writer-remove.mjs`   — the deletions: `removeOwned`, `removeEmptyDir`, `removeBlock`.
//   `writer-evolving.mjs` — `replaceEvolving`, the one REPLACE, for a closed list of paths.
// Everything is re-exported here, so no caller needs to know which of the four it came from.
//
// Two rules make an install auditable rather than merely successful. NEVER OVERWRITE: `writeNew`
// opens with the exclusive flag `wx`, so "it was not there a moment ago" is enforced by the
// operating system rather than by a prior `existsSync`. NEVER REPLACE: the only change
// `appendBlock` can make to a file somebody else wrote is one delimited block at the end, and a
// second block for the same component is REFUSED — which is what makes a re-run idempotent
// instead of cumulative. The deletions mirror them: see `writer-remove.mjs`.
import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CODES, refuse } from './errors.mjs';
import {
  BEGIN, END, confine, isInside, readIfPresent, sha256,
} from './writer-base.mjs';

export {
  BEGIN, END, MAX_READ, bytesIfPresent, confine, isInside, readIfPresent, sha256,
} from './writer-base.mjs';
export {
  blockSpan, candidates, removeBlock, removeEmptyDir, removeOwned,
} from './writer-remove.mjs';
export { REPLACEABLE, TEMP_SUFFIX, replaceEvolving } from './writer-evolving.mjs';

/** @typedef {'md'|'hash'} CommentStyle */
/** @typedef {{ path: string, created: boolean, sha256Before: string | null,
 *   sha256After: string, block: string | null, blockSha256?: string }} WriteRecord */

/** The real path of a root, for the overlap check only: `confine` does its own resolution.
 * @param {string} value @returns {string} */
const real = (value) => {
  try {
    return realpathSync(value);
  } catch {
    return resolve(value);
  }
};

/** Refuses when a source and a target overlap: the same directory, or either inside the other.
 * Copying a tree into itself is a loop, and a target containing the source would let an install
 * rewrite the method it is installing.
 * @param {string} sourceRoot @param {string} targetRoot @returns {void} */
export function assertNoOverlap(sourceRoot, targetRoot) {
  const source = real(sourceRoot);
  const target = real(targetRoot);
  if (source === target) {
    throw refuse(CODES.OVERLAP, 'the target is the source: Cellular Mode cannot install into its own checkout', {});
  }
  if (isInside(source, target)) {
    throw refuse(CODES.OVERLAP, 'the target is inside the source checkout', {});
  }
  if (isInside(target, source)) {
    throw refuse(CODES.OVERLAP, 'the source checkout is inside the target', {});
  }
}

/** Creates the directory `rel` names, and its parents. @param {string} targetRoot
 * @param {string} rel @returns {string} */
export function mkdirIn(targetRoot, rel) {
  const absolute = confine(targetRoot, rel.replace(/\/+$/, ''));
  mkdirSync(absolute, { recursive: true });
  return absolute;
}

/** The component that owns the git hooks, the directory they live in, and the mode they need. */
export const HOOK_COMPONENT = 'article-8';
export const HOOKS_PREFIX = '.githooks/';
export const HOOK_MODE = 0o755;

/**
 * PURE. The explicit mode a COPIED file must be created with, or `null` for the filesystem
 * default — which is what every ordinary copy gets.
 *
 * ONE narrow, documented exception: git silently IGNORES a hook that is not executable, so a
 * POSIX target adopting `article-8` used to install three hooks that never ran (the defect
 * independent Linux CI found on commit 2e8e84a). The rule is deliberately not a manifest field:
 * `FILE_KEYS` in `component-parts.mjs` is a closed contract, and a `chmod` key there would let any
 * component ask for any mode on any path. So the exception is named here instead, by component AND
 * by directory, where a reader of the writer can see it. On Windows `chmod` carries no exec bit and
 * git ignores the mode anyway, which is exactly why the defect could not reproduce there.
 * @param {string} component @param {string} rel @returns {number | null}
 */
export function copyMode(component, rel) {
  if (component !== HOOK_COMPONENT) return null;
  if (!rel.startsWith(HOOKS_PREFIX) || rel.endsWith('/')) return null;
  return HOOK_MODE;
}

/**
 * Writes a file that must not already exist. The exclusive flag does the checking, so there is
 * no window between a test and the write. `mode`, when given, is applied by the create AND once
 * more afterwards, because the process umask masks the create's mode; the second call targets the
 * path `confine` approved and the exclusive create proved we had just made ourselves.
 * @param {string} targetRoot @param {string} rel @param {string | Uint8Array} bytes
 * @param {number | null} [mode]
 * @returns {WriteRecord}
 */
export function writeNew(targetRoot, rel, bytes, mode = null) {
  const absolute = confine(targetRoot, rel);
  mkdirSync(dirname(absolute), { recursive: true });
  try {
    writeFileSync(absolute, bytes, mode === null ? { flag: 'wx' } : { flag: 'wx', mode });
  } catch (error) {
    const code = /** @type {{ code?: string }} */ (error).code;
    if (code === 'EEXIST') {
      throw refuse(CODES.CONFLICT, `${rel} already exists: Bootstrap never replaces a file`, { path: rel });
    }
    throw error;
  }
  if (mode !== null) chmodSync(absolute, mode);
  return { path: rel, created: true, sha256Before: null, sha256After: sha256(bytes), block: null };
}

/** PURE. The comment syntax Bootstrap understands for a managed block, or a refusal. The list is
 * closed on purpose: a file whose comment syntax we are guessing at is a file we do not touch.
 * @param {string} rel @returns {CommentStyle} */
export function commentStyleFor(rel) {
  if (rel.endsWith('.md')) return 'md';
  if (rel === '.gitignore' || rel.endsWith('/.gitignore')) return 'hash';
  throw refuse(CODES.UNMERGEABLE, `Bootstrap does not know how to delimit a block in ${rel}`, { path: rel });
}

/** PURE. The delimited block for one component. The markers are comments; `text` is verbatim,
 * because in `.gitignore` the payload is patterns, not prose.
 * @param {string} component @param {string} text @param {CommentStyle} style @returns {string} */
export function blockFor(component, text, style) {
  const body = text.replace(/\n+$/, '');
  if (style === 'md') {
    return `<!-- ${BEGIN} ${component} -->\n${body}\n<!-- ${END} ${component} -->\n`;
  }
  return `# ${BEGIN} ${component}\n${body}\n# ${END} ${component}\n`;
}

/**
 * Appends one managed block to a text file, creating it if absent. REFUSES when a block for the
 * same component is already there: that refusal is what makes a second run a no-op.
 *
 * `blockSha256` is the digest of the block AS WRITTEN, markers included. It is recorded in the
 * install manifest so that `uninstall` can tell an intact block from one somebody edited — a
 * question no hash of the whole file can answer, because the rest of the file is theirs to change.
 * @param {string} targetRoot @param {string} rel @param {string} component @param {string} text
 * @param {CommentStyle} [style] @returns {WriteRecord}
 */
export function appendBlock(targetRoot, rel, component, text, style = commentStyleFor(rel)) {
  const absolute = confine(targetRoot, rel);
  const before = existsSync(absolute) ? readIfPresent(targetRoot, rel) : null;
  const existing = before ?? '';
  if (existing.includes(`${BEGIN} ${component}`)) {
    throw refuse(CODES.CONFLICT, `${rel} already holds a managed block for ${component}`, { path: rel, component });
  }
  const block = blockFor(component, text, style);
  const head = existing === '' ? '' : `${existing.endsWith('\n') ? existing : `${existing}\n`}\n`;
  const bytes = `${head}${block}`;
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
  return {
    path: rel,
    created: before === null,
    sha256Before: before === null ? null : sha256(before),
    sha256After: sha256(bytes),
    block: component,
    blockSha256: sha256(block),
  };
}
