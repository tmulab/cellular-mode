// main.mjs — dispatch. Returns the exit code instead of calling `process.exit`, so the whole CLI
// is testable in process: the arrangement tools/cellmode/main.mjs and tools/prompt-builder/main.mjs
// both use.
//
// ONE PLACE TURNS A REFUSAL INTO A NUMBER, and it is `exitFor` in errors.mjs. Nothing here matches
// on prose, so rewording a message can never change an exit status.
//
// NO PROFILE IS EVER GUESSED. `new` without `--profile` prints the three profiles and exits 1.
// Installing "the usual" into somebody's repository because they forgot a flag is exactly the kind
// of helpfulness this project does not do.
//
// NO ABSOLUTE PATH LEAVES THIS CLI. Every line passes through `scrubLines`, which replaces both
// spellings of the source root and of the target with a relative marker — the same rule
// tools/prompt-builder/cli-shared.mjs applies, for the same reason: a terminal, a log and whatever
// the human pastes next are all places a machine path should not be.
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../cellmode/args.mjs';
import { parseApprovals } from './approvals.mjs';
import { exitFor, isBootstrapError } from './errors.mjs';
import { runNew } from './new-flow.mjs';
import { runExisting } from './existing-flow.mjs';
import { runStatus, runUninstall } from './manage-flow.mjs';
import { instantOf } from './clock.mjs';
import { USAGE, profileLines } from './usage.mjs';

export { USAGE, profileLines };

/** The repository this CLI installs FROM: two levels above `tools/bootstrap/`. */
export const SOURCE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Options that are present-or-absent rather than key-and-value, rewritten before cellmode's
 * parser sees them — one parser, no second opinion about what an option looks like. */
export const FLAGS = Object.freeze(['confirm', 'dry-run', 'verbose', 'analyze', 'json', 'save-report']);

/** The commands this CLI implements. `status` and `uninstall` act on an install that is already
 * there; neither ever reinstalls anything. */
export const COMMANDS = Object.freeze(['new', 'existing', 'status', 'uninstall']);

/** @param {string[]} argv @returns {import('../cellmode/types.mjs').ParsedArgs} */
export function parseBootstrapArgs(argv) {
  return parseArgs(argv.map((token) => (
    token.startsWith('--') && FLAGS.includes(token.slice(2)) ? `${token}=true` : token)));
}

/** @param {Record<string, string | boolean>} options @param {string} key @returns {boolean} */
const flag = (options, key) => options[key] === true || options[key] === 'true';

/** PURE. `text` with every spelling of each root replaced by a relative marker.
 * @param {string[]} lines @param {ReadonlyArray<string>} roots @returns {string} */
export function scrubLines(lines, roots) {
  let text = lines.join('\n');
  for (const root of roots) {
    const absolute = String(root ?? '').replace(/[\\/]+$/, '');
    if (absolute === '') continue;
    text = text.split(absolute).join('.').split(absolute.split(sep).join('/')).join('.');
  }
  return text;
}

/** `comma,separated` as a list, or `undefined`. @param {unknown} value
 * @returns {ReadonlyArray<string> | undefined} */
function listOf(value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.split(',').map((part) => part.trim()).filter((part) => part !== '');
}

/** @param {string[]} args @param {NodeJS.ProcessEnv} env
 * @returns {{ lines: string[], code: number, root: string, stdout?: boolean }} */
