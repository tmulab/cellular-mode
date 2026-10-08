// uninstall-render.mjs — the plan and the outcome, as lines a human reads before and after. PURE
// except for the reverse patches, which are read from the target because the point of a reverse patch
// is the text that is THERE, not the text we expected.
//
// A REVERSE PATCH IS THE ALTERNATIVE TO GUESSING. When a managed block was edited, Bootstrap will
// not remove it — so it prints exactly what it would have removed, sanitized line by line and marked
// with `-`, and the human decides. Sanitizing matters: the block lives in a file somebody else edits,
// and a line of it could otherwise forge a line of this report.
import { capList, plural, sanitize } from './display.mjs';
import { INSTALL_MANIFEST } from './plan-constants.mjs';
import { PATH_CAP } from './status.mjs';
import { ACTIONS } from './uninstall-plan.mjs';
import { currentBlock } from './uninstall.mjs';

/** @typedef {import('./uninstall-plan.mjs').UninstallPlan} UninstallPlan */
/** @typedef {import('./uninstall.mjs').UninstallOutcome} UninstallOutcome */

/** How many lines of one reverse patch are shown. A managed block is a dozen lines; a file that
 * needs more than this is one a human should open rather than read here. */
export const PATCH_CAP = 24;

/** One action group. `cap` of `-1` prints every step: a destructive plan a human is about to
 * `--confirm` must be reviewable IN FULL (trial finding B-12, where `--verbose` hid 44 of 52
 * deletions), and the capped default now says how to see the rest instead of only counting it.
 * @param {ReadonlyArray<import('./uninstall-plan.mjs').Step>} steps @param {string} action
 * @param {number} cap @returns {string[]} */
function group(steps, action, cap) {
  const mine = steps.filter((step) => step.action === action);
  if (mine.length === 0) return [];
  const { shown, hidden } = capList(mine, cap);
  return [`  ${action.padEnd(15)} ${String(mine.length).padStart(3)}`,
    ...shown.map((step) => `      ${sanitize(step.path)} — ${sanitize(step.reason, 200)}`),
    ...(hidden === 0 ? [] : [`      … and ${hidden} more — re-run with --verbose to list every one`])];
}

/** The reverse patch for every block the plan refuses to remove. @param {string} targetRoot
 * @param {UninstallPlan} plan @returns {string[]} */
export function patchLines(targetRoot, plan) {
  /** @type {string[]} */
  const out = [];
  for (const step of plan.kept.filter((entry) => entry.component !== null)) {
    const text = currentBlock(targetRoot, step.path, String(step.component));
    if (text === null) continue;
    const lines = text.split('\n').filter((line) => line !== '');
    const { shown, hidden } = capList(lines, PATCH_CAP);
    out.push('', `Reverse patch — ${sanitize(step.path)}: remove these lines yourself if you want the block gone.`,
      ...shown.map((line) => `  - ${sanitize(line, 200)}`),
      ...(hidden === 0 ? [] : [`  - … and ${hidden} more line(s)`]));
  }
  return out;
}

/**
 * The plan, for `--dry-run` and for the refusal that asks for `--confirm`.
 * @param {{ targetRoot: string, plan: UninstallPlan, name: string,
 *   verbose?: boolean | undefined }} input @returns {string[]}
 */
export function planLines(input) {
  const { plan } = input;
  const cap = input.verbose === true ? -1 : PATH_CAP;
  return [
    `Target: ${sanitize(input.name)}`,
    `Uninstall plan — ${plural(plan.steps.length, 'recorded path')}. Nothing outside the install record is ever touched.`,
    ...ACTIONS.flatMap((action) => group(plan.steps, action, cap)),
    `  hooks           ${plan.hooks.action.padEnd(5)} ${sanitize(plan.hooks.reason, 200)}`,
    `  directories     ${String(plan.dirs.length).padStart(3)}  candidates, each removed only if it is empty by then`,
    `  ${INSTALL_MANIFEST}: ${plan.manifest.action} — ${sanitize(plan.manifest.reason, 240)}`,
    ...(plan.forced.length === 0 ? [] : ['', `--force-modified names ${plural(plan.forced.length, 'path')} for deletion DESPITE local changes:`,
      ...plan.forced.map((rel) => `  ! ${sanitize(rel)}`)]),
    ...patchLines(input.targetRoot, plan),
  ];
}

/** The deletions that happened DESPITE local changes. Printed on its own, because this is the one
 * thing an uninstall does that a human cannot undo from the record: `--force-modified` with
 * `--confirm`, named path by path. @param {UninstallPlan} plan @param {UninstallOutcome} outcome
 * @returns {string[]} */
function forcedLines(plan, outcome) {
  const gone = plan.forced.filter((rel) => outcome.removed.includes(rel));
  if (gone.length === 0) return [];
  return [`Deleted DESPITE local changes, removed on explicit human instruction (--force-modified with --confirm):`,
    ...gone.map((rel) => `  ! ${sanitize(rel)} — recorded here and in the uninstall report, if one was written`)];
}

/** What actually happened. @param {{ outcome: UninstallOutcome, plan: UninstallPlan,
 *   name: string }} input @returns {string[]} */
export function outcomeLines(input) {
  const { outcome, plan } = input;
  const keptLines = plan.kept.length === 0 ? [] : [`Kept (${plan.kept.length}), each with its reason:`,
    ...capList(plan.kept, PATH_CAP).shown.map((step) => `  - ${sanitize(step.path)} — ${sanitize(step.reason, 200)}`),
    ...(plan.kept.length > PATH_CAP ? [`  … and ${plan.kept.length - PATH_CAP} more`] : [])];
  return [
    `Uninstalled Cellular Mode from ${sanitize(input.name)}.`,
    '',
    `Removed: ${plural(outcome.removed.length, 'file')} · restored: ${plural(outcome.restored.length, 'file')}`
      + ` · directories removed: ${outcome.dirs.length} (empty only)`,
    ...outcome.restored.map((line) => `  ~ ${sanitize(line, 240)}`),
    ...forcedLines(plan, outcome),
    `Hooks: ${sanitize(outcome.hooks, 240)}`,
    `${INSTALL_MANIFEST}: ${sanitize(outcome.manifest, 240)}`,
    ...keptLines,
    ...(outcome.failed.length === 0 ? [] : [`REFUSED (${outcome.failed.length}) — nothing was deleted for these:`,
      ...outcome.failed.map((entry) => `  ! ${sanitize(entry.path)} — ${sanitize(entry.reason, 240)}`)]),
    ...(outcome.report === null ? [] : ['', `What remains is listed in ${sanitize(outcome.report)} (scratch, git-ignored while the method's .gitignore block is in place).`]),
    '',
    'Git history was not touched, and no file outside the install record was deleted.',
  ];
}
