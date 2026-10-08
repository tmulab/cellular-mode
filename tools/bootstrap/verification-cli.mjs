// verification-cli.mjs — `bootstrap verification <target> <list|add|run|approve|mandatory|revoke>`.
// H6: the route from a fresh install to a green Article 8 that does NOT go through hand-edited
// internal JSON (trial findings A-11 / B-07 / B-08).
//
// NO CORE CLI DEPENDENCY. It reads and rewrites the target's `vault/verification.json` and never
// imports `tools/gates/**` (bootstrap/CONTRACTS.md). The validator stays the gate's; this file is
// held to it by `tests/verification-contract.test.mjs`, which asserts that whatever these edits
// write is a document `validateContract` accepts.
//
// THE CONSENT RULES ARE UNCHANGED. `--confirm` on every mutating subcommand, and without it the
// exact change is printed and the exit is 5. `mandatory` records `approval: { by: 'human', at }`
// when the check is not VERIFIED and NEVER writes VERIFIED: only `run`, on a check that actually
// passed here, may do that. `revoke` puts the contract back to failing closed.
//
// `--confirm` AND `--json` ARE RECOGNISED ANYWHERE ON THE LINE, including after the `--` that
// introduces a check's argv, because `add node-tests -- node --test --confirm` is what a human
// types. Everything else after `--` is the argv, verbatim, and no option parser ever sees it —
// which is the only way `--test` can be an argument rather than an option.
import { CODES, refuse } from './errors.mjs';
import { runCheck } from './exec.mjs';
import { requireExistingDirectory } from './new-flow.mjs';
import { VERIFICATION_FILE } from './plan-constants.mjs';
import { addCheck, approveCheck, checkById, revokeCheck } from './verification-edit.mjs';
import { INVOCATION, listJson, listLines, overallState } from './verification-report.mjs';
import { readTargetContract, runOneCheck, saveContract } from './verification-run.mjs';

export { readTargetContract, runOneCheck } from './verification-run.mjs';

/** @typedef {{ lines: string[], code: number, stdout?: boolean }} FlowResult */
/** @typedef {{ target: string | undefined, sub: string | undefined, rest: string[],
 *   argv: string[] | null, confirm: boolean, json: boolean }} VerificationArgs */

/** The subcommands, in the order the help lists them. */
export const SUBCOMMANDS = Object.freeze(['list', 'add', 'run', 'approve', 'mandatory', 'revoke']);

/** PURE. The tokens of a `verification` invocation. @param {ReadonlyArray<string>} tokens
 * @returns {VerificationArgs} */
export function parseVerificationArgs(tokens) {
  /** @type {string[]} */ const head = [];
  /** @type {string[] | null} */ let tail = null;
  let confirm = false;
  let json = false;
  for (const token of tokens) {
    if (token === '--confirm') { confirm = true; continue; }
    if (token === '--json') { json = true; continue; }
    if (tail === null && token === '--') { tail = []; continue; }
    (tail ?? head).push(token);
  }
  return { target: head[0], sub: head[1], rest: head.slice(2), argv: tail, confirm, json };
}

/** The exactly-one argument a subcommand takes. @param {VerificationArgs} args @returns {string} */
function idOf(args) {
  const id = args.rest[0];
  if (typeof id !== 'string' || id === '' || args.rest.length > 1) {
    throw refuse(CODES.USAGE, `${String(args.sub)} takes exactly one check id: verification <target> ${String(args.sub)} <id> --confirm`, {});
  }
  return id;
}

/** The preview a human sees without `--confirm`. @param {string[]} change @returns {FlowResult} */
const needsConfirm = (change) => ({
  lines: [...change, '',
    `Nothing was written. Re-run with --confirm. (${INVOCATION} list shows the whole contract.)`],
  code: 5,
});

/** @param {{ args: VerificationArgs, targetRoot: string, now: string,
 *   env?: NodeJS.ProcessEnv | undefined, runOne?: typeof runCheck | undefined }} ctx
 * @returns {FlowResult} */
