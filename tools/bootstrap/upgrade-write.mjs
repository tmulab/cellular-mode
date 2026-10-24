// upgrade-write.mjs — the third and last door through which Bootstrap may REPLACE a file, open
// only to `upgrade` and only for a file whose bytes still hash to what the install manifest
// recorded. `writer.mjs` never replaces; `writer-evolving.mjs` replaces exactly the files a human
// is expected to edit; this one replaces files BOOTSTRAP wrote, and asks the same question
// `removeOwned` asks before an unlink: is this still the file we wrote?
//
// THE RE-HASH IS THE GUARD, AND IT HAPPENS ONE STATEMENT BEFORE THE WRITE. A plan computed a
// moment ago is not evidence about the file now — an editor may have saved in between — so the
// expected digest is checked here, against the bytes on disk, and a mismatch is a CONFLICT
// refusal. That is what makes "an upgrade never overwrites your change" a property of one small
// function instead of a promise about a command.
//
// AND THE REPLACE IS ATOMIC: a temporary file beside the target, then `rename`, so a crash leaves
// the previous file intact rather than half of the new one. The mode is carried over from the file
// being replaced, because a git hook that loses its exec bit is a hook git silently stops running.
import { chmodSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { CODES, refuse } from './errors.mjs';
import { HOOKS_PREFIX, HOOK_MODE, TEMP_SUFFIX, bytesIfPresent, confine, sha256 } from './writer.mjs';

/** @typedef {{ path: string, sha256Before: string, sha256After: string }} ReplaceRecord */

/** PURE. The explicit mode a file ADDED by an upgrade needs, or `null` for the default. The same
 * single exception `copyMode` names, by directory: a hook that is not executable is a hook POSIX
 * git skips. @param {string} rel @returns {number | null} */
export function addedMode(rel) {
  return rel.startsWith(HOOKS_PREFIX) && !rel.endsWith('/') ? HOOK_MODE : null;
}

/**
 * Replaces one file Bootstrap recorded, after proving it is still the file Bootstrap wrote.
 * @param {string} targetRoot @param {string} rel @param {string | Uint8Array} bytes
 * @param {string} expectedSha the digest the install manifest records for this path
 * @returns {ReplaceRecord}
 */
export function replaceRecorded(targetRoot, rel, bytes, expectedSha) {
  const absolute = confine(targetRoot, rel);
  const present = bytesIfPresent(targetRoot, rel);
  if (present === null) {
    throw refuse(CODES.BAD_FACTS, `${rel} is not there any more, so there is nothing to replace`, { path: rel });
  }
  const before = sha256(present);
  if (before !== expectedSha) {
    throw refuse(CODES.CONFLICT,
      `${rel} changed since this plan was made: it was NOT replaced, and nothing about it was guessed`,
      { path: rel });
  }
  /** @type {number | null} */
  let mode = null;
  try {
    mode = statSync(absolute).mode & 0o777;
  } catch {
    mode = null;
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
  if (mode !== null) chmodSync(absolute, mode);
  return { path: String(rel), sha256Before: before, sha256After: sha256(bytes) };
}
