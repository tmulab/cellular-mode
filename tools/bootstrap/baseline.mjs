// baseline.mjs — `vault/adoption-baseline.json`: what this project WAS, the moment before Cellular
// Mode was installed into it. Schema `cellular-mode/adoption-baseline`, version 1.
//
// IT EXISTS TO PROTECT THE PROJECT FROM THE METHOD. Adopting a method must not change what the code
// does, and "must not" is worth nothing without a record of the before. Commit and tree identify the
// content; cleanliness and a changed COUNT say whether that content was even settled; languages,
// build systems, commands, CI, hooks, instruction files, docs and security tooling say what was
// there to preserve.
//
// A FAILURE FOUND HERE IS PRE-EXISTING AND STAYS PRE-EXISTING. `knownFailing` is not a to-do list
// and Bootstrap never "fixes" an entry on it. A project whose tests were red before adoption has
// red tests after adoption, recorded, attributed to the project and not to the method.
//
// `invariants` is EMPTY BY CONSTRUCTION. What must never change about a system is a human's
// statement, not a detector's guess, so this tool writes `[]` and leaves the file for a human to
// extend. A tool that invented invariants would be inventing acceptance criteria.
//
// The VALIDATOR of this record lives in `baseline-schema.mjs` and is re-exported here, so a reader
// and a writer of the file pass through the same gate.
import { CHECK_TIMEOUT_MS, runCheck } from './exec.mjs';
import { BASELINE_SCHEMA, BASELINE_VERSION } from './baseline-schema.mjs';

/** @typedef {import('./exec.mjs').CheckResult} CheckResult */
/** @typedef {{ id: string, argv: ReadonlyArray<string>, exitCode: number | null,
 *   durationMs: number, status: string, reason: string | null }} BaselineCheck */

export {
  BASELINE_KEYS, BASELINE_REL, BASELINE_SCHEMA, BASELINE_VERSION, assertBaseline, validateBaseline,
} from './baseline-schema.mjs';

/** The approval id that — together with `--confirm` — is the ONLY way a project command is ever
 * executed by adoption. Without both, `checkResults` stays empty and says why. */
export const BASELINE_APPROVAL = 'baseline-checks';

/**
 * Runs the discovered checks ONCE, or refuses to run anything and says so. Two locks, both
 * required: the approval id `baseline-checks` and `--confirm`. Either one missing means an empty
 * result and a named reason — never a quiet run, never a silent skip.
 * @param {{ commands: ReadonlyArray<{ id: string, argv: ReadonlyArray<string> }>,
 *   targetRoot: string, approvals: ReadonlySet<string>, confirm?: boolean | undefined,
 *   timeoutMs?: number | undefined, env?: NodeJS.ProcessEnv | undefined,
 *   runOne?: typeof runCheck | undefined }} input
 * @returns {{ results: ReadonlyArray<BaselineCheck>, ran: boolean, reason: string | null }}
 */
export function runBaselineChecks(input) {
  if (!input.approvals.has(BASELINE_APPROVAL)) {
    return { results: Object.freeze([]), ran: false,
      reason: `no check was executed: running a project's own commands needs --approve ${BASELINE_APPROVAL}` };
  }
  if (input.confirm !== true) {
    return { results: Object.freeze([]), ran: false,
      reason: 'no check was executed: --confirm is required as well as the approval' };
  }
  const one = input.runOne ?? runCheck;
  /** @type {BaselineCheck[]} */
  const results = [];
  for (const entry of input.commands) {
    const outcome = one(entry.argv, {
      cwd: input.targetRoot,
      timeoutMs: input.timeoutMs ?? CHECK_TIMEOUT_MS,
      env: input.env,
    });
    results.push(Object.freeze({
      id: entry.id,
      argv: Object.freeze([...outcome.argv]),
      exitCode: outcome.exitCode,
      durationMs: outcome.durationMs,
      status: outcome.status,
      reason: outcome.reason,
    }));
  }
  return { results: Object.freeze(results), ran: true, reason: null };
}

/** PURE. The environment limitation every approved run carries, said once rather than implied.
 * @returns {ReadonlyArray<string>} */
export function executionLimitations() {
  return Object.freeze([
    'an approved check inherits this shell\'s environment unchanged: Bootstrap does not scrub PATH or any variable, so a check can see whatever this terminal can see',
    'no shell is ever used: a command whose program is not directly spawnable (a .cmd wrapper on Windows, a shell builtin) is recorded not-runnable rather than run through a shell',
    'a check is run ONCE, with a timeout and a captured-output cap; its output is not recorded, only its exit code, duration and status',
  ]);
}

/**
 * PURE. The baseline record for one detection. Lists are sorted or kept in discovery order so that
 * the same project described twice produces the same bytes twice, apart from the durations a real
 * run measures.
 * @param {{ detection: import('./detect.mjs').Detection,
 *   discovery: import('./commands.mjs').Discovery,
 *   checkResults?: ReadonlyArray<BaselineCheck> | undefined,
 *   limitations?: ReadonlyArray<string> | undefined, now: string }} input
 * @returns {Record<string, unknown>}
 */
export function buildBaseline(input) {
  const { detection, discovery } = input;
  const results = [...(input.checkResults ?? [])];
  return {
    schema: BASELINE_SCHEMA,
    version: BASELINE_VERSION,
    recordedAt: input.now,
    commit: detection.git.commit,
    tree: detection.git.tree,
    clean: detection.git.clean,
    changedCount: detection.git.changedCount,
    languages: [...detection.languages],
    buildSystems: detection.buildSystems.map((entry) => entry.id),
    commands: discovery.commands.map((entry) => ({
      id: entry.id, label: entry.label, argv: [...entry.argv], status: entry.status, basis: entry.basis,
    })),
    ci: detection.ci.map((provider) => ({ id: provider.id, files: [...provider.files] })),
    hooks: { machinery: detection.hooks.machinery, hooksPath: detection.hooks.hooksPath },
    instructionFiles: detection.instructionFiles.map((entry) => entry.evidence),
    docs: detection.docs.map((entry) => entry.evidence),
    securityTooling: detection.securityTooling.map((entry) => entry.id),
    invariants: [],
    knownFailing: results.filter((entry) => entry.status === 'failed').map((entry) => entry.id),
    checkResults: results.map((entry) => ({ ...entry, argv: [...entry.argv] })),
    limitations: [...(input.limitations ?? [])],
  };
}

