// main.mjs — dispatch. Returns the exit code instead of calling `process.exit`, so the whole
// CLI is testable in-process, the arrangement tools/cellmode/main.mjs already uses.
//
// ONE PLACE TURNS A REFUSAL INTO A NUMBER, and it is the table in cli-shared.mjs. A `BuilderError`
// carries a machine-readable code; a `CliError` from cellmode's option parser already carries the
// number. Nothing here matches on prose.
//
// ONE PLACE WRITES, AND IT SCRUBS. Every line, stdout and stderr alike, passes through `scrub`
// before it leaves: no absolute path is ever printed, which cli.test.mjs asserts over the output
// of every command. Warnings go to stderr so that `prompt` writes nothing but the prompt to
// stdout — and `prompt` writes nothing to disk at all.
import { resolve } from 'node:path';
import { CliError } from '../cellmode/errors.mjs';
import { EXIT, EXIT_FOR, parseBuilderArgs, scrub } from './cli-shared.mjs';
import { cmdAnswer, cmdNext, cmdSkip, cmdStart, cmdStatus } from './commands.mjs';
import {
  cmdAdapters, cmdApprove, cmdCell, cmdDecide, cmdPrompt,
} from './commands-approve.mjs';
import { codeOf, detailsOf } from './errors.mjs';

/** @typedef {import('./cli-shared.mjs').BuilderCommandResult} BuilderCommandResult */

export const USAGE = `builder — Cellular Prompt Builder: an idea becomes an approved project
contract, a proposed first cell and an agent-neutral prompt. Deterministic; no language model
and no network are required, and it never implements the project itself.

Usage: node tools/prompt-builder/cli.mjs <command> [options]
Global: --root <dir>              project root (default: current directory)
        --mode ready|tired|focus|explore   a mode the HUMAN declared; never inferred here
Env:    CELLMODE_NOW="YYYY-MM-DD HH:MM"   fixed clock, for tests and examples

Commands:
  start <new|existing|resume>     begin or continue discovery; writes vault/builder/draft.json
        [--name N]                existing: read-only inspection first · resume: defers to /cell
        [--replace-draft --confirm]  replace an open draft instead of refusing
  status                          draft summary: labels, blockers, conflicts, next question
  next                            exactly one question
  answer <questionId> <text…>     record an answer ("I do not know" is a valid answer)
  skip <questionId>               pass a question over; the field keeps what it says
  decide propose --question Q --proposal P [--field F]      record a PENDING decision
  decide <id> approve|reject --confirm                      settle it
  approve [--confirm]             show readiness, conflicts and the publication check, then
                                  write vault/project-contract.json
  cell [--accept --confirm]       render the proposed first cell; --accept plans it as 📋
  prompt [--adapter neutral|claude-code] [--draft]          print a prompt (stdout only)
  adapters                        the export targets and their support status
  help                            this text

Approval is not publication: committing vault/project-contract.json stays a human decision.
Planning is not activation: only the human opens a cell (node tools/cellmode/cli.mjs open).

Exit codes: 0 ok · 1 usage/bad args · 2 validation, readiness or publication findings
            3 refused because of state that already exists · 5 human confirmation required`;

/** @type {Record<string, (root: string, args: any, env: NodeJS.ProcessEnv) => BuilderCommandResult>} */
export const COMMANDS = {
  start: cmdStart,
  status: cmdStatus,
  next: cmdNext,
  answer: cmdAnswer,
  skip: cmdSkip,
  decide: cmdDecide,
  approve: cmdApprove,
  cell: cmdCell,
  prompt: cmdPrompt,
  adapters: cmdAdapters,
};

/** @type {(item: unknown) => string} */
function describe(item) {
  if (item === null || typeof item !== 'object') return String(item);
  const record = /** @type {Record<string, unknown>} */ (item);
  const where = record.field ?? record.path;
  const what = record.reason ?? record.kind ?? record.message;
  return where === undefined ? JSON.stringify(item) : `${String(where)}: ${String(what ?? '')}`;
}

/** The message of a failure plus the list it carries. Never a value: `details` holds blockers,
 * publication findings and schema errors, all of which name a path and a shape only.
 * @param {unknown} error @returns {string[]} */
export function failureLines(error) {
  const lines = [error instanceof Error ? error.message : String(error)];
  const details = detailsOf(error);
  if (details === null || typeof details !== 'object') return lines;
  const record = /** @type {Record<string, unknown>} */ (details);
  for (const key of ['blockers', 'findings', 'errors']) {
    const list = record[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) lines.push(`  - ${describe(item)}`);
  }
  return lines;
}

/** @param {unknown} error @returns {number} */
export function exitFor(error) {
  const code = codeOf(error);
  if (code !== null) return EXIT_FOR[code] ?? EXIT.USAGE;
  if (error instanceof CliError) return error.code;
  return EXIT.USAGE;
}

/**
 * @param {string[]} [argv]
 * @param {{ stdout?: { write: (text: string) => unknown },
 *   stderr?: { write: (text: string) => unknown },
 *   env?: NodeJS.ProcessEnv }} [io]
 * @returns {number} the exit code
 */
export function main(argv = process.argv, io = {}) {
  const out = io.stdout ?? process.stdout;
  const err = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;
  const args = argv.slice(2);
  const command = args[0];
  let root = resolve('.');

  if (command === undefined) {
    err.write(`${USAGE}\n`);
    return EXIT.USAGE;
  }
  if (command === 'help' || command === '--help' || command === '-h') {
    out.write(`${USAGE}\n`);
    return EXIT.OK;
  }
  const run = COMMANDS[command];
  if (run === undefined) {
    err.write(`unknown command: ${command}\n\n${USAGE}\n`);
    return EXIT.USAGE;
  }
  /** @type {(stream: { write: (text: string) => unknown }, lines?: string[]) => void} */
  const write = (stream, lines) => {
    if (lines !== undefined && lines.length > 0) stream.write(`${scrub(lines.join('\n'), root)}\n`);
  };
  try {
    const parsed = parseBuilderArgs(args.slice(1));
    const option = parsed.options.root;
    root = resolve(typeof option === 'string' ? option : '.');
    const result = run(root, parsed, env) ?? {};
    write(out, result.lines);
    write(err, result.notes);
    return result.code ?? EXIT.OK;
  } catch (error) {
    write(err, failureLines(error));
    return exitFor(error);
  }
}
