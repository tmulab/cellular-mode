// apply.mjs — the only module that turns a plan into files. Everything it writes goes through
// `writer.mjs`; everything it decides was already decided and shown by `plan.mjs`.
//
// FOUR GATES, IN THIS ORDER, before a single byte is written.
//   1. CONFLICT — a plan with conflicts does not apply. A conflict means "an existing file stands
//      where something would go and we cannot prove it is safe", and the human resolves that, not
//      us. Exit 2.
//   2. NEEDS_CONFIRMATION — `confirm` must be literally `true`. Exit 5.
//   3. OVERLAP — the target may not be, contain, or sit inside the source.
//   4. PER-ACTION APPROVAL — every consequential action consults its approval id. Missing approval
//      means the action is RECORDED AS PROPOSED and skipped. It never silently happens, and it
//      never silently vanishes either.
//
// THE MANIFEST IS WRITTEN LAST, and only if every other write succeeded. That ordering is the whole
// recovery story: a target with `vault/install-manifest.json` is an install that completed, and a
// target without one is either untouched or a PARTIAL install whose created files this function
// names in its refusal. Nothing is deleted automatically here — a half-finished install that
// deletes files on its way out is a tool that can lose somebody's work. Cell 6's `uninstall` reads
// that list.
//
// THE INTEGRATIONS LIVE NEXT DOOR. `apply-integrations.mjs` performs or declines the hooks, the
// additive CI workflow, the verification contract and the adapters, and records every one of them
// with its reason. Each writing step needs its approval id AND `--confirm`; this file's only job
// there is to run it after every component file exists and before the manifest is written.
import { basename } from 'node:path';
import { applyAction } from './apply-action.mjs';
import { refreshState, writeExtras } from './apply-extras.mjs';
import { runIntegrations } from './apply-integrations.mjs';
import { CODES, refuse } from './errors.mjs';
import { assertInstallManifest, buildInstallManifest } from './install-manifest.mjs';
import { INSTALL_MANIFEST } from './plan-constants.mjs';
import { installFirstCell } from './compose-builder.mjs';
import { contractBytes } from './verification.mjs';
import { assertNoOverlap, writeNew } from './writer.mjs';

/** @typedef {import('./plan.mjs').Plan} Plan */
/** @typedef {import('./plan-actions.mjs').Action} Action */
/** @typedef {import('./install-manifest.mjs').FileRecord} FileRecord */
/** @typedef {{ kind: string, status: string, detail: string }} IntegrationRecord */
/** @typedef {{ manifest: Record<string, unknown>, files: ReadonlyArray<FileRecord>,
 *   integrations: ReadonlyArray<IntegrationRecord>, limitations: ReadonlyArray<string>,
 *   cell: import('./compose-builder.mjs').CellOutcome }} ApplyResult */

/** A failure part-way through, carrying the list of files that DO exist. No automatic deletion: a
 * half-finished install that deletes on its way out is a tool that can lose somebody's work, and
 * Cell 6's `uninstall` reads this list instead.
 * @param {unknown} error @param {ReadonlyArray<FileRecord>} files @returns {Error} */
function partial(error, files) {
  const message = error instanceof Error ? error.message : 'unknown failure';
  return refuse(CODES.BAD_PLAN, `partial install, nothing was rolled back: ${message}`, {
    created: files.map((file) => file.path),
    partial: true,
  });
}

/** The first cell, the manifest, and the manifest's own write — the steps AFTER every component
 * file exists. Separate so that both it and the copy loop report a partial install the same way.
 * @param {Parameters<typeof applyPlan>[0] & { files: FileRecord[], limitations: string[] }} input
 * @returns {{ manifest: Record<string, unknown>, record: FileRecord,
 *   cell: import('./compose-builder.mjs').CellOutcome }} */
