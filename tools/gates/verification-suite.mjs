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
import { join } from 'node:path';
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

/** PURE given the suite entries. The runnable checks a contract's mandatory list denotes. Each
 * argv is spawned with NO shell and the check's own timeout.
 * @param {ReadonlyArray<import('./verification-contract.mjs').SuiteEntry>} entries
 * @returns {ReadonlyArray<Check>} */
export function contractChecks(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze({
    name: entry.id,
    /** @param {string} root @returns {CheckOutcome} */
    run: (root) => spawnCheck(root, entry.argv[0] ?? '', entry.argv.slice(1), false,
      entry.timeoutSeconds * MS),
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
