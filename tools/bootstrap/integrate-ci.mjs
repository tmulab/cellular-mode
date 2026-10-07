// integrate-ci.mjs — the additive CI workflow, and nothing else that touches CI.
//
// NEVER AN EDIT, NEVER A REPLACEMENT. An existing workflow is somebody's deployment pipeline;
// Bootstrap neither reads it for merging nor writes near it. The only thing it may do is CREATE
// `.github/workflows/cellular-verify.yml` when that exact path is absent, the human approved
// `ci-workflow`, and `--confirm` was given. A file already there means PROPOSED, with the
// reason. For any other provider the output is a snippet in words, printed and recorded.
//
// THE STEPS ARE THE CONTRACT'S MANDATORY CHECKS, rendered as argv and not as a command line.
// Each argument is restricted to `SAFE_ARG` and then wrapped in single quotes inside a
// double-quoted YAML scalar, so neither YAML nor the runner's shell can reinterpret anything; an
// argument that does not match is REFUSED (the check is left out and named), because a workflow
// is a file that executes and a guess there is a vulnerability. Nothing untrusted is ever
// interpolated unquoted, and the file carries no `${{ … }}` expression at all — no secret, no
// context value, nothing a fork could influence.
import { sanitize } from './display.mjs';
import { CI_WORKFLOW_FILE, HOOKS_COMPONENT } from './plan-constants.mjs';
import { renderTemplate } from './templates.mjs';
import { readIfPresent } from './writer.mjs';

/** @typedef {{ id: string, argv: ReadonlyArray<string> }} MandatoryCheck */
/** @typedef {{ status: 'applied'|'proposed'|'skipped', detail: string,
 *   files: ReadonlyArray<{ path: string, bytes: string, mode: string }>,
 *   limitations: ReadonlyArray<string> }} CiOutcome */

/** What a workflow argument may contain. Narrow on purpose: a command in a CI file is executed
 * on a machine nobody is watching, so anything that could need quoting is refused instead. */
export const SAFE_ARG = /^[A-Za-z0-9._:/@=+-]+$/;

/** A step id as it appears in `name:`. Kebab ids pass unchanged; anything else is sanitized. */
const SAFE_NAME = /[^A-Za-z0-9 ._-]+/g;

/** The provider the generated workflow is for. */
export const GITHUB = 'github-actions';

/** What a non-GitHub provider gets: a sentence, never a file. The command is the same in every
 * one of them, which is the point of an argv contract. */
export const PROVIDER_SNIPPETS = Object.freeze({
  'gitlab-ci': 'add a job to .gitlab-ci.yml whose script runs `node tools/cellmode/cli.mjs check` and then each mandatory check of vault/verification.json.',
  circleci: 'add a job to .circleci/config.yml with the same two steps, on a node:24 image.',
  'azure-pipelines': 'add a script step to azure-pipelines.yml with the same two commands.',
  bitbucket: 'add a step to bitbucket-pipelines.yml with the same two commands.',
  jenkins: 'add a stage to the Jenkinsfile with the same two commands.',
  unknown: 'run `node tools/cellmode/cli.mjs check` and each mandatory check of vault/verification.json in whatever runs your pipeline.',
});

/** PURE. The `run:` scalar for one argv, or `null` when an argument is not safe to render.
 * @param {ReadonlyArray<string>} argv @returns {string | null} */
export function runLineFor(argv) {
  if (argv.length === 0 || !argv.every((part) => SAFE_ARG.test(part))) return null;
  return `"${argv.map((part) => `'${part}'`).join(' ')}"`;
}

/**
 * PURE. The YAML steps for a list of mandatory checks, plus the ids that could not be rendered.
 * @param {ReadonlyArray<MandatoryCheck>} checks
 * @returns {{ text: string, refused: ReadonlyArray<string> }}
 */
