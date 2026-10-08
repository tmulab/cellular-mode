// verification-edit.mjs — PURE. The five edits `bootstrap verification` can make to a target's
// `vault/verification.json`, and the argv refusal that guards `add`.
//
// WHY THIS FILE EXISTS AT ALL (H6, trial findings A-11 / B-07 / B-08). Before it, the only route
// from a fresh install to a green Article 8 was hand-editing internal JSON: the adopter had to
// guess `approval: { by: "human", at: <ISO> }` from a validation error. An approval is a human
// decision and must stay one — so it is still `--confirm`, still never inferred, and still never
// sets VERIFIED — but it is now a COMMAND, not a schema a human has to learn.
//
// A MIRROR, AND IT IS TESTED AS ONE. `tools/gates/verification-argv.mjs` is the one argv rule, and
// Bootstrap may not import the gates (bootstrap/CONTRACTS.md). So `argvRefusal` restates it here,
// and `tests/verification-contract.test.mjs` — allowed to import both — asserts that everything
// this module writes validates under the gate's own validator, for every edit.
//
// NOTHING HERE TOUCHES A DISK and nothing here decides anything about consent: it transforms one
// document into another, or refuses. The confirmation lives in `verification-cli.mjs`.
import { CODES, refuse } from './errors.mjs';
import { sanitize } from './display.mjs';

/** @typedef {{ id: string, argv: ReadonlyArray<string>, status: string, basis: string,
 *   mandatory: boolean, approval: { by: 'human', at: string } | null,
 *   timeoutSeconds?: number }} Check */

/** The gate's caps, restated. `MAX_BASIS` stays under the gate's 200. */
export const MAX_ARGV = 32;
export const MAX_ARG_LENGTH = 300;
export const MAX_CHECKS = 50;
export const MAX_BASIS = 160;

/** Programs whose job is to turn a STRING into a program, and the flags that mean it. */
export const WRAPPERS = Object.freeze(['sh', 'bash', 'zsh', 'ksh', 'dash', 'ash', 'fish', 'csh',
  'tcsh', 'cmd', 'command', 'powershell', 'pwsh', 'busybox', 'nu', 'xonsh']);
export const COMMAND_FLAGS = Object.freeze(['-c', '-ec', '-lc', '--command', '-command',
  '-commandwithargs', '-encodedcommand', '/c', '/k']);

const CONTROL = /[\u0000-\u001f\u007f]/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** PURE. The basename of a program, lower-cased, Windows extension removed.
 * @param {string} program @returns {string} */
export function programName(program) {
  const last = String(program).split(/[\\/]/).pop() ?? String(program);
  return last.toLowerCase().replace(/\.(?:exe|com|cmd|bat|ps1)$/, '');
}

/** PURE and TOTAL. Why `value` is not an argument array, or `null` when it is one.
 * @param {unknown} value @returns {string | null} */
export function argvRefusal(value) {
  if (!Array.isArray(value) || value.length === 0) return 'must be a non-empty array of strings';
  if (value.length > MAX_ARGV) return `must hold at most ${MAX_ARGV} arguments`;
  for (const part of value) {
    if (typeof part !== 'string' || part === '') return 'every argument must be a non-empty string';
    if (part.length > MAX_ARG_LENGTH) return `an argument may not exceed ${MAX_ARG_LENGTH} characters`;
    if (CONTROL.test(part)) return 'an argument may not hold a control character, a NUL or a newline';
  }
  const program = String(value[0]);
  if (/\s/.test(program) && !/[\\/]/.test(program)) {
    return 'the first element is the PROGRAM, not a command line: "npm run test" is a shell string, ["npm","run","test"] is an argv';
  }
  if (WRAPPERS.includes(programName(program))) {
    const flag = value.slice(1).find((part) => COMMAND_FLAGS.includes(String(part).toLowerCase()));
    if (flag !== undefined) {
      return `${programName(program)} ${String(flag)} is a shell string, not an argv: name the program itself`;
    }
  }
  return null;
}

