// fingerprint.mjs — WHICH state was verified, as one checkable value.
//
// Article 8 (docs/00-constitution.md) forbids completing a cell on verification results
// that predate the last modification. Enforcing that needs an answer to "is this still
// the same state?", and the answer must be a value a later run can compare, not a
// timestamp and a promise.
//
// THE CONTROLLED SET is defined by git, deliberately: the files `git ls-files --cached
// --others --exclude-standard` reports — everything tracked plus everything untracked
// that is not ignored. So `node_modules/` and `.cellular/` are outside it (they are in
// .gitignore), and source, tests, docs, configuration, plugin manifests, cell contracts,
// vault state and release checklists are all inside it. Choosing the same set git would
// commit is what makes "verified" and "committed" talk about one thing.
//
// THE FINGERPRINT is SHA-256 over the sorted `path \0 sha256(bytes)` lines, prefixed by a
// schema line. Content is hashed as BYTES, so a line-ending change counts; paths are part
// of the hash, so a rename counts; the sort makes it independent of directory order.
//
// Split, as every gate here is: a PURE core (hashText, fingerprintOf, diffEntries) that
// needs no repository, and a thin git shell. No git repository is a hard ERROR, never a
// pass: see tools/gates/FINAL-VERIFICATION.md, "Limitations".
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Bumped only when the hashed shape changes; an old fingerprint then stops matching,
 * which is the correct outcome — it was computed by a different rule. */
export const FINGERPRINT_SCHEMA = 'cellular-fingerprint/1';

/** @typedef {{ path: string, hash: string }} Entry */
/** @typedef {{ fingerprint: string, entries: Entry[], count: number }} RepoFingerprint */
/** @typedef {{ added: string[], removed: string[], changed: string[] }} EntryDiff */

/** PURE. SHA-256 of a string (UTF-8) or of raw bytes, as lower-case hex.
 * @param {string | Uint8Array} bytes @returns {string} */
