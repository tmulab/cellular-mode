// fixtures/temp.mjs — the TEST-ONLY helper that gives a test a real, disposable target directory.
// Under `fixtures/`, which is the suffix every component manifest excludes, so it is never copied
// into anybody's project.
//
// THE PREFIX CHECK IS THE POINT. `rmSync(recursive)` is the most destructive call in this suite, so
// the path it is given is proven twice before it runs: it must sit inside `os.tmpdir()` and its
// basename must start with the prefix this helper created it with. A test that ever pointed cleanup
// at the repository would delete the repository, and "it obviously will not" is not a safeguard.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

/** Every temporary root this helper hands out starts with this. */
export const PREFIX = 'cellular-bootstrap-';

/** A fresh empty directory under the OS temp dir. @param {string} [tag] @returns {string} */
export function makeTarget(tag = 'target') {
  return mkdtempSync(join(tmpdir(), `${PREFIX}${tag}-`));
}

/** A fresh root with a sub-directory inside it, for `new <dir>` where the ROOT must exist but the
 * mkdtemp name must stay the thing cleanup recognises. @param {string} [tag]
 * @returns {{ root: string, target: string, name: string }} */
export function makeProject(tag = 'project') {
  const root = makeTarget(tag);
  const name = 'demo-app';
  const target = join(root, name);
  mkdirSync(target);
  return { root, target, name };
}

/** Removes a directory this helper created — and refuses anything else, loudly.
 * @param {string} dir @returns {void} */
export function cleanup(dir) {
  const absolute = resolve(dir);
  const temp = resolve(tmpdir());
  if (!absolute.startsWith(temp) || !basename(absolute).startsWith(PREFIX)) {
    throw new Error(`refusing to remove ${basename(absolute)}: not a directory this helper created`);
  }
  rmSync(absolute, { recursive: true, force: true });
}

/** A single hash over every path AND every byte of a tree: the way a test proves `--dry-run` wrote
 * nothing. Directory names are included, so a created empty directory changes it too.
 * @param {string} dir @returns {string} */
export function treeHash(dir) {
  const hash = createHash('sha256');
  /** @param {string} rel @returns {void} */
  const walk = (rel) => {
    const here = rel === '' ? dir : join(dir, rel);
    for (const entry of readdirSync(here, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      hash.update(`${child}\n`);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) hash.update(readFileSync(join(dir, child)));
    }
  };
  if (!statSync(dir).isDirectory()) throw new Error('treeHash needs a directory');
  walk('');
  return hash.digest('hex');
}

/** Every file of a tree, as sorted `/`-separated relative paths. @param {string} dir
 * @returns {string[]} */
export function listFiles(dir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} rel @returns {void} */
  const walk = (rel) => {
    for (const entry of readdirSync(rel === '' ? dir : join(dir, rel), { withFileTypes: true })) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) out.push(child);
    }
  };
  walk('');
  return out.sort((a, b) => (a < b ? -1 : 1));
}
