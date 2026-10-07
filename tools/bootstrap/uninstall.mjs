// uninstall.mjs — the execution half: it performs a plan `uninstall-plan.mjs` already decided and
// a human already confirmed, and it performs nothing the plan does not name.
//
// EVERY DELETION GOES THROUGH `writer.mjs`. `removeOwned` re-reads and re-hashes the file one
// statement before the unlink and refuses on any mismatch, so a plan that has gone stale cannot
// delete somebody's work; `removeBlock` removes one byte-intact managed block and restores the file
// to the bytes the manifest recorded; `removeEmptyDir` removes a directory only when it is empty.
// Nothing here calls `rmSync`, nothing is recursive, and nothing outside the manifest is ever
// deleted — the extra files `status` lists are read about and left exactly where they are.
//
// ORDER IS THE RECOVERY STORY. Blocks are restored first, then files are deleted, then the hook
// configuration, then the install manifest — LAST of the owned files, and only when nothing it owns
// was kept — and only then the empty directories, deepest-first, because `vault/` cannot be empty
// while the record still sits in it. A target that still has `vault/install-manifest.json` is a
// target whose record is still true; one without it is a target Bootstrap has fully left.
//
// A FAILED STEP DOES NOT ABORT THE REST. Each removal is independently guarded by its own re-hash,
// so a refusal on one path is recorded and the others proceed. Stopping halfway would leave more
// behind, not less, and the exit status (2) still says that something did not happen.
import { CODES, refuse } from './errors.mjs';
import { run } from './exec.mjs';
import { HOOKS_DIR, INSTALL_MANIFEST, SCRATCH_DIR } from './plan-constants.mjs';
import { sanitize } from './display.mjs';
import { blockSpan, bytesIfPresent, readIfPresent, removeBlock, removeEmptyDir, removeOwned, sha256, writeNew } from './writer.mjs';

/** @typedef {import('./uninstall-plan.mjs').Step} Step */
/** @typedef {import('./uninstall-plan.mjs').UninstallPlan} UninstallPlan */
/** @typedef {{ removed: ReadonlyArray<string>, restored: ReadonlyArray<string>,
 *   failed: ReadonlyArray<{ path: string, reason: string }>, dirs: ReadonlyArray<string>,
 *   hooks: string, manifest: string, report: string | null }} UninstallOutcome */

/** The argv that undoes exactly what `integrate-hooks.mjs` did, and nothing more. */
export const UNSET_ARGV = Object.freeze(['git', 'config', '--unset', 'core.hooksPath']);

/** Where the report of what REMAINS is written when the manifest is kept. Git-ignored scratch, so
 * it is not somebody's history and not part of the install record. */
export const REPORT_REL = `${SCRATCH_DIR}uninstall-report.json`;

/** How many numbered report files may exist before Bootstrap stops writing them. A previous report
 * is never overwritten — `writeNew` could not anyway — because it is evidence of a previous run. */
export const MAX_REPORTS = 50;

/** The text of a managed block as it stands in the target right now: the reverse patch a human needs
 * in order to remove by hand what Bootstrap refused to remove for them.
 * @param {string} targetRoot @param {string} rel @param {string} component @returns {string | null} */
export function currentBlock(targetRoot, rel, component) {
  const text = readIfPresent(targetRoot, rel);
  if (text === null) return null;
  const span = blockSpan(text, component);
  return 'problem' in span ? null : span.text;
}

/** The first free report path, so that a second uninstall never overwrites the first one's evidence.
 * @param {string} targetRoot @returns {string} */
export function freeReportPath(targetRoot) {
  for (let i = 1; i <= MAX_REPORTS; i += 1) {
    const rel = i === 1 ? REPORT_REL : REPORT_REL.replace(/\.json$/, `-${i}.json`);
    if (bytesIfPresent(targetRoot, rel) === null) return rel;
  }
  throw refuse(CODES.CONFLICT, `${SCRATCH_DIR} already holds ${MAX_REPORTS} uninstall reports: move them away first`, {});
}

/** PURE. The document that says what remains, for the human and for the next run.
 * @param {{ plan: UninstallPlan, outcome: Omit<UninstallOutcome, 'report'>, targetName: string,
 *   now: string }} input @returns {Record<string, unknown>} */
export function uninstallReport(input) {
  return {
    schema: 'cellular-mode/uninstall-report',
    version: 1,
    at: input.now,
    target: { name: sanitize(input.targetName, 64) },
    removed: input.outcome.removed.length,
    restored: [...input.outcome.restored],
    kept: input.plan.kept.map((step) => ({ path: step.path, action: step.action, reason: sanitize(step.reason, 300) })),
    forced: [...input.plan.forced],
    failed: input.outcome.failed.map((entry) => ({ path: entry.path, reason: sanitize(entry.reason, 300) })),
    hooks: input.plan.hooks.action,
    note: `${INSTALL_MANIFEST} was kept: the install record is never rewritten, so what remains is described here instead.`,
  };
}

