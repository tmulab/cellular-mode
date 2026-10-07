// writer-base.mjs — the confinement boundary, the digest and the marker vocabulary: the three
// things every write AND every deletion in a target depends on.
//
// Split out of `writer.mjs` for the 200-line rule and to keep the dependency graph acyclic:
// `writer.mjs` (writes) and `writer-remove.mjs` (deletions) both stand on this file, and neither
// stands on the other. `writer.mjs` re-exports everything here, so no call site outside the
// writer family ever imports this module directly.
//
// `confine` answers a harder question than `resolve` does. A resolved path can still leave the
// target: if `vault` is a symlink or an NTFS junction to somewhere else, then
// `<target>/vault/state/log.md` resolves inside the target and WRITES outside it. So the check
// has three fail-closed layers: the relative path must be ordinary (`pathProblem`); the deepest
// ancestor that EXISTS is real-pathed and must still be inside the target's real path; and no
// existing segment may be a link at all (`lstat`), because a link pointing inside today can be
// repointed between the check and the write.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathProblem } from './component-parts.mjs';
import { CODES, refuse } from './errors.mjs';

/** The marker words. One vocabulary, so that `uninstall` finds exactly what an install wrote
 * without a second opinion about the spelling. */
export const BEGIN = 'cellular-mode:begin';
export const END = 'cellular-mode:end';

/** How much of a target file Bootstrap reads. A contract or an AGENTS.md is kilobytes. */
export const MAX_READ = 1024 * 1024;

/** @param {string} value @returns {string} */
const real = (value) => {
  try {
    return realpathSync(value);
  } catch {
    return resolve(value);
  }
};

/** PURE. True when `inner` is `outer` or lies beneath it, compared as whole segments so that
 * `/a/bc` is never "inside" `/a/b`. @param {string} outer @param {string} inner @returns {boolean} */
export function isInside(outer, inner) {
  return outer === inner || inner.startsWith(outer.endsWith(sep) ? outer : outer + sep);
}

/**
 * The absolute path `rel` names inside `targetRoot`, or an OUTSIDE_TARGET refusal. Called before
 * every single read, write and deletion; no other module resolves a target path.
 * @param {string} targetRoot @param {string} rel @returns {string}
 */
export function confine(targetRoot, rel) {
  const structural = pathProblem(rel);
  if (structural !== null) {
    throw refuse(CODES.OUTSIDE_TARGET, `refused a target path: it ${structural}`, { path: String(rel) });
  }
  const base = real(targetRoot);
  const segments = String(rel).split('/').filter((part) => part !== '');
  const absolute = resolve(base, ...segments);
  if (!isInside(base, absolute)) {
    throw refuse(CODES.OUTSIDE_TARGET, 'refused a target path: it resolves outside the target', { path: rel });
  }
  // Walk the segments that already exist: a link among them is refused outright, and the
  // deepest existing one is real-pathed, which is the check a resolve alone cannot make.
  let walked = base;
  for (const segment of segments) {
    walked = resolve(walked, segment);
    if (!existsSync(walked)) break;
    if (lstatSync(walked).isSymbolicLink()) {
      throw refuse(CODES.OUTSIDE_TARGET,
        'refused a target path: one of its existing segments is a symbolic link or junction',
        { path: rel });
    }
    if (!isInside(base, real(walked))) {
      throw refuse(CODES.OUTSIDE_TARGET, 'refused a target path: its real path leaves the target', { path: rel });
    }
  }
  return absolute;
}

/** PURE. The hex SHA-256 of some bytes. One helper, so the plan, the manifest, a later drift
 * check and the re-hash before a deletion all mean the same digest.
 * @param {string | Uint8Array} bytes @returns {string} */
export function sha256(bytes) {
  return createHash('sha256').update(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes).digest('hex');
}

/** The text of a target file, or `null` when it is absent. Confined, size-capped, read-only.
 * @param {string} targetRoot @param {string} rel @param {number} [maxBytes]
 * @returns {string | null} */
export function readIfPresent(targetRoot, rel, maxBytes = MAX_READ) {
  const absolute = confine(targetRoot, rel);
  if (!existsSync(absolute)) return null;
  const stat = statSync(absolute);
  if (!stat.isFile()) return null;
  if (stat.size > maxBytes) {
    throw refuse(CODES.BAD_FACTS, `${rel} is larger than ${maxBytes} bytes, so Bootstrap will not read it`, { path: rel });
  }
  return readFileSync(absolute, 'utf8');
}

/** The bytes of a target file, read through the same boundary. Used by the deletion path, which
 * must hash what is on disk rather than what a text decode produced.
 * @param {string} targetRoot @param {string} rel @param {number} [maxBytes]
 * @returns {Buffer | null} */
export function bytesIfPresent(targetRoot, rel, maxBytes = MAX_READ) {
  const absolute = confine(targetRoot, rel);
  if (!existsSync(absolute)) return null;
  const stat = statSync(absolute);
  if (!stat.isFile()) return null;
  if (stat.size > maxBytes) {
    throw refuse(CODES.BAD_FACTS, `${rel} is larger than ${maxBytes} bytes, so Bootstrap will not read it`, { path: rel });
  }
  return readFileSync(absolute);
}
