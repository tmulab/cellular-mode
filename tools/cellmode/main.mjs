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
                                          in an operation: --in/--out REQUIRED, an
                                          unplanned cell needs --amend-pack --confirm,
                                          and an overlapping boundary needs --confirm
  resume <name>                           ⏸ -> 🔵 (fuzzy, case-insensitive)
  pause [name] --facts F --next N
        [--decisions D --build B
         --note M --spend S]              🔵 -> ⏸: append log, update projections
  complete [name] --facts F --confirm
        [--decisions D --build B
         --note M --spend S]              🔵 -> ✔ (requires human confirmation)
                                          [name] only inside an operation, where it is
                                          REQUIRED once two cells are 🔵
  park <idea>                             append an idea to parking-lot.md
  status                                  <=5-line reconnection, or the waiting list
  check                                   integrity guard over log + projections
  conflicts <cell>                        read-only: cross that cell against every other
                                          🔵 cell of the active operation and print the
                                          | Cell | Overlapping paths | Shared resources |
                                          Verdict | table (overlap / shared / none)
  op open <name> --finish-line "a; b"
          --pack "<key>: <value> · …"
          --bar "<text>" --cells "a, b"   open (or resume ⏸) the ONE active operation
  op pause [name] --facts F --next N      🔵 -> ⏸ (refuses while a cell of it is 🔵)
  op complete [name] --facts F --confirm  🔵 -> ✔ (requires human confirmation)
  op status                               the active operation, or the paused ones

Exit codes: 0 ok · 1 usage/bad args · 2 integrity findings · 3 another cell or
            operation is active, the pack's max-active-cells is reached, or a boundary
            overlaps another 🔵 cell's ·
            4 ambiguous name · 5 human confirmation required`;

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
