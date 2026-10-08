// manage-flow.mjs — `bootstrap status <target>` and `bootstrap uninstall <target>`: the two commands
// that act on an installation that is already there. Both return lines and an exit code and never
// call `process.exit`, like every other flow in Bootstrap.
//
// `status` WRITES NOTHING. Not a cache, not a scratch file, and — because the one git probe runs with
// `GIT_OPTIONAL_LOCKS=0` — not even `.git/index`. The test hashes the whole target tree, `.git`
// included, before and after. No manifest at all is not a failure: it is "not installed", exit 0,
// with a pointer at `existing --analyze`, which is the command that reasons about a codebase.
//
// `uninstall` NEEDS TWO LOCKS, like every consequential step here: the plan is shown with `--dry-run`
// (writing nothing), and without `--confirm` the plan is printed and the exit is 5. `--force-modified`
// alone does nothing at all; it only has meaning together with `--confirm`, and then it is recorded.
//
// Exit codes follow `bootstrap/CONTRACTS.md`: status 0 when healthy, 2 on drift or a partial install;
// uninstall 0 when the plan was performed, 2 when a step was refused, 5 without `--confirm`.
import { basename } from 'node:path';
import { plural, sanitize } from './display.mjs';
import { INSTALL_MANIFEST } from './plan-constants.mjs';
import { requireExistingDirectory } from './new-flow.mjs';
import { classify } from './status.mjs';
import { statusLines } from './status-render.mjs';
import { readStatusFacts } from './status-read.mjs';
import { planUninstall } from './uninstall-plan.mjs';
import { applyUninstall } from './uninstall.mjs';
import { outcomeLines, patchLines, planLines } from './uninstall-render.mjs';

/** @typedef {{ lines: string[], code: number, stdout?: boolean }} FlowResult */

/** The answer when there is no install record at all. Exit 0: "not installed" is a fact, not a
 * failure. @param {string} name @returns {FlowResult} */
export function notInstalled(name) {
  return {
    lines: [`Target: ${sanitize(name)}`, '',
      `Not installed: there is no ${INSTALL_MANIFEST} here, so Bootstrap has nothing recorded about this directory.`,
      'To see what adopting the method would involve, without writing anything: existing <target> --analyze'],
    code: 0,
    stdout: true,
  };
}

/**
 * Runs `status`. Read-only. `--verbose` lifts the path caps, which is what makes the evolved list
 * an audit trail rather than a sample.
 * @param {{ sourceRoot?: string | undefined, targetArg: string, verbose?: boolean | undefined,
 *   env?: NodeJS.ProcessEnv | undefined }} input @returns {FlowResult}
 */
export function runStatus(input) {
  const targetRoot = requireExistingDirectory(input.targetArg);
  const name = basename(targetRoot);
  const read = readStatusFacts({
    targetRoot, ...(input.sourceRoot === undefined ? {} : { sourceRoot: input.sourceRoot }),
    ...(input.env === undefined ? {} : { env: input.env }),
  });
  if (!read.facts.installed) return notInstalled(name);
  const verdict = classify(read.facts);
  const lines = statusLines(read.facts, verdict, name, { verbose: input.verbose === true });
  if (read.truncated) lines.push('The walk for unowned files hit its cap: there may be more than are listed.');
  // A drift exit (2) is a verdict about the TARGET, not a failure of the command, so the report
  // still goes to stdout — the same rule `existing --analyze` follows.
  return { lines, code: verdict.code, stdout: true };
}

/**
 * Runs `uninstall`.
 * @param {{ sourceRoot?: string | undefined, targetArg: string, dryRun?: boolean | undefined,
 *   confirm?: boolean | undefined, forceModified?: ReadonlyArray<string> | undefined,
 *   verbose?: boolean | undefined, now: string, env?: NodeJS.ProcessEnv | undefined,
 *   exec?: typeof import('./exec.mjs').run | undefined }} input @returns {FlowResult}
 */
export function runUninstall(input) {
  const targetRoot = requireExistingDirectory(input.targetArg);
  const name = basename(targetRoot);
  const read = readStatusFacts({ targetRoot, ...(input.env === undefined ? {} : { env: input.env }) });
  if (!read.facts.installed) return notInstalled(name);
  const plan = planUninstall({
    facts: read.facts,
    ...(input.forceModified === undefined ? {} : { forceModified: input.forceModified }),
    confirm: input.confirm === true,
  });
  const rendered = planLines({ targetRoot, plan, name, verbose: input.verbose === true });
  if (input.dryRun === true) {
    return { lines: [...rendered, '', 'Dry run: nothing was removed, nothing was written.'], code: 0, stdout: true };
  }
  if (input.confirm !== true) {
    return {
      lines: [...rendered, '', ...forcedNote(input.forceModified ?? []),
        'Nothing was removed. Re-run with --confirm to perform this plan.'],
      code: 5,
    };
  }
  const outcome = applyUninstall({
    targetRoot, plan, targetName: name, now: input.now,
    ...(input.env === undefined ? {} : { env: input.env }),
    ...(input.exec === undefined ? {} : { exec: input.exec }),
  });
  // The reverse patches come AFTER the work: a block that was kept is still in the target, and the
  // text a human needs in order to remove it by hand is the text that is there now.
  const lines = [...outcomeLines({ outcome, plan, name }), ...patchLines(targetRoot, plan)];
  return { lines, code: outcome.failed.length === 0 ? 0 : 2 };
}

/** The one thing a human must be told when they passed `--force-modified` without `--confirm`: it
 * did nothing. @param {ReadonlyArray<string>} forced @returns {string[]} */
function forcedNote(forced) {
  if (forced.length === 0) return [];
  return [`--force-modified named ${plural(forced.length, 'path')} but had NO effect: deleting a file you changed`
    + ' needs --confirm as well, because nothing consequential here happens on one flag.', ''];
}