function act(ctx) {
  const { args, targetRoot, now } = ctx;
  const contract = readTargetContract(targetRoot);
  if (args.sub === 'list') {
    return args.json
      ? { lines: [JSON.stringify(listJson(contract, VERIFICATION_FILE), null, 2)], code: 0, stdout: true }
      : { lines: listLines(contract, VERIFICATION_FILE), code: 0, stdout: true };
  }
  if (args.sub === 'add') {
    const id = idOf(args);
    const argv = args.argv ?? [];
    if (argv.length === 0) {
      throw refuse(CODES.USAGE, `add needs the command after a \`--\`: verification <target> add ${id} -- node --test --confirm`, {});
    }
    const next = addCheck(contract, { id, argv, now });
    const change = [`Would add to ${VERIFICATION_FILE}:`,
      `  ${id} [PROPOSED]  argv: ${argv.join(' ')}`,
      `  basis: added by the human on ${now} · mandatory: false · approval: none`,
      '  PROPOSED is the honest label: you have stated a command, and nothing has run it yet.'];
    if (!args.confirm) return needsConfirm(change);
    saveContract(targetRoot, next);
    return { lines: [`Added "${id}" to ${VERIFICATION_FILE} as PROPOSED: ${argv.join(' ')}`, '',
      `Run it: ${INVOCATION} run ${id} --confirm`], code: 0 };
  }
  if (args.sub === 'run') {
    const id = idOf(args);
    const check = checkById(contract, id);
    if (!args.confirm) {
      return needsConfirm([`Would run "${id}" ONCE in the target, with no shell: ${[...check.argv].join(' ')}`,
        `  If it exits 0, "${id}" becomes VERIFIED. If it does not, the contract is left exactly as it is.`]);
    }
    return runOneCheck({ targetRoot, contract, id, now,
      ...(ctx.env === undefined ? {} : { env: ctx.env }), ...(ctx.runOne === undefined ? {} : { runOne: ctx.runOne }) });
  }
  const id = idOf(args);
  const check = checkById(contract, id);
  if (args.sub === 'revoke') {
    const next = revokeCheck(contract, id);
    const change = [`Would revoke "${id}" in ${VERIFICATION_FILE}: mandatory → false, approval → null.`,
      `  Its label stays ${String(check.status)}: what was established stays established, it just stops blocking commits.`,
      `  After this: ${overallState(next)}`];
    if (!args.confirm) return needsConfirm(change);
    saveContract(targetRoot, next);
    return { lines: [`Revoked "${id}".`, overallState(next)], code: 0 };
  }
  const mandatory = args.sub === 'mandatory';
  const next = approveCheck(contract, id, { now, mandatory });
  const change = [`Would record in ${VERIFICATION_FILE} for "${id}":`,
    `  approval: { by: "human", at: "${now}" }${mandatory ? ' · mandatory: true' : ' · mandatory: unchanged'}`,
    `  status stays ${String(check.status)} — an approval is your decision, never evidence that it passed.`,
    `  After this: ${overallState(next)}`];
  if (!args.confirm) return needsConfirm(change);
  saveContract(targetRoot, next);
  return { lines: [`Recorded your approval of "${id}"${mandatory ? ' and made it MANDATORY' : ''}.`,
    `Its label is unchanged: ${String(check.status)}.`, overallState(next)], code: 0 };
}

/**
 * Runs the `verification` command. Returns lines, an exit code and the resolved root, like every
 * other flow; it never calls `process.exit`.
 * @param {ReadonlyArray<string>} tokens the arguments after `verification`
 * @param {{ now: string, env?: NodeJS.ProcessEnv | undefined,
 *   runOne?: typeof runCheck | undefined }} options
 * @returns {{ lines: string[], code: number, root: string, stdout?: boolean }}
 */
export function runVerification(tokens, options) {
  const args = parseVerificationArgs(tokens);
  if (typeof args.target !== 'string' || args.target === '') {
    return { lines: [`verification needs a target directory: node tools/bootstrap/cli.mjs verification <target-dir> <${SUBCOMMANDS.join('|')}>`], code: 1, root: '' };
  }
  if (typeof args.sub !== 'string' || !SUBCOMMANDS.includes(args.sub)) {
    return { lines: [`verification takes one of ${SUBCOMMANDS.join(', ')}`,
      `usage: node tools/bootstrap/cli.mjs verification <target-dir> <${SUBCOMMANDS.join('|')}> [<id>] [-- <argv…>] [--confirm] [--json]`], code: 1, root: '' };
  }
  const targetRoot = requireExistingDirectory(args.target);
  return { ...act({ args, targetRoot, now: options.now,
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.runOne === undefined ? {} : { runOne: options.runOne }) }), root: targetRoot };
}
