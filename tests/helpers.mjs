// Shared helpers for the repository hygiene tests.
// Not a test file: the name does not match the `node --test` discovery patterns.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

const SKIP_DIRS = new Set(['node_modules', '.git']);

/** Every file in the repository, as repo-relative POSIX paths.
 * @param {string} [dir] @param {string[]} [out] @returns {string[]} */
export function allFiles(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      allFiles(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(relative(ROOT, join(dir, entry.name)).split(sep).join('/'));
    }
  }
  return out;
}

/** Every directory in the repository, as repo-relative POSIX paths.
 * @param {string} [dir] @param {string[]} [out] @returns {string[]} */
export function allDirs(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    out.push(relative(ROOT, full).split(sep).join('/'));
    allDirs(full, out);
  }
  return out;
}

/** @param {string} rel @returns {string} */
export function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** @param {string} rel @returns {number} */
export function lineCount(rel) {
  const text = read(rel);
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop(); // trailing newline
  return lines.length;
}

/** @param {string} rel @returns {boolean} */
export function exists(rel) {
  try {
    statSync(join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
}

/** Heuristic: a file we can read as text (everything in this repo is text).
 * @param {string} rel @returns {boolean} */
export function isTextFile(rel) {
  return !/\.(png|jpe?g|gif|ico|pdf|zip|woff2?|ttf)$/i.test(rel);
}

/** @param {string} rel @param {...string} exts @returns {boolean} */
export function hasExt(rel, ...exts) {
  return exts.some((e) => rel.toLowerCase().endsWith(e));
}

/** Pretty one-per-line offender list for assertion messages.
 * @param {string} label @param {ReadonlyArray<string>} offenders @returns {string} */
export function report(label, offenders) {
  return `${label} (${offenders.length}):\n  ${offenders.join('\n  ')}`;
}
