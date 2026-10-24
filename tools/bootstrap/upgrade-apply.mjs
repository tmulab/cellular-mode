// upgrade-apply.mjs — the execution half of `upgrade`: it performs a plan `upgrade-plan.mjs`
// decided and a human confirmed with `--confirm`, and it performs nothing the plan does not name.
//
// EVERY WRITE GOES THROUGH A DOOR THAT CHECKS FIRST. A replace goes through `replaceRecorded`,
// which re-hashes the file against the manifest's digest one statement before the rename, so a
// plan that has gone stale cannot overwrite somebody's work. An add goes through `writeNew`, which
// cannot overwrite at all (`wx`), so a path that appeared since the plan was made is a refusal and
// not a silent replacement.
//
// A FAILED STEP DOES NOT ABORT THE REST, exactly as in `uninstall.mjs`: each write is guarded on
// its own, a refusal is recorded against its path, and the exit status (2) says that something did
// not happen. Stopping halfway would leave the target in a state no record describes.
//
// THE RECORD IS REWRITTEN LAST, and it is written from what SUCCEEDED. A manifest claiming a
// digest for a file that was refused would be worse than no upgrade at all: `status` would then
// report drift the adopter never caused.
import { INSTALL_MANIFEST } from './plan-constants.mjs';
import { STATE_REL } from '../cellmode/paths.mjs';
import { assertInstallManifest } from './install-manifest.mjs';
import { upgradedManifest } from './upgrade-record.mjs';
import { addedMode, replaceRecorded } from './upgrade-write.mjs';
import { bytesIfPresent, sha256, writeNew } from './writer.mjs';

/** @typedef {import('./upgrade-plan.mjs').UpgradePlan} UpgradePlan */
/** @typedef {import('./upgrade-record.mjs').Written} Written */
/** @typedef {import('./upgrade-render.mjs').UpgradeOutcome} UpgradeOutcome */

/** @param {unknown} error @returns {string} */
const why = (error) => (error instanceof Error ? error.message : 'unknown failure');

/**
 * Performs the plan. Returns what happened; it never throws for a refused step, because a refusal
 * is an outcome this command exists to report.
 * @param {{ targetRoot: string, plan: UpgradePlan, manifest: Readonly<Record<string, unknown>>,
 *   readSource: (sourceRel: string) => Uint8Array, skeleton: Readonly<Record<string, string>>,
 *   source: import('./status.mjs').Identity,
 *   componentVersions: Readonly<Record<string, string>>, now: string }} input
 * @returns {UpgradeOutcome}
 */
export function applyUpgrade(input) {
  const { targetRoot, plan } = input;
  /** @type {string[]} */
  const replaced = [];
  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const skeleton = [];
  /** @type {{ path: string, reason: string }[]} */
  const failed = [];
  /** @type {Written[]} */
  const written = [];
  for (const change of plan.replace) {
    try {
      const record = replaceRecorded(targetRoot, change.path,
        input.readSource(String(change.source)), String(change.recorded));
      replaced.push(change.path);
      written.push({ path: change.path, sha256After: record.sha256After, mode: 'copy' });
    } catch (error) {
      failed.push({ path: change.path, reason: why(error) });
    }
  }
  for (const change of plan.add) {
    try {
      const record = writeNew(targetRoot, change.path, input.readSource(String(change.source)),
        addedMode(change.path));
      added.push(change.path);
      written.push({ path: change.path, sha256After: record.sha256After, mode: 'copy' });
    } catch (error) {
      failed.push({ path: change.path, reason: why(error) });
    }
  }
  for (const change of plan.skeleton) {
    const name = change.path.startsWith(`${STATE_REL}/`) ? change.path.slice(STATE_REL.length + 1) : change.path;
    const bytes = input.skeleton[name];
    if (bytes === undefined) {
      failed.push({ path: change.path, reason: 'the current source defines no such skeleton file any more' });
      continue;
    }
    try {
      const record = writeNew(targetRoot, change.path, bytes);
      skeleton.push(change.path);
      written.push({ path: change.path, sha256After: record.sha256After, mode: 'generate' });
    } catch (error) {
      failed.push({ path: change.path, reason: why(error) });
    }
  }
  return { replaced, added, skeleton, failed, manifest: rewriteManifest({ ...input, written }) };
}

/**
 * Rewrites the install record, through the same guarded door as any other replace: the manifest on
 * disk must still be the manifest this upgrade read. The amended document is validated BEFORE it
 * is written, so a record this tool could not read back never reaches the target.
 * @param {Parameters<typeof applyUpgrade>[0] & { written: ReadonlyArray<Written> }} input
 * @returns {string} one line saying what happened to the record
 */
export function rewriteManifest(input) {
  const present = bytesIfPresent(input.targetRoot, INSTALL_MANIFEST);
  if (present === null) return 'NOT rewritten: the install record is no longer there';
  try {
    const amended = assertInstallManifest(upgradedManifest({
      manifest: input.manifest, written: input.written, source: input.source,
      componentVersions: input.componentVersions, now: input.now,
    }));
    replaceRecorded(input.targetRoot, INSTALL_MANIFEST, `${JSON.stringify(amended, null, 2)}\n`,
      sha256(present));
    return `rewritten: source ${input.source.name} ${input.source.version}, this upgrade recorded as an approval`;
  } catch (error) {
    return `NOT rewritten: ${why(error)} — the previous record still stands, and \`status\` will report the difference`;
  }
}
