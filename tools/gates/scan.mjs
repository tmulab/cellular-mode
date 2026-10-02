// scan.mjs — the ONLY module in tools/gates/ that touches disk.
//
// Every gate next door is a pure function over `[{ path, text }]` tuples plus a
// policy object. That split is the point: a gate that reads disk can only be
// tested by inventing a repository on disk, which is slow and tempts the test to
// assert on whatever happens to be checked in today. Here, disk reading lives in
// one place and the rules are exercised on fixtures that fit in a test file.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {import('./types.mjs').FileTuple} FileTuple */

/** Repository root, derived from this file's own location. */
export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Never walked: not ours, or not text. */
const SKIP_DIRS = new Set(['node_modules', '.git']);

/** Binary-ish extensions we never read as text. */
const BINARY = /\.(png|jpe?g|gif|ico|pdf|zip|woff2?|ttf|exe|dll)$/i;

/** @type {(p: string) => string} */
const toPosix = (p) => p.split(sep).join('/');

/** Every file under `root`, as root-relative POSIX paths.
 * @param {string} [root] @param {string} [dir] @param {string[]} [out] @returns {string[]}
 */
export function listFiles(root = ROOT, dir = root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      listFiles(root, full, out);
    } else if (entry.isFile()) {
      out.push(toPosix(relative(root, full)));
    }
  }
  return out;
}

/**
 * Read a set of files into tuples. `filter` is a predicate on the relative path,
 * so a gate decides its own scope and this function stays dumb.
 * @param {string} [root] @param {(rel: string) => boolean} [filter] @returns {FileTuple[]}
 */
export function readTuples(root = ROOT, filter = () => true) {
  return listFiles(root)
    .filter((rel) => !BINARY.test(rel) && filter(rel))
    .map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
}

/**
 * Policy loader. A MISSING policy file is not an error: a repository with no
 * exceptions is the healthy case, and `fallback` describes it. A policy file that
 * exists but cannot be parsed IS an error - fail closed, loudly, because the
 * alternative is a gate silently running with no allowlist at all.
 * @template T @param {string} name @param {T} fallback @param {string} [root] @returns {T}
 */
export function readPolicy(name, fallback, root = ROOT) {
  const full = join(root, 'policy', name);
  let raw;
  try {
    raw = readFileSync(full, 'utf8');
  } catch {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`policy/${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** @param {string} rel @param {string} [root] @returns {boolean} */
export function exists(rel, root = ROOT) {
  try {
    statSync(join(root, rel));
    return true;
  } catch {
    return false;
  }
}

/** Reads package.json as an object. Absent or invalid is a hard failure.
 * @param {string} [root] @returns {Record<string, unknown>} */
export function readPackageJson(root = ROOT) {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
}
