// compose-builder.mjs — how Bootstrap reaches the Cellular Prompt Builder: by running its CLI as a
// SUBPROCESS, never by importing it.
//
// THIS IS A HUMAN DECISION, taken in Stage 7 Cell 3. The obvious design was a dynamic `import()`
// from this one composition module, which is how `eip/host/observer-composition.mjs` reaches the
// optional adaptive module. It was REFUSED: the boundary rule
// `prompt-builder-is-optional-and-isolated` (decision PB3) says NOTHING outside
// `tools/prompt-builder/` may import it, and that rule is to be strengthened, never relaxed. So
// there is no import edge here of either kind, the PB3 gate is unchanged, and
// `tools/gates/rules.mjs` needed no exception. The coupling is a process boundary instead: an argv
// array in, an EXIT CODE out.
//
// EXIT CODES ARE THE ONLY THING WE READ. The Builder's contract (`tools/prompt-builder/main.mjs`)
// is 0 ok · 1 usage · 2 findings · 3 state that already exists · 5 confirmation required. Decisions
// here branch on those numbers alone; stdout and stderr are used only for a sanitized one-line
// summary a human can read. Parsing another tool's prose is how two tools drift apart silently.
//
// Where the approval is established is worth stating, because it is NOT the preview. `cell` without
// `--accept` succeeds (exit 0) for any VALID contract, approved or not — so exit 0 there establishes
// VALIDITY only. `cell --accept --confirm` is the step that refuses an unapproved contract
// (`NOT_APPROVED` ⇒ exit 2), so a successful accept is the proof of approval, and anything else
// falls through to the generic discovery cell. Fail closed, by construction.
//
// PLANNED, NEVER ACTIVATED, in every branch. 📋 is a cell that exists; 🔵 is a cell somebody is
// working in, and only the human decides that (`node tools/cellmode/cli.mjs open`).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cmdPlan } from '../cellmode/commands.mjs';
import { sanitize } from './display.mjs';
import { run as execRun } from './exec.mjs';
import { readIfPresent } from './writer.mjs';

/** @typedef {import('./exec.mjs').ExecResult} ExecResult */
/** @typedef {(argv: ReadonlyArray<string>, options?: { cwd?: string | undefined,
 *   timeoutMs?: number | undefined, env?: NodeJS.ProcessEnv | undefined }) => ExecResult} Runner */
/** @typedef {{ present: boolean, valid?: boolean | 'UNKNOWN', approved?: boolean,
 *   errors?: ReadonlyArray<string>, reason?: string, contract?: unknown }} ContractStatus */
/** @typedef {{ status: 'planned'|'proposed', via: string, slug: string | null, detail: string }} CellOutcome */

/** The contract a target may already hold, relative to its root. */
export const CONTRACT_REL = 'vault/project-contract.json';

/** The Builder's entry point, relative to a source checkout. Written as path SEGMENTS, so this file
 * contains no string that could ever be mistaken for an import specifier. */
export const BUILDER_CLI = Object.freeze(['tools', 'prompt-builder', 'cli.mjs']);

/** How long the Builder's CLI may take. It reads two JSON files and writes one cell; twenty
 * seconds is generous and still bounded. */
export const BUILDER_TIMEOUT_MS = 20000;

/** The name and objective of the fallback cell. A discovery cell is the only honest first cell when
 * nothing has bounded the project yet, and its objective says exactly that. */
export const DISCOVERY = Object.freeze({
  name: 'project-discovery',
  area: 'discovery',
  objective: 'Clarify objective, scope and verification commands',
});

/** The Builder's CLI in this source checkout, or `null` when the optional module is not installed.
 * @param {string} sourceRoot @returns {string | null} */
export function builderCli(sourceRoot) {
  const cli = join(sourceRoot, ...BUILDER_CLI);
  return existsSync(cli) ? cli : null;
}

/** PURE. One sanitized line out of a subprocess, with both roots removed. The Builder scrubs its
 * own `--root` already; this removes ours too, so no absolute path can reach a report.
 * @param {ExecResult} result @param {ReadonlyArray<string>} roots @returns {string} */
export function summaryOf(result, roots) {
  const raw = [result.stderr, result.stdout]
    .flatMap((text) => text.split('\n'))
    .map((line) => line.trim())
    .find((line) => line !== '') ?? `exit ${String(result.status)}`;
  let text = raw;
  for (const root of roots) {
    const absolute = String(root ?? '').replace(/[\\/]+$/, '');
    if (absolute === '') continue;
    text = text.split(absolute).join('.').split(absolute.split('\\').join('/')).join('.');
  }
  return sanitize(text, 140);
}

/** PURE. Whether a parsed contract records a human approval. Two fields, read locally: this is the
 * one fact about a contract that needs no schema and therefore no Builder.
 * @param {unknown} contract @returns {boolean} */
