// writer-remove.mjs — the ONLY module that deletes anything inside a target, and the deletion
// half of the writer family (`writer.mjs` re-exports all three functions, so every call site
// still goes through one door).
//
// Three rules make an uninstall auditable rather than merely effective.
//
//   RE-HASH IMMEDIATELY BEFORE THE UNLINK. `removeOwned` does not trust the plan that chose it:
//   it re-reads the bytes and re-hashes them one statement before `unlinkSync`, and REFUSES on any
//   mismatch. A plan is minutes old; a file is whatever it is right now. Without this the window
//   between "the plan said it was unmodified" and "the file is gone" is a window in which somebody
//   else's work can be deleted.
//
//   NEVER RECURSIVE, NEVER A LINK. `unlinkSync` for one regular file, `rmdirSync` for one empty
//   directory. `rmSync({ recursive: true })` does not appear in this file and must not: a recursive
//   delete pointed at the wrong relative path is the one mistake no later check can undo. Symlinks
//   and junctions are refused by `confine` (every existing segment is `lstat`ed) and again here.
//
//   ONE INTACT BLOCK OR NOTHING. `removeBlock` removes exactly one `cellular-mode:begin/end` span.
//   Duplicated markers, unbalanced markers, a reversed pair, or a body whose hash differs from the
//   one the install recorded all mean REFUSE: a block somebody edited is a block whose removal is a
//   human's decision, and the caller prints it as a reverse patch instead.
import { lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { CODES, refuse } from './errors.mjs';
import { BEGIN, END, confine, readIfPresent, sha256 } from './writer-base.mjs';

/** @typedef {{ path: string, sha256: string }} RemovedFile */
/** @typedef {{ path: string, removed: string, sha256After: string, restored: boolean }} RemovedBlock */

/**
 * Deletes ONE regular file that Bootstrap created, after proving it is still the file that was
 * recorded. `expectedSha` is the manifest's `sha256After`; a mismatch is a CONFLICT refusal and
 * nothing is deleted.
 * @param {string} targetRoot @param {string} rel @param {string} expectedSha @returns {RemovedFile}
 */
export function removeOwned(targetRoot, rel, expectedSha) {
  const absolute = confine(targetRoot, rel);
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch {
    throw refuse(CODES.CONFLICT, `${rel} is not there any more: nothing was deleted`, { path: rel });
  }
  if (stat.isSymbolicLink()) {
    throw refuse(CODES.OUTSIDE_TARGET, `${rel} is a symbolic link or junction: Bootstrap never deletes through a link`, { path: rel });
  }
  if (!stat.isFile()) {
    throw refuse(CODES.CONFLICT, `${rel} is not a regular file: nothing was deleted`, { path: rel });
  }
  // The re-hash. Deliberately the statement before the unlink, on the bytes of the file itself.
  const digest = sha256(readFileSync(absolute));
  if (digest !== expectedSha) {
    throw refuse(CODES.CONFLICT,
      `${rel} differs from what the install recorded: it was NOT deleted (re-hashed immediately before the unlink)`,
      { path: rel });
  }
  unlinkSync(absolute);
  return { path: rel, sha256: digest };
}

/**
 * Removes the directory `rel` names, but only when it is a real, empty directory. Returns whether
 * it was removed; it never throws for "not empty", because a directory holding somebody's file is
 * an ordinary outcome of an uninstall and not an error.
 * @param {string} targetRoot @param {string} rel @returns {boolean}
 */
export function removeEmptyDir(targetRoot, rel) {
  const absolute = confine(targetRoot, rel);
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch {
    return false;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
  if (readdirSync(absolute).length > 0) return false;
  rmdirSync(absolute);
  return true;
}

/**
 * PURE and TOTAL. The span of the one managed block for `component`, or the reason there is none
 * that may be touched. The span runs from the start of the line holding the begin marker to the
 * end of the line holding the end marker, newline included.
 * @param {string} text @param {string} component
 * @returns {{ start: number, end: number, text: string } | { problem: string }}
 */
export function blockSpan(text, component) {
  // The component is escaped before it becomes a pattern: the planner's own blocks are recorded
  // under `(bootstrap)`, and a parenthesis read as a capture group would match the wrong thing.
  const name = String(component).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const begins = [...text.matchAll(new RegExp(`${BEGIN} ${name}(?![\\w-])`, 'g'))];
  const ends = [...text.matchAll(new RegExp(`${END} ${name}(?![\\w-])`, 'g'))];
  if (begins.length === 0 && ends.length === 0) return { problem: 'holds no managed block for this component' };
  if (begins.length !== 1 || ends.length !== 1) {
    return { problem: `holds ${begins.length} begin and ${ends.length} end marker(s) for this component: Bootstrap removes exactly one intact block` };
  }
  const beginAt = /** @type {number} */ (begins[0]?.index);
  const endAt = /** @type {number} */ (ends[0]?.index);
  if (endAt < beginAt) return { problem: 'the end marker comes before the begin marker' };
  const start = text.lastIndexOf('\n', beginAt) + 1;
  const lineEnd = text.indexOf('\n', endAt);
  const end = lineEnd === -1 ? text.length : lineEnd + 1;
  return { start, end, text: text.slice(start, end) };
}

/** PURE. The texts the file could have held before the block was appended, in the order
 * `appendBlock` could have produced them: it writes `existing`, a newline when one was missing, and
 * one blank-line separator. With anything AFTER the block the file is no longer the shape
 * `appendBlock` left, so the only candidate is "the block, removed".
 * @param {string} head @param {string} tail @returns {ReadonlyArray<string>} */
export function candidates(head, tail) {
  if (tail !== '') return Object.freeze([head + tail]);
  return Object.freeze([
    head.replace(/\n\n$/, '\n'), // the file ended with a newline: head is existing + "\n"
    head.replace(/\n\n$/, ''), //  it did not: appendBlock added the newline AND the separator
    head,
  ]);
}

/**
 * Removes exactly one intact managed block from a file somebody else owns, restoring the file to
 * the bytes recorded in `sha256Before` whenever those bytes can be reproduced.
 * @param {string} targetRoot @param {string} rel @param {string} component
 * @param {{ blockSha256?: string | null | undefined, sha256Before?: string | null | undefined }} expected
 * @returns {RemovedBlock}
 */
export function removeBlock(targetRoot, rel, component, expected = {}) {
  const absolute = confine(targetRoot, rel);
  const text = readIfPresent(targetRoot, rel);
  if (text === null) throw refuse(CODES.CONFLICT, `${rel} is not a readable file: no block was removed`, { path: rel });
  const span = blockSpan(text, component);
  if ('problem' in span) {
    throw refuse(CODES.CONFLICT, `${rel} ${span.problem}: no block was removed`, { path: rel, component });
  }
  const recorded = expected.blockSha256 ?? null;
  if (recorded !== null && sha256(span.text) !== recorded) {
    throw refuse(CODES.CONFLICT,
      `the managed block for ${component} in ${rel} differs from the one the install recorded: it was NOT removed`,
      { path: rel, component });
  }
  const options = candidates(text.slice(0, span.start), text.slice(span.end));
  const before = expected.sha256Before ?? null;
  const match = before === null ? undefined : options.find((option) => sha256(option) === before);
  const next = match ?? options[0] ?? '';
  writeFileSync(absolute, next);
  return { path: rel, removed: span.text, sha256After: sha256(next), restored: match !== undefined };
}
