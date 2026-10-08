// verification-suite.mjs — WHICH suite Article 8 runs, and the one spawner that runs it.
//
// Two sources, and the choice between them is a FILE EXISTING, nothing cleverer:
//   `vault/verification.json` ABSENT  → `MANDATORY_SUITE`, this repository's own four checks,
//      unchanged. That is the whole compatibility promise of decision BS3, and
//      `tests/gates-verification-suite.test.mjs` asserts the selection equals this constant.
//   `vault/verification.json` PRESENT → the contract's MANDATORY checks, plus the method's own
//      `cell-state` check when `tools/cellmode/cli.mjs` is there. The contract cannot remove
//      `cell-state`, because a project cannot approve its way out of the method's own integrity.
//
// FAIL CLOSED, THREE WAYS. A file that cannot be read, a document that does not validate, and a
// valid document with nothing mandatory in it all produce an EMPTY suite and a REASON. An empty
// suite is never a pass (`final-evidence.verdict`), and `verify-final` prints the reason and
// exits non-zero. "The contract was unreadable" must never resolve to "nothing to check".
//
// NO SHELL FOR A CONTRACT CHECK, EVER. `spawnCheck` takes `shell: true` only for the literal
// `npm` of the built-in suite (on Windows it is a `.cmd` shim that `spawnSync` cannot execute
// directly), and `contractChecks` never passes it: an argv from a project file is DATA, so a `;`
// or a `&&` in it reaches the program as text and nothing interprets it.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  MAX_CONTRACT_BYTES, NO_MANDATORY_REASON, VERIFICATION_REL, mandatorySuite, parseContract,
} from './verification-contract.mjs';

/** @typedef {{ exit: number, output: string }} CheckOutcome */
/** @typedef {{ name: string, run: (root: string) => CheckOutcome }} Check */
/** @typedef {{ suite: ReadonlyArray<Check>, source: string, error: string | null }} Selection */

/** Where the built-in suite comes from, as it is named in a record and in a report. */
export const BUILT_IN = 'built-in';

/** The method's own state check: always part of the suite when the CLI is installed, contract or
 * no contract. Its argv is a literal here, never project data. */
export const CELL_STATE_ARGV = Object.freeze(['tools/cellmode/cli.mjs', 'check']);

/** How long a contract check may run by default, in milliseconds. */
const MS = 1000;

/**
 * Runs one check. `shell` is true ONLY for `npm`, which on Windows is a .cmd shim that spawnSync
 * cannot execute directly; the node binary is always spawned without a shell, because its path
 * contains spaces and a shell would split it. Same reasoning as tools/gates/trilateral.mjs.
 * @param {string} root @param {string} cmd @param {ReadonlyArray<string>} args
 * @param {boolean} [shell] @param {number} [timeoutMs] @returns {CheckOutcome}
 */
export function spawnCheck(root, cmd, args, shell = false, timeoutMs = 0) {
  // With `shell`, the command travels as ONE string and the argument list stays empty: node
  // deprecates passing args beside `shell: true` because they are concatenated unescaped. Every
  // string on that path is a literal in this file, never input.
  const command = shell ? [cmd, ...args].join(' ') : cmd;
  const result = spawnSync(command, shell ? [] : [...args], {
    cwd: root, encoding: 'utf8', shell, maxBuffer: 64 * 1024 * 1024,
    ...(timeoutMs > 0 ? { timeout: timeoutMs } : {}),
  });
  if (result.error) return { exit: 1, output: `could not run ${cmd}: ${result.error.message}` };
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { exit: typeof result.status === 'number' ? result.status : 1, output };
}

/** @type {(root: string, args: ReadonlyArray<string>) => CheckOutcome} */
const node = (root, args) => spawnCheck(root, process.execPath, args);

/**
 * THE COMPLETE BUILT-IN MANDATORY SUITE, as data. Four checks, in the order a reader would run
 * them: types, tests, the static gates in release mode, and the method's own state integrity.
 * Adding a check here adds it to the rule; removing one is a relaxation and needs the clause in
 * docs/00-constitution.md to say so.
 * @type {ReadonlyArray<Check>} */
export const MANDATORY_SUITE = Object.freeze([
  { name: 'typecheck', run: (root) => spawnCheck(root, 'npm', ['run', 'typecheck'], true) },
  { name: 'tests', run: (root) => node(root, ['--test']) },
  { name: 'gates-release', run: (root) => node(root, ['tools/gates/check-all.mjs', '--release']) },
  { name: 'cell-state', run: (root) => node(root, [...CELL_STATE_ARGV]) },
]);

/** The absolute path of a project-relative file. @param {string} root @param {string} rel
 * @returns {string} */
const at = (root, rel) => join(root, ...rel.split('/'));

/** The contract text, or the reason there is none to read. A file larger than the cap is a
 * REFUSAL and not a truncated read: half a contract is not a contract.
 * @param {string} root @returns {{ text: string | null, error: string | null }} */
export function readContract(root) {
  const full = at(root, VERIFICATION_REL);
  if (!existsSync(full)) return { text: null, error: null };
  try {
    const stat = statSync(full);
    if (!stat.isFile()) return { text: null, error: `${VERIFICATION_REL} is not a file` };
    if (stat.size > MAX_CONTRACT_BYTES) {
      return { text: null, error: `${VERIFICATION_REL} is larger than ${MAX_CONTRACT_BYTES} bytes` };
    }
    return { text: readFileSync(full, 'utf8'), error: null };
  } catch (error) {
    return { text: null, error: `${VERIFICATION_REL} could not be read: ${error instanceof Error ? error.message : 'unknown error'}` };
  }
}

