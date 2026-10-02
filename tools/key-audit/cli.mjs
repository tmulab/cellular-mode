// key-audit CLI:
//   node tools/key-audit/cli.mjs [--root dir] [--map path] [--src glob-ish dir]
//                                [--ext .ts,.js] [--prefix regex]
//
// A SEPARATE file from the module, not an `if (import.meta.url === ...)` footer:
// on Windows that comparison silently fails to match and the tool would go mute
// on the command line without any test noticing — the tests import the module,
// they do not execute it. Separating the two makes the detection unnecessary.
//
// Exit codes (CHANGED from the original, which always exited 0):
//   0 — every declared key has a named implementation
//   1 — usage or I/O error (clear message, never a raw stack)
//   2 — at least one key is prose-only or absent (usable as a CI gate)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import { keysFromMap, classify, report, DEFAULT_KEY_PATTERN } from './key-audit.mjs';

const USAGE = `usage: node tools/key-audit/cli.mjs [options]
  --root <dir>      project root (default: current directory)
  --map <path>      key map markdown (default: contracts/key-map.md)
  --src <glob-ish>  source directories (default: packages/*/src/**)
  --ext <list>      comma-separated extensions (default: .ts)
  --prefix <regex>  regex source for a declared key (default: ${DEFAULT_KEY_PATTERN})
exit: 0 all named · 1 usage/IO error · 2 prose-only or absent keys found`;

class UsageError extends Error {}

/** What the command line can say. `help` short-circuits everything else.
 * @typedef {{ help?: boolean, root?: string, map?: string, src?: string,
 *   ext?: string, prefix?: string }} Options */

/** @param {string[]} argv @returns {Options} */
export function parseArgs(argv) {
  /** @type {Options} */
  const opts = { root: process.cwd(), map: 'contracts/key-map.md', src: 'packages/*/src/**', ext: '.ts' };
  const known = new Set(['root', 'map', 'src', 'ext', 'prefix']);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue; // unreachable while `i < argv.length`, and said so
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!arg.startsWith('--')) throw new UsageError(`unexpected argument "${arg}"`);
    const name = arg.slice(2);
    if (!known.has(name)) throw new UsageError(`unknown option "${arg}"`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`option "${arg}" needs a value`);
    // `known` has just proved the name is one of the five option keys.
    /** @type {Record<string, string>} */ (opts)[name] = value;
    i += 1;
  }
  return opts;
}

/** @type {(root: string, p: string) => string} */
const under = (root, p) => (isAbsolute(p) ? p : join(root, p));

/** @type {(path: string) => boolean} */
function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Files directly inside `dir` whose name ends with one of `exts`.
 * @type {(dir: string, exts: string[], out: string[]) => string[]} */
function filesIn(dir, exts, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!isDir(path) && exts.some((e) => name.endsWith(e))) out.push(path);
  }
  return out;
}

/** @type {(dir: string) => string[]} */
const subdirs = (dir) => readdirSync(dir).map((n) => join(dir, n)).filter(isDir);

/**
 * Minimal glob-ish walker: `*` matches one directory name, `**` matches any
 * depth (including zero). No other metacharacters — enough for "packages,
 * any package, its src, at any depth".
 */
/** @type {(base: string, segments: string[], exts: string[], out: string[]) => string[]} */
function walk(base, segments, exts, out) {
  if (!isDir(base)) return out;
  if (segments.length === 0) return filesIn(base, exts, out);
  const [head, ...rest] = segments;
  if (head === undefined) return filesIn(base, exts, out);
  if (head === '**') {
    walk(base, rest, exts, out);
    for (const dir of subdirs(base)) walk(dir, segments, exts, out);
    return out;
  }
  if (head.includes('*')) {
    const re = new RegExp('^' + head.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
    for (const dir of subdirs(base)) {
      if (re.test(dir.slice(base.length + 1))) walk(dir, rest, exts, out);
    }
    return out;
  }
  return walk(join(base, head), rest, exts, out);
}

/** @param {string} root @param {string} pattern @param {string[]} exts
 * @returns {Array<{ file: string, text: string }>} */
export function collectSources(root, pattern, exts) {
  // A plain directory (no wildcard) is read recursively: that is what someone
  // typing `--src lib` means.
  const normalized = pattern.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = (normalized.includes('*') ? normalized : normalized + '/**').split('/').filter(Boolean);
  const files = walk(resolve(root), segments, exts, []);
  return files.map((file) => ({ file, text: readFileSync(file, 'utf8') }));
}

/** @param {string[]} argv @returns {number} */
function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(USAGE + '\n');
    return 0;
  }
  const exts = (opts.ext ?? '').split(',').map((e) => e.trim()).filter(Boolean);
  if (exts.length === 0) throw new UsageError('option "--ext" needs at least one extension');
  if (opts.prefix !== undefined) {
    try {
      new RegExp(opts.prefix);
    } catch (err) {
      throw new UsageError(`option "--prefix" is not a valid regex: ${
        err instanceof Error ? err.message : String(err)}`);
    }
  }
  const root = opts.root ?? process.cwd();
  if (!isDir(root)) throw new UsageError(`root directory not found: ${root}`);

  const mapPath = under(root, opts.map ?? 'contracts/key-map.md');
  let mapText;
  try {
    mapText = readFileSync(mapPath, 'utf8');
  } catch {
    throw new UsageError(`cannot read key map: ${mapPath}`);
  }

  const sources = collectSources(root, opts.src ?? 'packages/*/src/**', exts);
  const options = opts.prefix === undefined ? {} : { prefix: opts.prefix };
  process.stdout.write(report(mapText, sources, options) + '\n');

  const { proseOnly, absent } = classify(keysFromMap(mapText, options), sources);
  return proseOnly.length + absent.length > 0 ? 2 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  // Clear message, never a raw stack: a CI log should say what to fix.
  process.stderr.write(`key-audit: ${err instanceof Error ? err.message : String(err)}\n`);
  if (err instanceof UsageError) process.stderr.write(USAGE + '\n');
  process.exitCode = 1;
}