function dispatch(args, env) {
  const command = String(args[0]);
  const parsed = parseBootstrapArgs(args.slice(1));
  const targetArg = parsed.positional[0];
  // `--mandatory` makes a check able to BLOCK a commit in the target. Two locks, like every
  // other consequential step: the ids themselves, and --confirm. Checked before any flow runs,
  // so the refusal is identical for new, existing and --dry-run.
  if (listOf(parsed.options.mandatory) !== undefined && !flag(parsed.options, 'confirm')) {
    return { lines: ['--mandatory makes a check mandatory for final verification in the target:'
      + ' it needs --confirm as well, because nothing that can block a commit is set by one flag.'],
    code: 5, root: '' };
  }
  if (typeof targetArg !== 'string' || targetArg === '') {
    return { lines: [`${command} needs a target directory: node tools/bootstrap/cli.mjs ${command} <target-dir>`], code: 1, root: '' };
  }
  const root = resolve(targetArg);
  if (command === 'status') {
    return { ...runStatus({ sourceRoot: SOURCE_ROOT, targetArg, env }), root };
  }
  if (command === 'uninstall') {
    return { ...runUninstall({ sourceRoot: SOURCE_ROOT, targetArg,
      dryRun: flag(parsed.options, 'dry-run'), confirm: flag(parsed.options, 'confirm'),
      forceModified: listOf(parsed.options['force-modified']), now: instantOf(env), env }), root };
  }
  const mode = parsed.options.mode === undefined ? undefined : String(parsed.options.mode);
  if (command === 'existing') {
    const result = runExisting({
      sourceRoot: SOURCE_ROOT,
      targetArg,
      analyze: flag(parsed.options, 'analyze'),
      json: flag(parsed.options, 'json'),
      saveReport: flag(parsed.options, 'save-report'),
      profile: parsed.options.profile === undefined ? undefined : String(parsed.options.profile),
      components: listOf(parsed.options.components),
      approvals: parseApprovals(parsed.options.approve),
      dryRun: flag(parsed.options, 'dry-run'),
      confirm: flag(parsed.options, 'confirm'),
      mode: /** @type {import('./render-plan.mjs').RenderMode | undefined} */ (mode),
      verbose: flag(parsed.options, 'verbose'),
      mandatory: listOf(parsed.options.mandatory),
      now: instantOf(env),
      env,
    });
    return { ...result, root };
  }
  if (parsed.options.profile === undefined && parsed.options.components === undefined) {
    return { lines: profileLines(), code: 1, root };
  }
  const result = runNew({
    sourceRoot: SOURCE_ROOT,
    mandatory: listOf(parsed.options.mandatory),
    targetArg,
    profile: parsed.options.profile === undefined ? 'custom' : String(parsed.options.profile),
    components: listOf(parsed.options.components),
    approvals: parseApprovals(parsed.options.approve),
    dryRun: flag(parsed.options, 'dry-run'),
    confirm: flag(parsed.options, 'confirm'),
    mode: /** @type {import('./render-plan.mjs').RenderMode | undefined} */ (mode),
    verbose: flag(parsed.options, 'verbose'),
    now: instantOf(env),
    env,
  });
  return { ...result, root };
}

/** The message of a refusal plus the list it carries. @param {unknown} error @returns {string[]} */
export function failureLines(error) {
  const lines = [error instanceof Error ? error.message : String(error)];
  if (!isBootstrapError(error)) return lines;
  const details = /** @type {{ details?: Record<string, unknown> }} */ (error).details ?? {};
  for (const key of ['errors', 'conflicts', 'unexpected', 'created', 'unknown', 'missing']) {
    const list = details[key];
    if (!Array.isArray(list)) continue;
    lines.push(`${key}:`);
    for (const item of list) lines.push(`  - ${String(item)}`);
  }
  return lines;
}

/**
 * @param {string[]} [argv] @param {{ stdout?: { write: (text: string) => unknown },
 *   stderr?: { write: (text: string) => unknown }, env?: NodeJS.ProcessEnv }} [io]
 * @returns {number} the exit code
 */
export function main(argv = process.argv, io = {}) {
  const out = io.stdout ?? process.stdout;
  const err = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;
  const args = argv.slice(2);
  const command = args[0];
  if (command === undefined) {
    err.write(`${USAGE}\n`);
    return 1;
  }
  if (command === 'help' || command === '--help' || command === '-h') {
    out.write(`${USAGE}\n`);
    return 0;
  }
  if (!COMMANDS.includes(command)) {
    err.write(`unknown command: ${command}\n\n${USAGE}\n`);
    return 1;
  }
  let root = '';
  try {
    const result = dispatch(args, env);
    root = result.root;
    const text = scrubLines(result.lines, [root, SOURCE_ROOT]);
    // A findings exit (2) from `existing --analyze` is a verdict about the PROJECT, not a failure of
    // the command, so the report still goes to stdout — that is what `stdout: true` means.
    (result.code === 0 || result.stdout === true ? out : err).write(`${text}\n`);
    return result.code;
  } catch (error) {
    err.write(`${scrubLines(failureLines(error), [root, SOURCE_ROOT])}\n`);
    return exitFor(isBootstrapError(error) ? /** @type {{ code: string }} */ (error).code : undefined);
  }
}
