// integrate-hooks.mjs — the ONE consequential thing Bootstrap does to a target's git: set
// `core.hooksPath` to `.githooks`, and only under five conditions at once.
//
//   article-8 is installed        — without the hooks there is nothing to point at;
//   no hook machinery exists      — `hookMachinery === 'none'`, established by detection;
//   the human approved `hooks`    — the approval id, not a sentence;
//   `--confirm` was given         — neither flag alone may change how git behaves;
//   `core.hooksPath` is UNSET     — read first, every time. A value already there belongs to
//                                   somebody else's setup and is never overwritten.
//
// Any one of them missing and the step is PROPOSED: the exact command is printed and recorded,
// and the human runs it. Nothing is ever written into another tool's configuration — a Husky
// `.husky/pre-commit` is a file that project owns, so Bootstrap hands over a composition plan
// in words instead of appending to it.
//
// THE CONFIG IS LOCAL. `git config core.hooksPath .githooks` with no `--global`, run with the
// target as its working directory, through `exec.mjs` with an argv array and no shell.
import { gitHooksPath, isInsideWorkTree, run } from './exec.mjs';
import { HOOKS_COMPONENT, HOOKS_DIR } from './plan-constants.mjs';

/** @typedef {{ status: 'applied'|'proposed'|'skipped', detail: string,
 *   limitations: ReadonlyArray<string> }} HookOutcome */

/** The command, as the argv it really is. Printed, recorded and — with every condition met —
 * executed exactly as written here. */
export const HOOKS_ARGV = Object.freeze(['git', 'config', 'core.hooksPath', HOOKS_DIR]);

/** How to compose the Article 8 check into a machinery that already exists. Words, never a
 * write: each of these files belongs to the project, and a tool that edits another tool's hook
 * configuration is a tool that breaks it silently. */
export const COMPOSITION_PLANS = Object.freeze({
  husky: `add these two lines to .husky/pre-commit and .husky/commit-msg respectively: \`node tools/gates/authorization.mjs commit\` and \`node tools/gates/authorization.mjs trailer >> "$1"\` (the second only if the message has no Verified-State line yet); for pushes, \`node tools/gates/authorization.mjs push origin\` in .husky/pre-push. Keep ${HOOKS_DIR}/ as the reference implementation.`,
  lefthook: `add to lefthook.yml: \`pre-commit: {commands: {cellular: {run: node tools/gates/authorization.mjs commit}}}\`, \`commit-msg\` running \`node tools/gates/authorization.mjs trailer\`, and \`pre-push\` running \`node tools/gates/authorization.mjs push origin\`. Keep ${HOOKS_DIR}/ as the reference implementation.`,
  'pre-commit': `add a local hook to .pre-commit-config.yaml: \`- repo: local\` with \`hooks: [{id: cellular-authorization, name: Article 8, entry: node tools/gates/authorization.mjs commit, language: system, pass_filenames: false, stages: [commit]}]\`. pre-commit does not manage commit-msg trailers, so install ${HOOKS_DIR}/commit-msg by hand or accept untrailered commits.`,
  native: `.git/hooks already holds scripts, so core.hooksPath would hide them. Either call \`node tools/gates/authorization.mjs commit\` from your existing .git/hooks/pre-commit (and the trailer from commit-msg), or move your scripts into ${HOOKS_DIR}/ and then set core.hooksPath yourself.`,
  hooksPath: `core.hooksPath already points somewhere else. Either call the three commands of ${HOOKS_DIR}/ from the scripts in that directory, or copy them there.`,
  unknown: `the hook machinery here was not identified, so nothing is assumed. Call \`node tools/gates/authorization.mjs commit\` before a commit, \`node tools/gates/authorization.mjs trailer\` when writing the message, and \`node tools/gates/authorization.mjs push origin\` before a push, from whatever runs your hooks. ${HOOKS_DIR}/ holds the three scripts, three lines each.`,
});

/** The ONE thing activation cannot do for a POSIX checkout, said rather than discovered later.
 * Git runs a hook only when it is executable, and a filesystem without mode bits (Windows) stores
 * `100644`. Bootstrap does not run `git update-index`: that rewrites the index of a repository it
 * was asked to install INTO, which is a different act from writing files. */
export const EXEC_BIT_LIMITATION = `on a POSIX checkout git runs a hook only when it is executable, and a Windows filesystem stores no mode bit: if the hooks do not fire, run \`git update-index --chmod=+x ${HOOKS_DIR}/pre-commit ${HOOKS_DIR}/commit-msg ${HOOKS_DIR}/pre-push\` yourself. Bootstrap never rewrites the target's git index.`;

/** PURE. The composition plan for one machinery, or the generic one. @param {string} machinery
 * @returns {string} */
export function compositionPlan(machinery) {
  const table = /** @type {Readonly<Record<string, string | undefined>>} */ (COMPOSITION_PLANS);
  return table[machinery] ?? COMPOSITION_PLANS.unknown;
}

/** The proposal every refusal shares: what was not done, and the command that does it. */
const proposal = (/** @type {string} */ why) => `${why}. Not applied. To activate the hooks yourself: \`${HOOKS_ARGV.join(' ')}\` in the target.`;

/**
 * Activates the hooks, or explains precisely why it did not. Never throws: a failure to set one
 * git config key must not lose an install that has already written files.
 * @param {{ targetRoot: string, machinery: string, chosen: ReadonlySet<string>,
 *   approvals: ReadonlySet<string>, confirm?: boolean | undefined,
 *   env?: NodeJS.ProcessEnv | undefined,
 *   exec?: typeof run | undefined, hooksPath?: typeof gitHooksPath | undefined,
 *   workTree?: typeof isInsideWorkTree | undefined }} input
 * @returns {HookOutcome}
 */
export function activateHooks(input) {
  const { targetRoot, env } = input;
  if (!input.chosen.has(HOOKS_COMPONENT)) {
    return { status: 'skipped', detail: `${HOOKS_COMPONENT} is not installed, so there is no hook to activate`, limitations: [] };
  }
  if (input.machinery !== 'none') {
    return { status: 'proposed', limitations: [],
      detail: `${input.machinery} hook machinery is already present: the ${HOOKS_DIR} scripts are copied and left inert. Composition plan — ${compositionPlan(input.machinery)}` };
  }
  if (!input.approvals.has('hooks')) {
    return { status: 'proposed', detail: proposal('the approval "hooks" was not given'), limitations: [] };
  }
  if (input.confirm !== true) {
    return { status: 'proposed', detail: proposal('--confirm was not given'), limitations: [] };
  }
  if (!(input.workTree ?? isInsideWorkTree)(targetRoot, env)) {
    return { status: 'proposed', detail: proposal('the target is not inside a git work tree'), limitations: [] };
  }
  const previous = (input.hooksPath ?? gitHooksPath)(targetRoot, env);
  if (previous !== null) {
    return { status: 'proposed', limitations: [],
      detail: `core.hooksPath is already set to "${previous}" and Bootstrap never overwrites it. Composition plan — ${compositionPlan('hooksPath')}` };
  }
  const result = (input.exec ?? run)([...HOOKS_ARGV], { cwd: targetRoot, env });
  if (!result.ok) {
    return { status: 'proposed', limitations: [],
      detail: proposal(`\`${HOOKS_ARGV.join(' ')}\` did not succeed (status ${String(result.status)})`) };
  }
  return { status: 'applied', detail: `core.hooksPath=${HOOKS_DIR} (previously unset)`,
    limitations: [EXEC_BIT_LIMITATION] };
}
