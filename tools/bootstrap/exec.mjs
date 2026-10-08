// exec.mjs — the ONLY module in Bootstrap that may start a process, and the only reason it
// exists is that two facts cannot be read from a file: whether a directory is inside a git work
// tree, and which commit the source checkout is on.
//
// Four properties, all of them deliberate and all of them testable by reading this file:
//   NO SHELL — `shell: false`, always. The command is an argv ARRAY, so a directory name
//     containing `;` or `$(…)` is an argument and never punctuation.
//   NO INHERITED ENVIRONMENT BEYOND WHAT GIT NEEDS — `git` is invoked with the caller's env,
//     because git needs PATH and HOME to resolve itself, but nothing here ever puts a path, a
//     project name or any target-derived text into the environment.
//   BOUNDED — a timeout and a captured-output cap, so a hung or chatty program cannot stall an
//     install or exhaust memory.
//   TOTAL — it never throws. A failure is `{ ok: false }` with the status, which is what lets
//     every caller treat "could not establish it" as UNKNOWN instead of as a crash.
//
// H7 lives one import away, in `./exec-shim.mjs`: `runCheck` is the ONE boundary that resolves a
// Windows package-manager shim to its Node script, and it still never uses a shell.
import { spawnSync } from 'node:child_process';
import { resolveShimArgv } from './exec-shim.mjs';

export { SHIMS, SHIM_ALTERNATIVE, resolveShimArgv, shimReason } from './exec-shim.mjs';

/** @typedef {{ ok: boolean, status: number | null, stdout: string, stderr: string,
 *   truncated: boolean, errorCode?: string | null }} ExecResult */
/** @typedef {'passed'|'failed'|'timeout'|'not-runnable'} CheckStatus */
/** @typedef {{ argv: ReadonlyArray<string>, exitCode: number | null, durationMs: number,
 *   status: CheckStatus, reason: string | null,
 *   resolvedArgv?: ReadonlyArray<string> | null }} CheckResult */

/** How long a probe may take. A git call that has not answered in five seconds is a fact we do
 * not have, and UNKNOWN is a usable answer where a hang is not. */
export const TIMEOUT_MS = 5000;

/** How much output is captured. Two facts fit in forty bytes; the cap is four orders of
 * magnitude above that and still far below anything that could hurt. */
export const MAX_OUTPUT = 64 * 1024;

/** @param {unknown} value @returns {string} */
const text = (value) => (typeof value === 'string' ? value : '');

/**
 * Runs one program. `argv[0]` is the program; the rest are arguments, never parsed.
 * TOTAL: it returns a result for every outcome, including "the program does not exist".
 * @param {ReadonlyArray<string>} argv @param {{ cwd?: string | undefined,
 *   timeoutMs?: number | undefined, maxOutput?: number | undefined,
 *   env?: NodeJS.ProcessEnv | undefined }} [options] @returns {ExecResult}
 */
export function run(argv, options = {}) {
  const [program, ...args] = argv;
  if (typeof program !== 'string' || program === '') {
    return { ok: false, status: null, stdout: '', stderr: 'no program named', truncated: false, errorCode: 'ENOPROGRAM' };
  }
  const max = options.maxOutput ?? MAX_OUTPUT;
  const result = spawnSync(program, args.map(String), {
    cwd: options.cwd,
    env: options.env ?? process.env,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? TIMEOUT_MS,
    maxBuffer: max,
  });
  const stdout = text(result.stdout);
  const stderr = text(result.stderr);
  return {
    ok: result.error === undefined && result.status === 0,
    status: typeof result.status === 'number' ? result.status : null,
    stdout: stdout.slice(0, max),
    stderr: stderr.slice(0, max),
    truncated: stdout.length > max || stderr.length > max,
    errorCode: result.error === undefined
      ? null
      : String(/** @type {{ code?: unknown }} */ (result.error).code ?? 'EFAILED'),
  };
}

/**
 * The commit a checkout is on, or `null` when that is not established — not a repository, no
 * git on PATH, a repository with no commit yet. `null` is a fact the manifest records as
 * UNKNOWN rather than a guess.
 * @param {string} cwd @param {NodeJS.ProcessEnv} [env] @returns {string | null}
 */
export function gitRevision(cwd, env) {
  const result = run(['git', 'rev-parse', 'HEAD'], { cwd, env });
  if (!result.ok) return null;
  const line = result.stdout.trim();
  return /^[0-9a-f]{40}$/.test(line) ? line : null;
}

/** Whether `cwd` is inside a git work tree. False means "not established": a missing git and a
 * plain directory are the same answer for every decision Bootstrap makes with it.
 * @param {string} cwd @param {NodeJS.ProcessEnv} [env] @returns {boolean} */
export function isInsideWorkTree(cwd, env) {
  const result = run(['git', 'rev-parse', '--is-inside-work-tree'], { cwd, env });
  return result.ok && result.stdout.trim() === 'true';
}