/** @param {unknown} error @returns {string} */
const why = (error) => (error instanceof Error ? error.message : 'unknown failure');

/**
 * Performs the plan. Returns what happened; it never throws for a refused step, because a refusal
 * is an outcome this command exists to report.
 * @param {{ targetRoot: string, plan: UninstallPlan, targetName: string, now: string,
 *   env?: NodeJS.ProcessEnv | undefined, exec?: typeof run | undefined }} input
 * @returns {UninstallOutcome}
 */
export function applyUninstall(input) {
  const { targetRoot, plan } = input;
  /** @type {string[]} */
  const removed = [];
  /** @type {string[]} */
  const restored = [];
  /** @type {{ path: string, reason: string }[]} */
  const failed = [];
  for (const step of plan.steps.filter((entry) => entry.action === 'remove-block')) {
    try {
      const result = removeBlock(targetRoot, step.path, String(step.component),
        { blockSha256: step.blockSha256, sha256Before: step.sha256 });
      restored.push(`${step.path}${result.restored ? '' : ' (block removed; the file was not restored byte-for-byte because it changed around the block)'}`);
    } catch (error) {
      failed.push({ path: step.path, reason: why(error) });
    }
  }
  for (const step of plan.steps.filter((entry) => entry.action === 'remove' || entry.action === 'remove-modified')) {
    try {
      removeOwned(targetRoot, step.path, String(step.sha256));
      removed.push(step.path);
    } catch (error) {
      failed.push({ path: step.path, reason: why(error) });
    }
  }
  const hooks = runHooks(input);
  // The manifest goes before the directory sweep and after every other deletion: it is the LAST
  // owned file to go, and `vault/` can only be empty once it has gone.
  const manifest = finishManifest({ ...input, removed, failed });
  /** @type {string[]} */
  const dirs = [];
  for (const dir of plan.dirs) {
    // A directory can be refused too — a junction standing where one of ours was is exactly the
    // case `confine` exists for — and a refusal there must not abort the rest of the sweep.
    try {
      if (removeEmptyDir(targetRoot, dir)) dirs.push(dir);
    } catch (error) {
      failed.push({ path: dir, reason: why(error) });
    }
  }
  const partial = { removed, restored, failed, dirs, hooks, manifest };
  let report = null;
  if (plan.manifest.action === 'keep') {
    report = freeReportPath(targetRoot);
    writeNew(targetRoot, report, `${JSON.stringify(uninstallReport({ plan, outcome: partial, targetName: input.targetName, now: input.now }), null, 2)}\n`);
  }
  return { ...partial, report };
}

/** Unsets `core.hooksPath`, but only when the plan said so — which it only says when the value is
 * still the one this install set. @param {Parameters<typeof applyUninstall>[0]} input
 * @returns {string} */
function runHooks(input) {
  if (input.plan.hooks.action !== 'unset') return `${input.plan.hooks.action}: ${input.plan.hooks.reason}`;
  const result = (input.exec ?? run)([...UNSET_ARGV], { cwd: input.targetRoot, env: input.env });
  return result.ok
    ? `unset: core.hooksPath no longer points at ${HOOKS_DIR}`
    : `NOT unset: \`${UNSET_ARGV.join(' ')}\` exited ${String(result.status)} — run it yourself in the target`;
}

/** The manifest, LAST: removed only when the plan says everything it owns is gone and no step
 * failed. Its own digest is taken from the file as it stands, and `removeOwned` re-hashes it again
 * before the unlink. @param {Parameters<typeof applyUninstall>[0]
 *   & { removed: string[], failed: { path: string, reason: string }[] }} input @returns {string} */
function finishManifest(input) {
  if (input.plan.manifest.action !== 'remove') return `kept: ${input.plan.manifest.reason}`;
  if (input.failed.length > 0) {
    return `kept: ${input.failed.length} step(s) were refused, so the record of this install stays until they are resolved`;
  }
  const bytes = bytesIfPresent(input.targetRoot, INSTALL_MANIFEST);
  if (bytes === null) return 'already gone';
  try {
    removeOwned(input.targetRoot, INSTALL_MANIFEST, sha256(bytes));
    input.removed.push(INSTALL_MANIFEST);
    return 'removed last, as the record of an install that is now fully removed';
  } catch (error) {
    input.failed.push({ path: INSTALL_MANIFEST, reason: why(error) });
    return `kept: ${why(error)}`;
  }
}
