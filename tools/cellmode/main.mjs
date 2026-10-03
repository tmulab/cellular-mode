// main.mjs — dispatch. Returns the exit code instead of calling process.exit,
// so it can be tested in-process as well as through cli.mjs.
import { resolve } from 'node:path';
import { parseArgs } from './args.mjs';
import { COMMANDS } from './commands.mjs';
import { CliError, EXIT } from './errors.mjs';

export const USAGE = `cellmode — deterministic helper for the Cellular Mode file protocol

Usage: node tools/cellmode/cli.mjs <command> [options]
Global: --root <dir>   project root (default: current directory); state in vault/state/
Env:    CELLMODE_NOW="YYYY-MM-DD HH:MM"   fixed clock, for tests and examples

Commands:
  init                                    create the vault/state skeleton (refuses if it exists)
  plan <name> --area A [--objective O
              --deps "a, b"]              add a 📋 row; no log entry (it never ran)
  open <name> [--area --objective
              --in --out --done --next
              --deps "a, b"]              new cell or 📋 -> 🔵 (an opening, not a resume)
                                          --next "<action>" records the FIRST STEP
  resume <name>                           ⏸ -> 🔵 (fuzzy, case-insensitive)
  pause --facts F --next N
        [--decisions D --build B --note M]  🔵 -> ⏸: append log, update projections
  complete --facts F --confirm
        [--decisions D --build B --note M]  🔵 -> ✔ (requires human confirmation)
  park <idea>                             append an idea to parking-lot.md
  status                                  <=5-line reconnection, or the waiting list
  check                                   integrity guard over log + projections

Exit codes: 0 ok · 1 usage/bad args · 2 integrity findings · 3 another cell is active
            4 ambiguous cell name · 5 human confirmation required`;

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

  if (command === undefined) {
    err.write(`${USAGE}\n`);
    return EXIT.USAGE;
  }
  if (command === 'help' || command === '--help' || command === '-h') {
    out.write(`${USAGE}\n`);
    return EXIT.OK;
  }
  const run = COMMANDS[command];
  if (!run) {
    err.write(`unknown command: ${command}\n\n${USAGE}\n`);
    return EXIT.USAGE;
  }
  try {
    const parsed = parseArgs(args.slice(1));
    const rootOption = parsed.options.root;
    const root = resolve(typeof rootOption === 'string' ? rootOption : '.');
    const result = run(root, parsed, env) ?? {};
    if (result.lines && result.lines.length) out.write(`${result.lines.join('\n')}\n`);
    return result.code ?? EXIT.OK;
  } catch (error) {
    if (error instanceof CliError) {
      err.write(`${error.message}\n`);
      return error.code;
    }
    err.write(`cellmode: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT.USAGE;
  }
}