/** The environment a READ-ONLY git probe runs in. `GIT_OPTIONAL_LOCKS=0` is the whole point: a
 * plain `git status` refreshes and REWRITES `.git/index`, which would make "analysis wrote
 * nothing" false for the one directory a tree hash is most likely to check. Paired with the
 * `--no-optional-locks` and `-c core.fsmonitor=false` arguments below, belt and braces.
 * @param {NodeJS.ProcessEnv} [env] @returns {NodeJS.ProcessEnv} */
export function readOnlyGitEnv(env = process.env) {
  return { ...env, GIT_OPTIONAL_LOCKS: '0' };
}

/** The tree object of HEAD, or `null` when that is not established. Recorded alongside the commit
 * because a commit identifies history and a tree identifies CONTENT, and a baseline is a statement
 * about content. @param {string} cwd @param {NodeJS.ProcessEnv} [env] @returns {string | null} */
export function gitTree(cwd, env) {
  const result = run(['git', 'rev-parse', 'HEAD^{tree}'], { cwd, env: readOnlyGitEnv(env) });
  const line = result.stdout.trim();
  return result.ok && /^[0-9a-f]{40}$/.test(line) ? line : null;
}

/** Whether the work tree is clean, and how many entries are not. ONLY counts are returned: a
 * porcelain line holds a path, and a path from somebody else's repository is not something a
 * published baseline records. `null` means UNKNOWN, never "clean".
 * @param {string} cwd @param {NodeJS.ProcessEnv} [env]
 * @returns {{ clean: boolean, changedCount: number } | null} */
export function gitStatusCounts(cwd, env) {
  const result = run(
    ['git', '--no-optional-locks', '-c', 'core.fsmonitor=false', 'status', '--porcelain=v1'],
    { cwd, env: readOnlyGitEnv(env) },
  );
  if (!result.ok) return null;
  const lines = result.stdout.split('\n').filter((line) => line.trim() !== '');
  return { clean: lines.length === 0, changedCount: lines.length };
}

/** The configured `core.hooksPath`, or `null` when it is unset or not established. This closes the
 * one hook-detection gap Cell 3 left open. @param {string} cwd @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null} */
export function gitHooksPath(cwd, env) {
  const result = run(['git', 'config', '--get', 'core.hooksPath'], { cwd, env: readOnlyGitEnv(env) });
  const line = result.stdout.trim();
  return result.ok && line !== '' ? line : null;
}

/** How long a pre-existing project check may run before it is a fact we do not have. */
export const CHECK_TIMEOUT_MS = 300000;

/**
 * Runs ONE human-approved project command and classifies the outcome. It never interprets the
 * output and never reports a failure as anything but a failure: a check that exits non-zero is a
 * PRE-EXISTING failure of that project, and Bootstrap does not fix unrelated defects.
 *
 * `not-runnable` is a first-class outcome, not an error. On Windows `npm` is `npm.cmd`, which
 * `spawn` without a shell cannot start — and a shell is exactly what this module refuses to use,
 * because a discovered command is untrusted text. H7 narrows that: an EXACT `npm` or `npx` is
 * resolved to the Node script it wraps (`./exec-shim.mjs`), and only an unresolvable one is
 * `not-runnable`, with the non-shell alternative named. `resolvedArgv` reports what actually ran;
 * `argv` stays the argv that was ASKED for, because `process.execPath` is a machine path and the
 * baseline record it would land in is meant to be committed.
 * @param {ReadonlyArray<string>} argv @param {{ cwd?: string | undefined,
 *   timeoutMs?: number | undefined, maxOutput?: number | undefined,
 *   env?: NodeJS.ProcessEnv | undefined,
 *   run?: ((argv: ReadonlyArray<string>, options?: object) => ExecResult) | undefined }} [options]
 * @returns {CheckResult}
 */
export function runCheck(argv, options = {}) {
  const started = Date.now();
  const frozen = Object.freeze([...argv].map(String));
  const shim = resolveShimArgv(frozen);
  const resolvedArgv = shim.resolved ? shim.argv : null;
  if (shim.reason !== null) {
    return { argv: frozen, exitCode: null, durationMs: 0, status: 'not-runnable',
      reason: shim.reason, resolvedArgv: null };
  }
  const result = (options.run ?? run)(shim.argv, {
    cwd: options.cwd,
    env: options.env,
    timeoutMs: options.timeoutMs ?? CHECK_TIMEOUT_MS,
    maxOutput: options.maxOutput ?? MAX_OUTPUT,
  });
  const durationMs = Math.max(0, Date.now() - started);
  const code = result.errorCode ?? null;
  if (code === 'ETIMEDOUT') {
    return { argv: frozen, exitCode: null, durationMs, status: 'timeout', resolvedArgv,
      reason: 'the command did not finish inside the timeout' };
  }
  if (code !== null) {
    return { argv: frozen, exitCode: null, durationMs, status: 'not-runnable', resolvedArgv,
      reason: `the command could not be started (${code}); no shell is ever used, so a .cmd or shell builtin is not runnable here` };
  }
  if (typeof result.status !== 'number') {
    return { argv: frozen, exitCode: null, durationMs, status: 'not-runnable', resolvedArgv, reason: 'no exit code was available' };
  }
  return { argv: frozen, exitCode: result.status, durationMs, resolvedArgv,
    status: result.status === 0 ? 'passed' : 'failed', reason: null };
}
