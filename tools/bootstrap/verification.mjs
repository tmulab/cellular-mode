// verification.mjs — the target's own `vault/verification.json`, GENERATED from what adoption
// actually established about that project. PURE: it takes the discovered commands, the baseline
// results and a clock, and returns a document. It validates nothing — the ONE validator of this
// schema is `tools/gates/verification-contract.mjs`, which Bootstrap may not import (it copies
// the gates as data), and a second validator here would be a second opinion about what Article 8
// accepts. `tests/verification-contract.test.mjs` closes that loop: it imports BOTH and asserts
// every contract this module builds is one the gate accepts.
//
// THE LABEL IS THE POINT.
//   INFERRED — a `package.json` script or a build marker says this is how the project checks
//     itself. Nobody ran it. It is never mandatory by default.
//   VERIFIED — it RAN, under the approved `baseline-checks`, in this target, and it PASSED. The
//     basis names the run. Runnability and a pre-existing outcome are established; correctness
//     is not, and never will be by a tool.
//   `mandatory: true` needs VERIFIED or an explicit human approval (`--mandatory`, which also
//     needs `--confirm`). Bootstrap never proposes one on its own: a check that can block a
//     commit is the human's decision about their own project.
//
// ONLY ARGV ARRAYS BOOTSTRAP ITSELF AUTHORED BECOME CHECKS. `commands.mjs` builds most of them
// from its own closed tables (`npm test`, `cargo build`, `make lint`, …); the ones whose id
// carries `CI_ID_PREFIX` were PARSED out of somebody's workflow file. Parsed text may be a
// shell wrapper the gate will refuse, and one refused check invalidates the whole contract — so
// those lines are recorded as NOTES for a human to approve by hand instead of being written in
// as checks. Nothing is silently dropped; the file says what was left out and why.
import { CI_ID_PREFIX } from './commands.mjs';
import { CODES, refuse } from './errors.mjs';
import { sanitize } from './display.mjs';
import { safeValue } from './templates.mjs';

/** @typedef {import('./commands.mjs').DiscoveredCommand} DiscoveredCommand */
/** @typedef {{ id: string, status: string }} BaselineOutcome */
/** @typedef {{ id: string, argv: ReadonlyArray<string>, status: string, basis: string,
 *   mandatory: boolean, approval: { by: 'human', at: string } | null }} ContractCheck */

/** The schema this module writes. Declared here as the literal the gate validator requires; the
 * cross-module test asserts the two agree. */
export const CONTRACT_SCHEMA = 'cellular-mode/verification';
export const CONTRACT_VERSION = 1;

/** How long a basis may be. The gate caps it at 200; this stays under it. */
const MAX_BASIS = 160;

/** The guidance every generated contract carries. A target's agent reads this file. */
export const CONTRACT_NOTES = Object.freeze([
  'This is the mandatory suite of `node tools/gates/verify-final.mjs` (Article 8). An EMPTY checks list means final verification FAILS CLOSED until a human approves at least one check.',
  'A check is { id, argv, status, basis, mandatory, approval }. argv is an argument array, never a shell string: it runs with shell: false, so a `;` or a `&&` in it is text and nothing interprets it.',
  'status is VERIFIED (it ran here and passed) | INFERRED (a manifest says so; nobody ran it) | PROPOSED | UNKNOWN.',
  'mandatory: true is valid only for a VERIFIED check, or one carrying an explicit human approval. Use the CLI rather than editing this file: `node tools/bootstrap/cli.mjs verification <target> list` explains every check, then add / run / mandatory / revoke (each needs --confirm).',
  '`cell-state` (node tools/cellmode/cli.mjs check) is added by verify-final itself and is not listed here: a project cannot approve its way out of the method\'s own integrity.',
]);

/** PURE. True when this discovered command's argv was PARSED from a CI file rather than authored
 * by Bootstrap's own tables. @param {{ id: string }} command @returns {boolean} */
export const isParsed = (command) => String(command.id).startsWith(CI_ID_PREFIX);

/** PURE. The commands eligible to become checks, in discovery order.
 * @param {ReadonlyArray<DiscoveredCommand>} commands @returns {ReadonlyArray<DiscoveredCommand>} */
export function authoredCommands(commands) {
  return Object.freeze(commands.filter((command) => !isParsed(command)));
}

/** PURE. The `--mandatory` ids that name no eligible check, so a typo is a refusal rather than
 * consent withheld. @param {ReadonlyArray<string>} ids
 * @param {ReadonlyArray<DiscoveredCommand>} commands @returns {ReadonlyArray<string>} */
export function unknownMandatory(ids, commands) {
  const known = new Set(authoredCommands(commands).map((command) => command.id));
  return Object.freeze([...new Set(ids)].filter((id) => !known.has(id)));
}

/**
 * PURE. One check, with the label its evidence earned and not a word more.
 * @param {DiscoveredCommand} command @param {ReadonlyArray<BaselineOutcome>} results
 * @param {ReadonlySet<string>} mandatory @param {string} now @returns {ContractCheck}
 */
