// apply-integrations.mjs — the four integrations an install performs or declines, in one place:
// the git hooks, the additive CI workflow, the verification contract, and the editor adapters.
//
// Split from `apply.mjs` for the 200-line rule and because the questions differ: `apply.mjs`
// answers "which files, in what order, under which gates", and this file answers "what did we do
// to the target's TOOLING, and what did we deliberately not do". Everything here is recorded in
// `vault/install-manifest.json`, applied or not, with the reason — a step that silently did not
// happen is the one failure mode a manifest exists to prevent.
//
// Only two of them can write anything: hooks (one local git config key, `integrate-hooks.mjs`)
// and CI (one new file, `integrate-ci.mjs`). Both need the approval id AND `--confirm`.
import { writeExtras } from './apply-extras.mjs';
import { proposeWorkflow } from './integrate-ci.mjs';
import { activateHooks } from './integrate-hooks.mjs';
import { VERIFICATION_COMPONENT, VERIFICATION_FILE } from './plan-constants.mjs';
import { mandatoryChecks } from './verification.mjs';

/** @typedef {import('./install-manifest.mjs').FileRecord} FileRecord */
/** @typedef {{ kind: string, status: string, detail: string }} IntegrationRecord */
/** @typedef {{ records: ReadonlyArray<IntegrationRecord>, files: ReadonlyArray<FileRecord>,
 *   limitations: ReadonlyArray<string> }} IntegrationResult */

/** PURE. What the generated contract did and did not establish, in the words the manifest keeps.
 * @param {Record<string, unknown> | undefined} contract @returns {string} */
export function contractDetail(contract) {
  if (contract === undefined) {
    return `${VERIFICATION_FILE} was generated from the template: this flow discovered no commands, so it holds no check. Final verification FAILS CLOSED until a human approves one.`;
  }
  const checks = /** @type {ReadonlyArray<{ status: string, mandatory: boolean }>} */ (contract.checks ?? []);
  const mandatory = checks.filter((check) => check.mandatory).length;
  const verified = checks.filter((check) => check.status === 'VERIFIED').length;
  return `${VERIFICATION_FILE}: ${checks.length} check(s), ${verified} VERIFIED by an approved baseline run, ${mandatory} mandatory${mandatory === 0 ? '. Final verification FAILS CLOSED until a human approves one (--mandatory <id> --confirm)' : ' by explicit human approval'}.`;
}

/**
 * Performs what is approved, proposes the rest, and records all of it. The CI file is the only
 * thing written here; it goes through `writeExtras`, so it is confined and recorded like any
 * other file.
 * @param {{ plan: import('./plan.mjs').Plan, targetRoot: string, chosen: ReadonlySet<string>,
 *   approvals: ReadonlySet<string>, confirm?: boolean | undefined,
 *   host: { ci: ReadonlyArray<string>, hooks: string }, projectName: string,
 *   contract?: Record<string, unknown> | undefined,
 *   readTemplate: (rel: string) => string,
 *   cell: import('./compose-builder.mjs').CellOutcome,
 *   env?: NodeJS.ProcessEnv | undefined,
 *   hooks?: typeof activateHooks | undefined, ci?: typeof proposeWorkflow | undefined }} input
 * @returns {IntegrationResult}
 */
export function runIntegrations(input) {
  const { chosen, approvals, targetRoot } = input;
  const hooks = (input.hooks ?? activateHooks)({
    targetRoot, machinery: input.host.hooks, chosen, approvals, confirm: input.confirm === true,
    env: input.env,
  });
  const ci = (input.ci ?? proposeWorkflow)({
    targetRoot, chosen, approvals, confirm: input.confirm === true,
    mandatory: mandatoryChecks(input.contract), projectName: input.projectName,
    providers: input.host.ci, readTemplate: input.readTemplate,
  });
  /** @type {IntegrationRecord[]} */
  const records = [
    { kind: 'hooks', status: hooks.status, detail: hooks.detail },
    { kind: 'ci', status: ci.status, detail: ci.detail },
    chosen.has(VERIFICATION_COMPONENT)
      ? { kind: 'verification', status: 'applied', detail: contractDetail(input.contract) }
      : { kind: 'verification', status: 'skipped', detail: `${VERIFICATION_COMPONENT} is not selected` },
  ];
  // The adapters are the planner's own rows: they are file writes, already done by the time this
  // runs, so they are reported from the plan rather than re-decided here.
  for (const entry of input.plan.integrations.filter((row) => row.kind === 'adapter')) {
    records.push({ kind: 'adapter', status: entry.status === 'skip' ? 'skipped' : 'applied', detail: entry.detail });
  }
  records.push({ kind: 'first-cell', status: input.cell.status === 'planned' ? 'applied' : 'proposed',
    detail: input.cell.detail });
  return {
    records: Object.freeze(records),
    files: Object.freeze(writeExtras(targetRoot, ci.files)),
    limitations: Object.freeze([...hooks.limitations, ...ci.limitations]),
  };
}