export function contractApproved(contract) {
  if (typeof contract !== 'object' || contract === null) return false;
  const approval = /** @type {{ approval?: unknown }} */ (contract).approval;
  if (typeof approval !== 'object' || approval === null) return false;
  const { approved, at } = /** @type {{ approved?: unknown, at?: unknown }} */ (approval);
  return approved === true && typeof at === 'string' && at !== '';
}

/** One Builder command against a target. @param {string} cli @param {string} targetRoot
 * @param {ReadonlyArray<string>} args @param {{ run?: Runner | undefined,
 *   env?: NodeJS.ProcessEnv | undefined }} options @returns {ExecResult} */
function callBuilder(cli, targetRoot, args, options) {
  return (options.run ?? execRun)(
    [process.execPath, cli, ...args, '--root', targetRoot],
    { timeoutMs: BUILDER_TIMEOUT_MS, env: options.env },
  );
}

/**
 * What Bootstrap can say about a target's project contract. Reading the file is confined and
 * size-capped; the judgement comes from the Builder's exit code, or is UNKNOWN when there is no
 * Builder to ask.
 * @param {{ targetRoot: string, sourceRoot: string, run?: Runner | undefined,
 *   env?: NodeJS.ProcessEnv | undefined }} input
 * @returns {ContractStatus}
 */
export function contractStatus(input) {
  const text = readIfPresent(input.targetRoot, CONTRACT_REL);
  if (text === null) return { present: false };
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { present: true, valid: false, approved: false, errors: [`${CONTRACT_REL} is not valid JSON`] };
  }
  const approved = contractApproved(parsed);
  const cli = builderCli(input.sourceRoot);
  if (cli === null) {
    return {
      present: true,
      valid: 'UNKNOWN',
      approved,
      reason: 'Prompt Builder not installed in the source',
      contract: parsed,
    };
  }
  const result = callBuilder(cli, input.targetRoot, ['cell'], input);
  const summary = summaryOf(result, [input.targetRoot, input.sourceRoot]);
  if (result.status === 0) return { present: true, valid: true, approved, contract: parsed };
  if (result.status === 2) return { present: true, valid: false, approved, errors: [summary] };
  return { present: true, valid: 'UNKNOWN', approved, reason: summary, contract: parsed };
}

/** The generic planned cell, through cellmode. @param {string} targetRoot @param {string} why
 * @param {NodeJS.ProcessEnv | undefined} env @returns {CellOutcome} */
function discoveryCell(targetRoot, why, env) {
  cmdPlan(targetRoot, {
    positional: [DISCOVERY.name],
    options: { area: DISCOVERY.area, objective: DISCOVERY.objective },
  }, env);
  return { status: 'planned', via: 'cellmode', slug: DISCOVERY.name,
    detail: `generic discovery cell planned 📋 (${why}); not activated` };
}

/**
 * Creates the first cell — PLANNED (📋) and never activated — or records why it did not. Without the
 * `first-cell` approval nothing happens and the step is `proposed`; with it, the Builder is asked to
 * accept its own proposal, and ANY non-zero exit falls back to the generic discovery cell rather
 * than leaving the target with no first cell and no explanation.
 * @param {{ targetRoot: string, sourceRoot: string, approvals: ReadonlySet<string>,
 *   confirm?: boolean | undefined, env?: NodeJS.ProcessEnv | undefined,
 *   run?: Runner | undefined }} input
 * @returns {CellOutcome}
 */
export function installFirstCell(input) {
  if (!input.approvals.has('first-cell')) {
    return { status: 'proposed', via: 'none', slug: null,
      detail: 'the first cell was not created: approval "first-cell" was not given' };
  }
  if (input.confirm !== true) {
    return { status: 'proposed', via: 'none', slug: null,
      detail: 'the first cell was not created: --confirm was not given' };
  }
  const status = contractStatus(input);
  const cli = builderCli(input.sourceRoot);
  if (cli === null) {
    return discoveryCell(input.targetRoot, 'Prompt Builder not installed in the source', input.env);
  }
  if (status.present !== true) return discoveryCell(input.targetRoot, 'no project contract in the target', input.env);
  if (status.valid !== true) {
    return discoveryCell(input.targetRoot, `the project contract is not one the Builder accepts: ${status.errors?.[0] ?? status.reason ?? 'unknown'}`, input.env);
  }
  const result = callBuilder(cli, input.targetRoot, ['cell', '--accept', '--confirm'], input);
  if (result.status !== 0) {
    // Exit 2 here is NOT_APPROVED far more often than anything else: the preview proved the
    // contract valid, and approval is only ever enforced at the accept step.
    return discoveryCell(input.targetRoot,
      `the Builder refused to plan its proposal (exit ${String(result.status)}): ${summaryOf(result, [input.targetRoot, input.sourceRoot])}`,
      input.env);
  }
  return { status: 'planned', via: 'prompt-builder', slug: null,
    detail: 'planned 📋 from the approved project contract by the Prompt Builder; not activated' };
}
