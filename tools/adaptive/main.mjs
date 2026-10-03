// main.mjs — usage, argument parsing, the clock, and dispatch. Returns the exit code instead
// of calling process.exit, so it can be tested in-process as well as through cli.mjs.
//
// This is the composition layer of the module: the only place that reads the clock and the
// environment, and the only place that turns a string the human typed into a command. Who may
// change a mode is the HUMAN — this file is reached from a terminal the human is sitting at,
// and every write records `source: 'cli'` so that an unexpected declaration is visible
// afterwards. An agent is instructed never to run `set` on its own initiative; that instruction
// is not enforceable here, which is exactly why the provenance is recorded.
import { resolve } from 'node:path';
import { clear, context, set, status, toggle } from './commands.mjs';
import { CliError, EXIT } from './errors.mjs';
import { runHook } from './hook.mjs';
import { STATE_REL, readStdinText } from './io.mjs';
import { BOUNDARIES_POLICY, MODES } from './modes.mjs';
import { instantMs } from './schema.mjs';

export { EXIT };

const aliasRows = MODES.map((m) => `  ${m.id.padEnd(8)} /${m.id.padEnd(9)} ${m.aliases.join('  ')}`
  + (m.temporary ? '' : '   (the default: nothing is stored)')).join('\n');

export const USAGE = `adaptive — declared working modes for Cellular Mode (OPTIONAL, experimental)

Usage: node tools/adaptive/cli.mjs <command> [--root <dir>]
Global: --root <dir>   project root (default: current directory); state in ${STATE_REL}/
                       accepted before or after the command
Env:    ADAPTIVE_NOW="2026-10-03T14:02:00.000Z"   fixed clock, for tests and examples

Commands:
  status                what the effective mode is, and why (reads only, writes nothing)
  set <mode|alias>      declare a mode; \`ready\` stores NOTHING - it deletes the state file
  reset                 back to ready (the same transition as \`set ready\`)
  enable                turn the module back on
  disable               ignore any stored declaration and inject nothing; the file is kept
  clear                 delete session.json and preferences.json, with no backup
  context               the compact block for the ACTIVE mode; empty for the default
  hook <event>          SessionStart | UserPromptSubmit, reading the hook JSON on stdin
                        (opt-in; see adapters/claude-code/settings.adaptive.json)
  help                  this text

Options: --source cli|skill   who is declaring (the hook stamps claude-hook itself)

Modes and aliases (the word is yours; the system never interprets what it means):
${aliasRows}

On Git Bash a leading slash is rewritten into a Windows path, so prefer the bare alias
(\`set tired\`, \`set cansado\`) or prefix the command with MSYS_NO_PATHCONV=1.

A mode is only ever set by you: nothing is detected, nothing about a person is stored, and no
mode changes a gate, an approval, a security report or a test (${BOUNDARIES_POLICY}).

Exit codes: 0 ok · 1 usage, bad arguments or an unknown mode · 2 the state on disk cannot be
            read as a declaration`;

/**
 * `--root <dir>`, `--source <cli|skill>`, `--help`/`-h`, and the positional arguments — in ANY
 * order, because a global option that only works in one position is not global. Anything else
 * starting with `-` is a usage error rather than a silently ignored token.
 * @param {string[]} args
 * @returns {{ root: string, positional: string[], help: boolean, source: string }}
 */
export function parse(args) {
  /** @type {string[]} */
  const positional = [];
  let root = '.';
  let help = false;
  let source = 'cli';
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === undefined) continue;
    const named = /^--(root|source)(?:=(.*))?$/.exec(token);
    if (named !== null) {
      const value = named[2] ?? args[i + 1];
      if (value === undefined || value === '' || value.startsWith('-')) {
        throw new CliError(`option --${named[1]} needs a value`);
      }
      if (named[1] === 'root') root = value;
      else source = value;
      if (named[2] === undefined) i += 1;
      continue;
    }
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token.startsWith('-')) throw new CliError(`unknown option ${token}`);
    positional.push(token);
  }
  // `claude-hook` is NOT accepted here: that provenance is stamped by the hook itself, so a
  // shell can never dress a manual command up as something Claude Code did.
  if (source !== 'cli' && source !== 'skill') {
    throw new CliError(`--source must be cli or skill, got: ${source}`);
  }
  return { root: resolve(root), positional, help, source };
}

