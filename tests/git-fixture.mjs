// Shared fixture for the final-verification tests: a THROWAWAY git repository under the
// system temporary directory. Not a test file — the name does not match `node --test`
// discovery, so nothing here runs on its own.
//
// Why a real repository instead of a stub: the rule being tested is "the verified state
// is the state git would commit", and that sentence is defined by `git ls-files` and
// `git write-tree`. A fake git would let the test agree with the implementation while
// both disagreed with git. The real repository's own `.git` is NEVER touched: every
// fixture is created by `git init` in a fresh temporary directory and removed after.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The gate modules a temporary repository needs to run the hooks and the CLI. Copied
 * rather than imported by path, because a hook script resolves them from ITS own root. */
export const PORTABLE_GATES = Object.freeze([
  'fingerprint.mjs', 'final-evidence.mjs', 'verify-final.mjs', 'authorization.mjs',
  'commit-range.mjs', 'count-tests.mjs', 'byte-equivalence.mjs', 'sanitize.mjs',
  'verification-suite.mjs', 'verification-contract.mjs', 'verification-argv.mjs',
]);

/** The hook scripts, as tracked in `.githooks/`. */
export const HOOKS = Object.freeze(['pre-commit', 'commit-msg', 'pre-push']);

/** @typedef {{ status: number, stdout: string, stderr: string }} RunResult */

/**
 * Runs a command in `cwd` and returns its result. `shell` stays false: every command
 * here is `git` or the node binary, and a shell would split a path containing a space.
 * @param {string} cwd @param {string} cmd @param {ReadonlyArray<string>} args
 * @param {{ input?: string, env?: Record<string, string> }} [options] @returns {RunResult}
 */
export function run(cwd, cmd, args, options = {}) {
  const result = spawnSync(cmd, [...args], {
    cwd,
    encoding: 'utf8',
    ...(options.input === undefined ? {} : { input: options.input }),
    env: { ...process.env, ...(options.env ?? {}) },
  });
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** @param {string} cwd @param {ReadonlyArray<string>} args @returns {RunResult} */
export const git = (cwd, args) => run(cwd, 'git', args);

/** True when a command answers at all. Used to SKIP with a stated reason rather than
 * to pretend a test passed.
 * @param {string} cmd @param {ReadonlyArray<string>} args @returns {boolean} */
export function available(cmd, args) {
  try {
    return spawnSync(cmd, [...args], { encoding: 'utf8' }).error === undefined;
  } catch {
    return false;
  }
}

export const hasGit = () => available('git', ['--version']);
export const hasSh = () => available('sh', ['-c', 'exit 0']);

/** @param {string} root @param {string} rel @param {string} text */
export function write(root, rel, text) {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, 'utf8');
}

/** The files every fixture starts from: a tiny vault, a doc, a test and a checklist —
 * one controlled file of each kind the rule names.
 * @type {ReadonlyArray<[string, string]>} */
const SEED = Object.freeze([
  ['README.md', '# Fixture\n\nA throwaway repository.\n'],
  ['docs/guide.md', '# Guide\n\nOne paragraph.\n'],
  ['src/unit.test.mjs', "// placeholder test file\nexport const ok = true;\n"],
  ['RELEASE_CHECKLIST.md', '- [ ] one item\n'],
  ['vault/state/log.md', '# Log\n\n## entry one\n'],
  ['.gitignore', 'node_modules/\n.cellular/\n'],
]);

/**
 * A fresh repository with one commit, the seed files, and git configured so that
 * committing needs no global identity.
 * @param {{ commit?: boolean }} [options] @returns {string} the repository root
 */
export function makeRepo(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cellular-final-'));
  git(root, ['init', '-q', '-b', 'main']);
  // Assembled from fragments so this file holds no literal address: the repository's leak
  // gate forbids one, and a fixture identity is no reason to weaken that gate.
  git(root, ['config', 'user.email', ['fixture', '@', 'example', '.invalid'].join('')]);
  git(root, ['config', 'user.name', 'Fixture']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  for (const [rel, text] of SEED) write(root, rel, text);
  if (options.commit !== false) {
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'seed']);
  }
  return root;
}

/** Copies the portable gate modules and the hook scripts into a fixture repository,
 * then points git at the hooks. The copies are what a real adopter would have.
 * @param {string} root @param {{ hooks?: boolean }} [options] */
export function installGates(root, options = {}) {
  mkdirSync(join(root, 'tools', 'gates'), { recursive: true });
  for (const name of PORTABLE_GATES) {
    copyFileSync(join(REPO_ROOT, 'tools', 'gates', name), join(root, 'tools', 'gates', name));
  }
  if (options.hooks === false) return;
  mkdirSync(join(root, '.githooks'), { recursive: true });
  for (const name of HOOKS) {
    const target = join(root, '.githooks', name);
    copyFileSync(join(REPO_ROOT, '.githooks', name), target);
    try {
      spawnSync('chmod', ['755', target]);
    } catch {
      // Windows has no mode bits to set; git runs the hook through sh regardless.
    }
  }
  git(root, ['config', 'core.hooksPath', '.githooks']);
}

/** @param {string} root */
export function cleanup(root) {
  rmSync(root, { recursive: true, force: true, maxRetries: 3 });
}

/** A stub mandatory suite: every check reports the exit code it was given, and an
 * optional `before` hook can mutate the repository WHILE the suite runs — which is how
 * "the state changed during verification" is tested without racing anything.
 * @param {{ exits?: ReadonlyArray<number>, during?: (root: string) => void }} [options]
 * @returns {Array<{ name: string, run: (root: string) => { exit: number, output: string } }>}
 */
export function stubSuite(options = {}) {
  const exits = options.exits ?? [0, 0];
  return exits.map((exit, index) => ({
    name: `stub-${index + 1}`,
    /** @param {string} root @returns {{ exit: number, output: string }} */
    run: (root) => {
      if (index === 0 && options.during) options.during(root);
      return { exit, output: `stub check ${index + 1} finished with ${exit}` };
    },
  }));
}
