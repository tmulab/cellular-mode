// verification-run.mjs — the only two things `bootstrap verification` does to the world: READ the
// target's contract, and RUN one of its checks. Split from `verification-cli.mjs` for the 200-line
// rule, and the split falls where the responsibilities do: that file decides and renders, this one
// touches the disk and starts a process.
//
// THE RUN IS THE ONLY ROUTE TO VERIFIED, and it is evidence rather than consent: the check is
// executed ONCE, as an argv with `shell: false` through `exec.runCheck` (so H7's Windows shim
// resolution applies, and a shell never does), and the label moves only on exit 0. A failure, a
// timeout and a not-runnable command all leave the contract EXACTLY as it was, with the reason
// printed — "could not establish it" is never "established".
//
// BOOTSTRAP WILL NOT EDIT A DOCUMENT IT CANNOT READ AS A CONTRACT. `readTargetContract` refuses an
// absent, unparseable or wrong-schema file instead of repairing it: a repair would be a guess
// about somebody else's suite, and the validator of this schema is the gate's, not this module's.
import { CODES, refuse } from './errors.mjs';
import { CHECK_TIMEOUT_MS, runCheck } from './exec.mjs';
import { VERIFICATION_FILE } from './plan-constants.mjs';
import { CONTRACT_SCHEMA, CONTRACT_VERSION, contractBytes } from './verification.mjs';
import { checkById, markVerified } from './verification-edit.mjs';
import { INVOCATION } from './verification-report.mjs';
import { readIfPresent, replaceEvolving } from './writer.mjs';

/** @typedef {{ lines: string[], code: number, stdout?: boolean }} FlowResult */

/** The contract on disk, or a refusal that says what is wrong with it.
 * @param {string} targetRoot @returns {Record<string, unknown>} */
export function readTargetContract(targetRoot) {
  const text = readIfPresent(targetRoot, VERIFICATION_FILE);
  if (text === null) {
    throw refuse(CODES.BAD_FACTS, `there is no ${VERIFICATION_FILE} here, so this project has no verification contract`
      + ' — final verification would use its built-in suite, and `bootstrap new`/`existing` is what generates one', {});
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw refuse(CODES.BAD_FACTS, `${VERIFICATION_FILE} is not JSON: ${error instanceof Error ? error.message : 'unparseable'}`, {});
  }
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (!(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    && record.schema === CONTRACT_SCHEMA && record.version === CONTRACT_VERSION
    && Array.isArray(record.checks))) {
    throw refuse(CODES.BAD_FACTS, `${VERIFICATION_FILE} is not a ${CONTRACT_SCHEMA} v${CONTRACT_VERSION}`
      + ' document with a checks array, so Bootstrap will not edit it', {});
  }
  return record;
}

/** Writes a contract through the confined, atomic, evolving-files-only door.
 * @param {string} targetRoot @param {Record<string, unknown>} contract @returns {string} */
export function saveContract(targetRoot, contract) {
  return replaceEvolving(targetRoot, VERIFICATION_FILE, contractBytes(contract)).sha256After;
}

/**
 * Runs one check once, and records VERIFIED only if it passed.
 * @param {{ targetRoot: string, contract: Record<string, unknown>, id: string, now: string,
 *   env?: NodeJS.ProcessEnv | undefined, runOne?: typeof runCheck | undefined }} input
 * @returns {FlowResult}
 */
export function runOneCheck(input) {
  const check = checkById(input.contract, input.id);
  const seconds = typeof check.timeoutSeconds === 'number' ? check.timeoutSeconds : 0;
  const outcome = (input.runOne ?? runCheck)([...check.argv].map(String), {
    cwd: input.targetRoot,
    timeoutMs: seconds > 0 ? seconds * 1000 : CHECK_TIMEOUT_MS,
    ...(input.env === undefined ? {} : { env: input.env }),
  });
  const ran = [`Ran ${input.id}: ${[...check.argv].join(' ')}`,
    ...(outcome.resolvedArgv ? [`  resolved argv (H7, no shell): ${[...outcome.resolvedArgv].join(' ')}`] : []),
    `  status ${outcome.status}${outcome.exitCode === null ? '' : ` · exit ${outcome.exitCode}`}${outcome.reason === null ? '' : ` · ${outcome.reason}`}`];
  if (outcome.status !== 'passed') {
    return { lines: [...ran, '',
      `The contract is UNCHANGED: "${input.id}" stays ${String(check.status)}, because only a run that PASSES here`,
      'establishes VERIFIED. Fix the command or the project, then run it again.'], code: 2 };
  }
  saveContract(input.targetRoot, markVerified(input.contract, input.id, input.now));
  return { lines: [...ran, '', `"${input.id}" is now VERIFIED in ${VERIFICATION_FILE}.`,
    `Make it block commits: ${INVOCATION} mandatory ${input.id} --confirm`], code: 0 };
}