/** The only clock in the module, overridable so tests and examples are deterministic.
 * @param {NodeJS.ProcessEnv} env @returns {string} */
export function nowInstant(env) {
  const override = env.ADAPTIVE_NOW;
  if (override !== undefined && String(override).trim() !== '') {
    const value = String(override).trim();
    if (instantMs(value) === null) {
      throw new CliError(`ADAPTIVE_NOW must be a full ISO 8601 instant, got: ${value}`);
    }
    return value;
  }
  return new Date().toISOString();
}

/** @type {(command: string, root: string, positional: string[], now: string, source: string) => { lines: string[], code: number } | null} */
function dispatch(command, root, positional, now, source) {
  if (command === 'status') return status(root, now);
  if (command === 'set') return set(root, positional[1], now, source);
  if (command === 'reset') return set(root, 'ready', now, source);
  if (command === 'enable') return toggle(root, true);
  if (command === 'disable') return toggle(root, false);
  if (command === 'clear') return clear(root);
  if (command === 'context') return context(root, now);
  return null;
}

/** @typedef {{ write: (text: string) => unknown }} Sink */

/** Always returns EXIT.OK. A bad ADAPTIVE_NOW falls back to the real clock with a note rather
 * than failing, because the hook path must not be breakable by an environment variable.
 * @type {(root: string, event: string | undefined, io: { stdin?: string },
 *   env: NodeJS.ProcessEnv, out: Sink, err: Sink) => number} */
function runHookCommand(root, event, io, env, out, err) {
  /** @type {string[]} */
  const notes = [];
  let now;
  try {
    now = nowInstant(env);
  } catch (error) {
    notes.push(`adaptive: ${error instanceof Error ? error.message : String(error)}; using the real clock`);
    now = new Date().toISOString();
  }
  try {
    const payload = typeof io.stdin === 'string' ? io.stdin : readStdinText();
    const result = runHook(root, event, payload, now);
    for (const note of [...notes, ...result.notes]) err.write(`${note}\n`);
    if (result.lines.length > 0) out.write(`${result.lines.join('\n')}\n`);
  } catch (error) {
    err.write(`adaptive: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  return EXIT.OK;
}

/**
 * @param {string[]} [argv]
 * @param {{ stdout?: Sink, stderr?: Sink, env?: NodeJS.ProcessEnv, stdin?: string }} [io]
 * @returns {number} the exit code
 */
export function main(argv = process.argv, io = {}) {
  const out = io.stdout ?? process.stdout;
  const err = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;
  try {
    const { root, positional, help, source } = parse(argv.slice(2));
    const command = help ? 'help' : positional[0];
    if (command === undefined) {
      err.write(`${USAGE}\n`);
      return EXIT.USAGE;
    }
    if (command === 'help') {
      out.write(`${USAGE}\n`);
      return EXIT.OK;
    }
    // A hook is answered apart from every other command, and ALWAYS with exit 0: it sits
    // between a human and their next sentence, so it may report but it may never refuse.
    if (command === 'hook') return runHookCommand(root, positional[1], io, env, out, err);
    const result = dispatch(command, root, positional, nowInstant(env), source);
    if (result === null) {
      err.write(`unknown command: ${command}\n\n${USAGE}\n`);
      return EXIT.USAGE;
    }
    if (result.lines.length > 0) out.write(`${result.lines.join('\n')}\n`);
    return result.code;
  } catch (error) {
    if (error instanceof CliError) {
      err.write(`${error.message}\n`);
      return error.code;
    }
    err.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT.USAGE;
  }
}