export function checkFor(command, results, mandatory, now) {
  const passed = results.some((entry) => entry.id === command.id && entry.status === 'passed');
  const wanted = mandatory.has(command.id);
  return {
    id: command.id,
    argv: [...command.argv].map(String),
    status: passed ? 'VERIFIED' : 'INFERRED',
    basis: passed
      ? `ran and passed in this target under the approved baseline (baseline run ${now})`
      : sanitize(`inferred from ${command.basis}; nobody ran it`, MAX_BASIS),
    mandatory: wanted,
    // An approval is recorded whenever the human asked for mandatory, INCLUDING on a VERIFIED
    // check: "it passed once" and "it may block my commits" are two different consents.
    approval: wanted ? { by: /** @type {'human'} */ ('human'), at: now } : null,
  };
}

/**
 * PURE. The contract for one adoption. `commands` is `discoverCommands(...).commands`; `results`
 * is `runBaselineChecks(...).results` (empty when nothing was approved to run).
 * @param {{ projectName: string, commands?: ReadonlyArray<DiscoveredCommand> | undefined,
 *   results?: ReadonlyArray<BaselineOutcome> | undefined,
 *   mandatory?: ReadonlySet<string> | undefined, now: string }} input
 * @returns {Record<string, unknown>}
 */
export function buildContract(input) {
  const commands = input.commands ?? [];
  const mandatory = input.mandatory ?? new Set();
  const eligible = authoredCommands(commands);
  const left = commands.filter(isParsed);
  return {
    schema: CONTRACT_SCHEMA,
    version: CONTRACT_VERSION,
    project: safeValue(input.projectName),
    checks: eligible.map((command) => checkFor(command, input.results ?? [], mandatory, input.now)),
    notes: [
      ...CONTRACT_NOTES,
      ...left.map((command) => `not written as a check: \`${sanitize(command.argv.join(' '), 120)}\` was parsed out of ${sanitize(command.basis, 60)}, not authored by Bootstrap. Add it yourself once you have run it.`),
    ],
  };
}

/** PURE. The MANDATORY checks of a generated contract, for the CI workflow that mirrors them.
 * The authoritative reading of "mandatory" is the gate's `mandatorySuite`; this is the same
 * filter over a document THIS module just built, which is why it may stay local.
 * @param {Record<string, unknown> | undefined} contract
 * @returns {ReadonlyArray<{ id: string, argv: ReadonlyArray<string> }>} */
export function mandatoryChecks(contract) {
  const checks = /** @type {ReadonlyArray<ContractCheck>} */ (contract?.checks ?? []);
  return Object.freeze(checks
    .filter((check) => check.mandatory === true
      && (check.status === 'VERIFIED' || check.approval !== null))
    .map((check) => Object.freeze({ id: check.id, argv: Object.freeze([...check.argv]) })));
}

/**
 * The contract for a flow, with `--mandatory` checked against what was actually discovered. An
 * id nobody discovered is a USAGE refusal and not a silent no-op: a typo there would otherwise
 * read as consent withheld and look exactly like consent given to nothing (the same rule
 * `approvals.parseApprovals` applies to `--approve`).
 * @param {{ projectName: string, commands?: ReadonlyArray<DiscoveredCommand> | undefined,
 *   results?: ReadonlyArray<BaselineOutcome> | undefined,
 *   mandatory?: ReadonlyArray<string> | undefined, now: string }} input
 * @returns {{ contract: Record<string, unknown>, mandatory: ReadonlyArray<string> }}
 */
export function contractFor(input) {
  const asked = [...new Set(input.mandatory ?? [])];
  const commands = input.commands ?? [];
  const unknown = unknownMandatory(asked, commands);
  if (unknown.length > 0) {
    const known = authoredCommands(commands).map((command) => command.id);
    throw refuse(CODES.USAGE,
      `--mandatory names ${unknown.join(', ')}, which this install did not discover as a runnable check${known.length === 0 ? ' (it discovered none at all)' : `; the ids are ${known.join(', ')}`}`,
      { unknown, known });
  }
  return {
    contract: buildContract({ ...input, mandatory: new Set(asked) }),
    mandatory: Object.freeze(asked),
  };
}

/** PURE. The bytes of a contract, formatted as the rest of the vault is.
 * @param {Record<string, unknown>} contract @returns {string} */
export function contractBytes(contract) {
  return `${JSON.stringify(contract, null, 2)}\n`;
}

/** PURE. The lines a flow prints about the contract it just wrote — including, when nothing is
 * mandatory, the one sentence a human has to act on.
 * @param {Record<string, unknown>} contract @param {string} rel @returns {ReadonlyArray<string>} */
export function contractLines(contract, rel) {
  const checks = /** @type {ReadonlyArray<ContractCheck>} */ (contract.checks ?? []);
  const mandatory = checks.filter((check) => check.mandatory);
  /** @type {string[]} */
  const out = [`Verification contract: ${rel} — ${checks.length} check(s), ${mandatory.length} mandatory.`];
  for (const check of checks) {
    out.push(`  - ${check.id} [${check.status}]${check.mandatory ? ' MANDATORY' : ''}: ${check.argv.join(' ')}`);
  }
  if (mandatory.length === 0) {
    out.push('  NEXT STEP, and nothing works without it: `node tools/gates/verify-final.mjs` FAILS CLOSED');
    out.push('  while no check is mandatory. One route, and it works on an installed target:');
    out.push('  node tools/bootstrap/cli.mjs verification <dir> list — it names, per check, why it');
    out.push('  cannot block yet and the exact next command: add <id> --confirm -- <argv…>, then');
    out.push('  run <id> --confirm, then mandatory <id> --confirm. You never hand-edit this file (H6),');
    out.push('  and Bootstrap will not invent a command for you.');
  }
  return Object.freeze(out);
}