export function stepsFor(checks) {
  /** @type {string[]} */
  const lines = [];
  /** @type {string[]} */
  const refused = [];
  for (const check of checks) {
    const run = runLineFor(check.argv);
    const name = String(check.id).replace(SAFE_NAME, '-').slice(0, 60);
    if (run === null || name === '') {
      refused.push(sanitize(check.id, 60));
      continue;
    }
    lines.push(`      - name: ${name}`, `        run: ${run}`);
  }
  return { text: lines.length === 0 ? '' : `${lines.join('\n')}\n`, refused: Object.freeze(refused) };
}

/** The Article 8 trailer step, present only when the gates that answer it are installed.
 * @param {boolean} article8 @returns {string} */
const trailerStep = (article8) => (article8
  ? '      - name: verified-state-trailer\n        run: "\'node\' \'tools/gates/ci-trailer.mjs\'"\n'
  : '');

/** PURE. The snippets for the providers that are present and are not GitHub Actions.
 * @param {ReadonlyArray<string>} providers @returns {string} */
export function otherProviders(providers) {
  const table = /** @type {Readonly<Record<string, string | undefined>>} */ (PROVIDER_SNIPPETS);
  const others = providers.filter((id) => id !== GITHUB);
  if (others.length === 0) return '';
  return ` Other providers detected (${others.join(', ')}): proposed only, nothing written — ${others.map((id) => `${id}: ${table[id] ?? PROVIDER_SNIPPETS.unknown}`).join(' ')}`;
}

/**
 * Creates the additive workflow, or says exactly why it did not. Reads the target only to ask
 * whether the one path it may create is free.
 * @param {{ targetRoot: string, chosen: ReadonlySet<string>, approvals: ReadonlySet<string>,
 *   confirm?: boolean | undefined, mandatory: ReadonlyArray<MandatoryCheck>,
 *   projectName: string, providers: ReadonlyArray<string>,
 *   readTemplate: (rel: string) => string }} input
 * @returns {CiOutcome}
 */
export function proposeWorkflow(input) {
  const others = otherProviders(input.providers);
  const article8 = input.chosen.has(HOOKS_COMPONENT);
  if (!input.approvals.has('ci-workflow')) {
    return { status: 'proposed', files: [], limitations: [],
      detail: `no workflow was written: the approval "ci-workflow" was not given. With it, Bootstrap creates ${CI_WORKFLOW_FILE} (additive, contents: read, SHA-pinned actions, no secret).${others}` };
  }
  if (input.confirm !== true) {
    return { status: 'proposed', files: [], limitations: [],
      detail: `no workflow was written: --confirm was not given.${others}` };
  }
  if (readIfPresent(input.targetRoot, CI_WORKFLOW_FILE) !== null) {
    return { status: 'proposed', files: [], limitations: [],
      detail: `${CI_WORKFLOW_FILE} already exists and Bootstrap never replaces or edits a workflow: compare it with the one in the source repository yourself.${others}` };
  }
  const steps = stepsFor(input.mandatory);
  const bytes = renderTemplate('ci-github', {
    projectName: input.projectName, checkSteps: steps.text, trailerStep: trailerStep(article8),
  }, input.readTemplate);
  /** @type {string[]} */
  const limitations = [];
  if (steps.refused.length > 0) {
    limitations.push(`${steps.refused.length} mandatory check(s) were left out of ${CI_WORKFLOW_FILE} because an argument needed quoting Bootstrap will not guess at: ${steps.refused.join(', ')}`);
  }
  if (input.mandatory.length === 0) {
    limitations.push(`${CI_WORKFLOW_FILE} runs the cell-state check only: vault/verification.json made nothing mandatory at install time. Add the checks to both files once you have approved them.`);
  }
  if (article8) {
    limitations.push(`${CI_WORKFLOW_FILE} runs tools/gates/ci-trailer.mjs, which FAILS on a commit with no Verified-State trailer: expect it to be red until the first commit made through the hooks.`);
  }
  return { status: 'applied', files: [{ path: CI_WORKFLOW_FILE, bytes, mode: 'generate' }],
    limitations, detail: `${CI_WORKFLOW_FILE} created: additive, contents: read, actions pinned by SHA, no secret, ${input.mandatory.length} mandatory check step(s).${others}` };
}
