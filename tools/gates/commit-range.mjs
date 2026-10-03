// commit-range.mjs — WHICH commits a hook is being asked about, and what each one
// contains. One responsibility: translating git's own vocabulary (the pre-push protocol,
// a rev-range) into `{ commit, subject, tree }` rows. Whether a row is AUTHORIZED is a
// different question, and it lives in ./authorization.mjs.
//
// Splitting it out is not cosmetic: the pre-push protocol has four cases (new branch,
// fast-forward, deletion, unknown remote) and each is a sentence a reader must be able to
// check without scrolling past the authorization logic.
import { gitRun } from './fingerprint.mjs';

/** A null object name: git's way of saying "this ref does not exist on that side". */
const ZERO = /^0{40}$/;

/** @typedef {{ commit: string, subject: string, tree: string }} CommitRow */

/** @param {string} root @param {string} commit @returns {string} */
export function treeOf(root, commit) {
  const result = gitRun(root, ['rev-parse', `${commit}^{tree}`]);
  return result.status === 0 ? result.stdout.trim() : '';
}

/** @param {string} root @param {string} commit @returns {string} */
export function subjectOf(root, commit) {
  const result = gitRun(root, ['log', '-1', '--format=%s', commit]);
  return result.status === 0 ? result.stdout.trim() : '';
}

/** @type {(root: string, args: ReadonlyArray<string>) => string[]} */
function revList(root, args) {
  const listed = gitRun(root, ['rev-list', ...args]);
  if (listed.status !== 0) return [];
  return listed.stdout.split('\n').map((s) => s.trim()).filter((s) => s !== '');
}

/**
 * The commits a push would send, read from git's pre-push protocol on stdin:
 * `<local ref> <local sha> <remote ref> <remote sha>`, one line per ref.
 *   local sha all zeros  → a DELETION: no content travels, nothing to verify.
 *   remote sha all zeros → a NEW branch: compare against everything the remote has.
 *   otherwise            → the commits between the two.
 * @param {string} root @param {string} stdinText @param {string} [remote]
 * @returns {string[]} */
export function commitsToPush(root, stdinText, remote = '') {
  /** @type {string[]} */
  const commits = [];
  for (const line of String(stdinText ?? '').split('\n')) {
    const [, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (localSha === undefined || remoteSha === undefined || ZERO.test(localSha)) continue;
    const args = ZERO.test(remoteSha)
      ? [localSha, '--not', remote === '' ? '--remotes' : `--remotes=${remote}`]
      : [`${remoteSha}..${localSha}`];
    for (const sha of revList(root, args)) if (!commits.includes(sha)) commits.push(sha);
  }
  return commits;
}

/** Every commit in a rev-range, with its subject and tree. An unreadable range yields no
 * rows, and the caller decides what that means — here it is reported, never passed.
 * @param {string} root @param {ReadonlyArray<string>} revs @returns {CommitRow[]} */
export function commitRows(root, revs) {
  return revList(root, revs).map((commit) => ({
    commit, subject: subjectOf(root, commit), tree: treeOf(root, commit),
  }));
}

/** @param {string} root @param {ReadonlyArray<string>} revs @returns {boolean} */
export function rangeIsReadable(root, revs) {
  return gitRun(root, ['rev-list', '--max-count=1', ...revs]).status === 0;
}