export function hashText(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** PURE. The fingerprint of a controlled set. Sorting is by code unit on the path, which
 * is stable across platforms because the paths are POSIX-normalised by git.
 * @param {ReadonlyArray<Entry>} entries @returns {string} */
export function fingerprintOf(entries) {
  const lines = [...entries]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((entry) => `${entry.path}\u0000${entry.hash}\n`)
    .join('');
  return hashText(`${FINGERPRINT_SCHEMA}\n${lines}`);
}

/** PURE. What moved between two controlled sets. Reported as ADDRESSES, because
 * "something changed" is not a usable failure message.
 * @param {ReadonlyArray<Entry>} before @param {ReadonlyArray<Entry>} after
 * @returns {EntryDiff} */
export function diffEntries(before, after) {
  const was = new Map(before.map((e) => [e.path, e.hash]));
  const is = new Map(after.map((e) => [e.path, e.hash]));
  /** @type {EntryDiff} */
  const diff = { added: [], removed: [], changed: [] };
  for (const [path, hash] of is) {
    const previous = was.get(path);
    if (previous === undefined) diff.added.push(path);
    else if (previous !== hash) diff.changed.push(path);
  }
  for (const path of was.keys()) if (!is.has(path)) diff.removed.push(path);
  for (const list of [diff.added, diff.removed, diff.changed]) list.sort();
  return diff;
}

/** @typedef {{ status: number, stdout: string, stderr: string }} GitResult */

/** `shell` stays false: git is a real executable and these arguments are never a shell
 * expression. The environment is extended, never replaced, so a user's git configuration
 * still applies. `input` is for the batch protocols (`--stdin-paths`), which is how
 * ./byte-equivalence.mjs asks about hundreds of files in two invocations.
 * @param {string} root @param {ReadonlyArray<string>} args
 * @param {Record<string, string>} [env] @param {{ input?: string }} [options]
 * @returns {GitResult} */
function git(root, args, env = {}, options = {}) {
  const result = spawnSync('git', [...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
    ...(options.input === undefined ? {} : { input: options.input }),
  });
  if (result.error) throw new Error(`git could not be run in ${root}: ${result.error.message}`);
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

// One git runner, shared: `./authorization.mjs` asks git the same kind of question and a
// second spawn wrapper would be a second set of defaults to keep in step.
export { git as gitRun };

/** FAIL CLOSED: a git command that did not succeed is an error, never an empty answer.
 * @param {string} root @param {ReadonlyArray<string>} args
 * @param {Record<string, string>} [env] @returns {string} */
function gitOrThrow(root, args, env = {}) {
  const result = git(root, args, env);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (exit ${result.status}): ${result.stderr.trim()}`);
  }
  return result.stdout;
}

/** Throws unless `root` is inside a git work tree. The rule is defined over the state git
 * would commit, so without git there is no controlled set to fingerprint — and answering
 * "verified" would be the exact dishonesty Article 8 exists to stop.
 * @param {string} root @returns {void} */
export function requireGitRepo(root) {
  const inside = git(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    throw new Error(`${root} is not a git work tree: the final-verification rule is defined `
      + 'over the state git would commit (see tools/gates/FINAL-VERIFICATION.md)');
  }
}

/** The controlled set: repository-relative POSIX paths that EXIST on disk now. A path git
 * still has in the index but which was deleted on disk is absent here on purpose — the
 * deletion is part of the state, and leaving the entry out is what makes the fingerprint
 * change.
 * @param {string} [root] @returns {string[]} */
export function controlledFiles(root = process.cwd()) {
  requireGitRepo(root);
  const raw = gitOrThrow(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const seen = new Set(raw.split('\u0000').filter((p) => p !== ''));
  return [...seen].filter((rel) => {
    try {
      return statSync(join(root, rel)).isFile();
    } catch {
      return false;
    }
  }).sort();
}

/** The controlled set with each file's content hash, plus the fingerprint over it.
 * @param {string} [root] @returns {RepoFingerprint} */
export function fingerprintRepo(root = process.cwd()) {
  /** @type {Entry[]} */
  const entries = [];
  for (const rel of controlledFiles(root)) {
    entries.push({ path: rel, hash: hashText(readFileSync(join(root, rel))) });
  }
  return { fingerprint: fingerprintOf(entries), entries, count: entries.length };
}

/**
 * The git tree id of the CURRENT WORKING STATE, computed WITHOUT touching the real index.
 *
 * `GIT_INDEX_FILE` points at a throwaway index in the system temporary directory, so
 * `git add -A` here stages nothing a human would see: the repository's own index, HEAD and
 * working tree are left exactly as they were, and the only side effect is content-addressed
 * objects in `.git/objects`, which git itself garbage-collects.
 * @param {string} [root] @returns {string} */
export function workingTreeId(root = process.cwd()) {
  requireGitRepo(root);
  const dir = mkdtempSync(join(tmpdir(), 'cellular-index-'));
  const env = { GIT_INDEX_FILE: join(dir, 'index') };
  try {
    git(root, ['read-tree', 'HEAD'], env); // absent on a repository with no commit yet
    gitOrThrow(root, ['add', '-A'], env);
    return gitOrThrow(root, ['write-tree'], env).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}

/**
 * The tree id of what is STAGED right now — the thing a commit would actually record.
 * This one runs on the real index, which is acceptable because `write-tree` only writes
 * content-addressed objects and refreshes the index's own cache-tree; it changes no file,
 * no ref and nothing a later `git status` reports differently.
 * @param {string} [root] @returns {string} */
export function stagedTreeId(root = process.cwd()) {
  requireGitRepo(root);
  return gitOrThrow(root, ['write-tree']).trim();
}

/** The commit HEAD names, or `null` on a repository with no commit yet.
 * @param {string} [root] @returns {string | null} */
export function headCommit(root = process.cwd()) {
  const result = git(root, ['rev-parse', 'HEAD']);
  const text = result.stdout.trim();
  return result.status === 0 && /^[0-9a-f]{40}$/.test(text) ? text : null;
}

/** Everything a verification record needs about the state it is about, read once.
 * @param {string} [root]
 * @returns {{ fingerprint: string, entries: Entry[], count: number, tree: string, head: string | null }} */
export function repoState(root = process.cwd()) {
  const { fingerprint, entries, count } = fingerprintRepo(root);
  return { fingerprint, entries, count, tree: workingTreeId(root), head: headCommit(root) };
}
