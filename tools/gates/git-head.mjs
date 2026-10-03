// git-head.mjs — the current commit, read as FILES. No process is ever spawned.
//
// Two callers need the same fact and must not disagree about it: `trilateral.mjs`, which
// stamps an evidence record with the commit it measured, and the host's repository read
// port, which tells the auditor which commit the working tree is on now. "Same commit" is
// the whole freshness rule, so one reader, one answer.
//
// Why not `git rev-parse HEAD`: the auditor is built on the promise that nothing in this
// feature spawns a process. Shelling out here would put a spawn one import away from the
// port, and a promise that depends on nobody reaching for the nearby handle is not a
// promise. Reading two small text files is also faster and works with no git installed.
//
// FAIL CLOSED: anything unexpected answers `null`, which every caller must treat as
// "unknown", never as "unchanged".
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A full object name, which is the only thing this module ever returns. */
export const SHA1 = /^[0-9a-f]{40}$/;

/** A ref name is matched against a charset before it is used as a path: the content of
 * `.git/HEAD` is input like any other, and `ref: ../../etc/passwd` must not become a read. */
const REF_NAME = /^refs\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

/**
 * The commit `HEAD` names, or `null` when it cannot be read with certainty.
 * Three cases, in the order git itself resolves them: a detached HEAD holding a sha, a
 * symbolic ref with a loose ref file, and the same ref packed into `packed-refs`.
 * @param {string} root the repository root (the directory containing `.git`)
 * @returns {string | null}
 */
export function readGitHead(root) {
  if (typeof root !== 'string' || root.trim() === '') return null;
  /** @type {(rel: string) => string | null} */
  const read = (rel) => {
    try {
      return readFileSync(join(root, '.git', rel), 'utf8');
    } catch {
      return null;
    }
  };
  const head = read('HEAD');
  if (head === null) return null;
  const text = head.trim();
  if (SHA1.test(text)) return text;
  const symbolic = /^ref:\s*(\S+)$/.exec(text);
  const ref = symbolic?.[1];
  if (ref === undefined || !REF_NAME.test(ref)) return null;
  const loose = read(ref)?.trim();
  if (loose !== undefined && SHA1.test(loose)) return loose;
  const packed = read('packed-refs');
  if (packed === null) return null;
  for (const line of packed.split('\n')) {
    const [sha, name] = line.trim().split(/\s+/);
    if (name === ref && sha !== undefined && SHA1.test(sha)) return sha;
  }
  return null;
}