function finish(input) {
  const { plan, targetRoot, approvals, files, limitations } = input;
  const cell = (input.firstCell ?? installFirstCell)({
    targetRoot, sourceRoot: input.sourceRoot, approvals, confirm: true, env: input.env,
  });
  const integrations = runIntegrations({
    plan, targetRoot, approvals, confirm: true, cell, env: input.env,
    chosen: new Set(plan.components.map((entry) => entry.id)),
    host: input.host, projectName: input.projectName, readTemplate: input.readTemplate,
    ...(input.contract === undefined ? {} : { contract: input.contract }),
  });
  files.push(...integrations.files);
  limitations.push(...integrations.limitations);
  refreshState(targetRoot, files);
  const manifest = buildInstallManifest({
    plan,
    results: files,
    source: input.source,
    targetName: basename(targetRoot),
    approvals: [
      ...plan.approvals.filter((entry) => approvals.has(entry.id))
        .map((entry) => ({ action: entry.action, at: input.now })),
      ...[...(input.mandatory ?? [])].map((id) => ({
        action: `make the verification check "${id}" mandatory for final verification`, at: input.now,
      })),
    ],
    integrations: integrations.records,
    host: input.host,
    componentVersions: input.componentVersions,
    limitations,
    now: input.now,
  });
  assertInstallManifest(manifest);
  const record = writeNew(targetRoot, INSTALL_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, record: { ...record, mode: 'generate' }, cell };
}

/**
 * Applies a plan to a target. Writes the install manifest last; on any failure part-way it throws
 * a refusal whose `details.created` names every file that does exist.
 * @param {{ sourceRoot: string, targetRoot: string, plan: Plan, approvals: ReadonlySet<string>,
 *   confirm?: boolean | undefined, now: string, readSource: (rel: string) => Buffer,
 *   readTemplate: (rel: string) => string, componentVersions: Readonly<Record<string, string>>,
 *   source: { name: string, version: string, revision: string | null },
 *   host: { languages: ReadonlyArray<string>, buildSystems: ReadonlyArray<string>,
 *     ci: ReadonlyArray<string>, hooks: string },
 *   projectName: string, limitations?: ReadonlyArray<string> | undefined,
 *   contract?: Record<string, unknown> | undefined,
 *   mandatory?: ReadonlyArray<string> | undefined,
 *   extras?: ReadonlyArray<import('./apply-extras.mjs').Extra> | undefined,
 *   env?: NodeJS.ProcessEnv | undefined,
 *   firstCell?: typeof installFirstCell | undefined }} input
 * @returns {ApplyResult}
 */
export function applyPlan(input) {
  const { plan, targetRoot, approvals } = input;
  if (plan.conflicts.length > 0) {
    throw refuse(CODES.CONFLICT,
      `${plan.conflicts.length} conflict(s) must be resolved by a human before anything is installed`,
      { conflicts: plan.conflicts.map((entry) => `${entry.path}: ${entry.reason}`) });
  }
  if (input.confirm !== true) {
    throw refuse(CODES.NEEDS_CONFIRMATION, 'installing writes files: re-run with --confirm', {});
  }
  assertNoOverlap(input.sourceRoot, targetRoot);
  const chosen = new Set(plan.components.map((entry) => entry.id));
  /** @type {FileRecord[]} */
  const files = [];
  /** @type {string[]} */
  const limitations = [...(input.limitations ?? [])];
  const ctx = {
    targetRoot,
    readSource: input.readSource,
    approvals,
    generate: { read: input.readTemplate, projectName: input.projectName, chosen,
      contract: input.contract === undefined ? null : contractBytes(input.contract) },
  };
  try {
    for (const action of plan.actions) {
      if (action.template === 'install-manifest') continue;
      const done = applyAction(action, ctx);
      files.push(...done.files);
      if (done.proposed !== null) limitations.push(done.proposed);
    }
    // Flow-contributed files (the adoption baseline of an existing project) are written here, after
    // every planned file and before the manifest, so the manifest records them like any other.
    files.push(...writeExtras(targetRoot, input.extras ?? []));
  } catch (error) {
    throw partial(error, files);
  }
  /** @type {{ manifest: Record<string, unknown>, record: FileRecord,
   *   cell: import('./compose-builder.mjs').CellOutcome }} */
  let done;
  try {
    done = finish({ ...input, files, limitations });
  } catch (error) {
    throw partial(error, files);
  }
  const { manifest, record, cell } = done;
  return {
    manifest,
    files: Object.freeze([...files, record]),
    integrations: Object.freeze(/** @type {IntegrationRecord[]} */ (manifest.integrations)),
    limitations: Object.freeze(limitations),
    cell,
  };
}