/** H7 — THE CLOSED LIST OF PACKAGE-MANAGER SHIMS, and the ONE place the contract side resolves
 * them. On Windows `npm` is `npm.cmd`, which `spawnSync` without a shell cannot start, so a
 * project whose check is `["npm","test"]` had no way to go green (trial finding B-09) short of a
 * shell — the one thing a contract check may never get. The resolution is narrow: an EXACT `npm`
 * or `npx` becomes `[node, <dirname(node)>/node_modules/npm/bin/<shim>-cli.js, …rest]` when that
 * file exists. `cmd /c`, `./npm.cmd` and every other wrapper stay refused by `verification-argv`.
 *
 * MIRRORED, NOT SHARED. `tools/bootstrap/exec-shim.mjs` holds the identical rule, because
 * Bootstrap may not import the gates (bootstrap/CONTRACTS.md). `tests/verification-shim.test.mjs`
 * imports both and asserts they answer identically; a drift between them fails that test. */
export const SHIMS = Object.freeze({ npm: 'npm-cli.js', npx: 'npx-cli.js' });

/** The alternative a human is handed when resolution fails — a NON-SHELL one, on purpose. */
export const SHIM_ALTERNATIVE = 'use ["node", ...] directly, e.g. node --test';

/** @param {string} program @param {string} cli @returns {string} */
export function shimReason(program, cli) {
  return `${program} is a Windows .cmd shim and no shell is ever used for a check; ${cli} is not`
    + ` there either — ${SHIM_ALTERNATIVE}`;
}

/** PURE given `deps`. @param {ReadonlyArray<string>} argv
 * @param {{ platform?: string | undefined, execPath?: string | undefined,
 *   exists?: ((path: string) => boolean) | undefined }} [deps]
 * @returns {{ argv: ReadonlyArray<string>, resolved: boolean, reason: string | null }} */
export function resolveShimArgv(argv, deps = {}) {
  const list = Object.freeze([...(Array.isArray(argv) ? argv : [])].map(String));
  const platform = deps.platform ?? process.platform;
  const program = list[0] ?? '';
  const script = Object.hasOwn(SHIMS, program)
    ? /** @type {Record<string, string>} */ (SHIMS)[program]
    : undefined;
  if (platform !== 'win32' || script === undefined) return { argv: list, resolved: false, reason: null };
  const execPath = deps.execPath ?? process.execPath;
  const cli = join(dirname(execPath), 'node_modules', 'npm', 'bin', script);
  if (!(deps.exists ?? existsSync)(cli)) return { argv: list, resolved: false, reason: shimReason(program, cli) };
  return { argv: Object.freeze([execPath, cli, ...list.slice(1)]), resolved: true, reason: null };
}

/** PURE given the suite entries. The runnable checks a contract's mandatory list denotes. Each
 * argv is spawned with NO shell and the check's own timeout; the resolved argv is reported in the
 * output, so the evidence record says what actually ran.
 * @param {ReadonlyArray<import('./verification-contract.mjs').SuiteEntry>} entries
 * @returns {ReadonlyArray<Check>} */
export function contractChecks(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze({
    name: entry.id,
    /** @param {string} root @returns {CheckOutcome} */
    run: (root) => {
      const shim = resolveShimArgv(entry.argv);
      if (shim.reason !== null) return { exit: 1, output: `not-runnable: ${shim.reason}` };
      const outcome = spawnCheck(root, shim.argv[0] ?? '', shim.argv.slice(1), false,
        entry.timeoutSeconds * MS);
      if (!shim.resolved) return outcome;
      return { exit: outcome.exit, output: `resolved argv: ${shim.argv.join(' ')}\n${outcome.output}` };
    },
  })));
}

/**
 * The suite for one root, with the source named and every failure reported as a REASON rather
 * than as a smaller suite.
 * @param {string} root @returns {Selection}
 */
export function selectSuite(root) {
  const read = readContract(root);
  if (read.error !== null) return { suite: Object.freeze([]), source: VERIFICATION_REL, error: read.error };
  if (read.text === null) return { suite: MANDATORY_SUITE, source: BUILT_IN, error: null };
  const parsed = parseContract(read.text);
  if (!parsed.ok) {
    const first = parsed.errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join(' · ');
    return { suite: Object.freeze([]), source: VERIFICATION_REL,
      error: `${VERIFICATION_REL} is not a valid verification contract (${parsed.errors.length} error(s)) — ${first}` };
  }
  const entries = mandatorySuite(parsed.contract);
  if (entries.length === 0) {
    return { suite: Object.freeze([]), source: VERIFICATION_REL, error: NO_MANDATORY_REASON };
  }
  /** @type {Check[]} */
  const suite = [...contractChecks(entries)];
  if (!suite.some((check) => check.name === 'cell-state') && existsSync(at(root, 'tools/cellmode/cli.mjs'))) {
    suite.push({ name: 'cell-state', run: (dir) => node(dir, [...CELL_STATE_ARGV]) });
  }
  return { suite: Object.freeze(suite), source: VERIFICATION_REL, error: null };
}