/** @param {unknown} contract @returns {ReadonlyArray<Check>} */
export function checksOf(contract) {
  const list = /** @type {{ checks?: unknown }} */ (contract ?? {}).checks;
  return Object.freeze(Array.isArray(list) ? /** @type {Check[]} */ (list) : []);
}

/** The check `id` names, or a USAGE refusal naming the ids that do exist.
 * @param {unknown} contract @param {string} id @returns {Check} */
export function checkById(contract, id) {
  const checks = checksOf(contract);
  const found = checks.find((check) => String(check.id) === id);
  if (found !== undefined) return found;
  const known = checks.map((check) => String(check.id));
  throw refuse(CODES.USAGE, `no check "${sanitize(id, 60)}" in the contract${known.length === 0
    ? ' (it holds none at all: add one with `verification <target> add <id> -- <argv…>`)'
    : `; the ids are ${known.join(', ')}`}`, { unknown: [id], known });
}

/** @param {unknown} contract @param {ReadonlyArray<Check>} checks @returns {Record<string, unknown>} */
const withChecks = (contract, checks) => ({
  .../** @type {Record<string, unknown>} */ (contract), checks: [...checks],
});

/** @param {unknown} contract @param {string} id @param {(check: Check) => Check} change
 * @returns {Record<string, unknown>} */
function mapOne(contract, id, change) {
  checkById(contract, id);
  return withChecks(contract, checksOf(contract).map((check) => (String(check.id) === id ? change(check) : check)));
}

/**
 * Adds a HUMAN-AUTHORED check. Its label is PROPOSED, never INFERRED and never VERIFIED: a human
 * typing a command states an intention, and nobody has run it yet.
 * @param {unknown} contract @param {{ id: string, argv: ReadonlyArray<string>, now: string }} input
 * @returns {Record<string, unknown>}
 */
export function addCheck(contract, input) {
  const id = String(input.id);
  if (!ID.test(id)) throw refuse(CODES.USAGE, `"${sanitize(id, 60)}" is not a check id: use kebab-case, e.g. node-tests`, { unknown: [id] });
  const checks = checksOf(contract);
  if (checks.some((check) => String(check.id) === id)) {
    throw refuse(CODES.CONFLICT, `the contract already holds a check "${id}": revoke or rename it, Bootstrap never replaces one`, { path: id });
  }
  if (checks.length >= MAX_CHECKS) throw refuse(CODES.USAGE, `the contract already holds ${MAX_CHECKS} checks, which is the cap`, {});
  const problem = argvRefusal([...input.argv]);
  if (problem !== null) throw refuse(CODES.USAGE, `refused that command: argv ${problem}`, {});
  return withChecks(contract, [...checks, {
    id,
    argv: [...input.argv].map(String),
    status: 'PROPOSED',
    basis: `added by the human on ${input.now}`,
    mandatory: false,
    approval: null,
  }]);
}

/** A check that RAN HERE AND PASSED. The only route to VERIFIED, and it is evidence, not consent.
 * @param {unknown} contract @param {string} id @param {string} now @returns {Record<string, unknown>} */
export function markVerified(contract, id, now) {
  return mapOne(contract, id, (check) => ({
    ...check,
    status: 'VERIFIED',
    basis: sanitize(`ran and passed ${now} (argv: ${[...check.argv].join(' ')})`, MAX_BASIS),
  }));
}

/** Records an explicit human approval, and optionally makes the check MANDATORY. It never touches
 * `status`: approving a command to block your commits is not evidence that it passed.
 * @param {unknown} contract @param {string} id
 * @param {{ now: string, mandatory: boolean }} input @returns {Record<string, unknown>} */
export function approveCheck(contract, id, input) {
  return mapOne(contract, id, (check) => ({
    ...check,
    approval: { by: /** @type {'human'} */ ('human'), at: input.now },
    mandatory: input.mandatory ? true : check.mandatory === true,
  }));
}

/** Withdraws both. A revoked check stays in the file with its label and basis intact: what was
 * established is still established; it just no longer blocks anything.
 * @param {unknown} contract @param {string} id @returns {Record<string, unknown>} */
export function revokeCheck(contract, id) {
  return mapOne(contract, id, (check) => ({ ...check, mandatory: false, approval: null }));
}
