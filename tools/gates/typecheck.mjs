// typecheck.mjs — finding and running a real type checker, in one place.
//
// R-1 (policy/relaxations.md) used to say the typecheck leg was UNAVAILABLE because
// the project had no type checker. It now has one, as a pinned devDependency, and the
// probe has to find it the way Node finds it: in `node_modules`, not on PATH. A
// developer who never installed TypeScript globally still has a working gate, and a
// gate that only looked at PATH would report UNKNOWN on the very machine that holds
// the compiler.
//
// RESOLUTION ORDER, and the reason for it:
//   1. `node_modules/typescript/bin/tsc`, run with THIS Node — the pinned version the
//      lockfile names, no shell, no .cmd shim, no PATH lookup to get wrong.
//   2. `tsc` on PATH — a global install, for a checkout with no node_modules.
//   3. nothing — and then the leg is UNKNOWN, never green.
//
// Two conditions, both necessary: a config file AND a resolvable checker. A config
// with no compiler proves nothing, and a compiler with no config has nothing to read.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, exists } from './scan.mjs';

/** The config the project typechecks against. `jsconfig.json` is the honest name for
 * a JavaScript project, so it is preferred when both exist.
 * @type {(root?: string) => string | null} */
export const configPath = (root = ROOT) => (exists('jsconfig.json', root) ? 'jsconfig.json'
  : exists('tsconfig.json', root) ? 'tsconfig.json' : null);

const LOCAL_TSC = 'node_modules/typescript/bin/tsc';

/**
 * How to invoke the type checker, or `null` when there is none.
 * @param {string} [root]
 * @returns {{ cmd: string, args: string[], shell: boolean, version: string } | null}
 */
export function resolveTypeChecker(root = ROOT) {
  if (configPath(root) === null) return null;
  if (exists(LOCAL_TSC, root)) {
    const cmd = process.execPath;
    const args = [join(root, LOCAL_TSC)];
    const probe = spawnSync(cmd, [...args, '--version'], { cwd: root, encoding: 'utf8' });
    if (probe.status === 0) {
      return { cmd, args, shell: false, version: (probe.stdout ?? '').trim() };
    }
  }
  // On Windows `tsc` is a .cmd shim, which spawnSync cannot execute directly; the
  // shell is used for the PATH lookup ONLY, never for a path that contains spaces.
  const shell = process.platform === 'win32';
  const probe = spawnSync('tsc', ['--version'], { cwd: root, encoding: 'utf8', shell });
  if (probe.status === 0) {
    return { cmd: 'tsc', args: [], shell, version: (probe.stdout ?? '').trim() };
  }
  return null;
}

/** Is a real type checker available at all? The question `--release` asks.
 * @type {(root?: string) => boolean} */
export const typecheckAvailable = (root = ROOT) => resolveTypeChecker(root) !== null;

/**
 * Run the checker and count what it said. The error COUNT is reported, not implied:
 * "clean" with no number is the kind of claim this project exists to refuse.
 * @param {string} [root]
 * @returns {{ ran: false } | { ran: true, ok: boolean, errors: number, command: string, output: string }}
 */
export function runTypecheck(root = ROOT) {
  const tsc = resolveTypeChecker(root);
  const config = configPath(root);
  if (tsc === null || config === null) return { ran: false };
  const args = [...tsc.args, '--noEmit', '-p', config];
  const out = spawnSync(tsc.cmd, args, { cwd: root, encoding: 'utf8', shell: tsc.shell });
  const output = `${out.stdout ?? ''}${out.stderr ?? ''}`;
  const errors = (output.match(/error TS\d+:/g) ?? []).length;
  return {
    ran: true,
    ok: out.status === 0 && errors === 0,
    errors,
    command: `tsc --noEmit -p ${config}`,
    output: output.trim(),
  };
}
