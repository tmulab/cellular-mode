// cli-harness.mjs — the plumbing two CLI test files share: an in-process run, a throwaway
// root, a tree fingerprint and the absolute-path detector. Test plumbing, not product code.
//
// WHY IT IS A FIXTURE. `cli.test.mjs` and `cli-existing.test.mjs` ask different questions of the
// same CLI, and a helper living in whichever was written first would make the other import a
// `*.test.mjs` — which the runner would then execute twice. So the plumbing lives here, beside
// the scenarios it replays.
//
// It asserts nothing: it returns data, and the test files decide what the data has to say. It is
// imported DIRECTLY and deliberately not re-exported from `fixtures/index.mjs`: that module is
// data only, and routing this one through it would make every fixture import pull in the CLI.
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { main } from '../main.mjs';

/** A fixed clock, so two runs of the same script produce the same bytes. */
export const FIXED_ENV = Object.freeze({ CELLMODE_NOW: '2026-10-04 09:00' });

/** Shapes that must never appear in the CLI's output: a drive-letter path, or a path rooted at
 * one of the directories a machine keeps people and temporaries in. */
export const ABSOLUTE_SHAPES = Object.freeze([
  /[A-Za-z]:[\\/]/,
  /(?:^|[\s"'(=])\/(?:tmp|home|Users|var|private)\//,
]);

/** PURE. Every absolute-path shape `text` carries. @param {string} text @returns {string[]} */
export function absoluteHits(text) {
  return ABSOLUTE_SHAPES
    .map((shape) => shape.exec(text))
    .filter((match) => match !== null)
    .map((match) => String(match[0]));
}

/** One in-process run of the Builder's CLI. `--root` is appended, so a test never has to
 * remember it. @param {string[]} args @param {string} root
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ code: number, out: string, err: string, all: string }} */
export function runCli(args, root, env = FIXED_ENV) {
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const err = [];
  const code = main(['node', 'cli.mjs', ...args, '--root', root], {
    stdout: { write: (text) => out.push(String(text)) },
    stderr: { write: (text) => err.push(String(text)) },
    env,
  });
  const stdout = out.join('');
  const stderr = err.join('');
  return { code, out: stdout, err: stderr, all: `${stdout}${stderr}` };
}

/** A throwaway root under the system temporary directory. The caller keeps `created` and
 * removes each entry after a prefix check. @param {string} prefix @param {string[]} created
 * @returns {string} */
export function freshRoot(prefix, created) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  created.push(root);
  return root;
}

/** @type {(path: string) => string} */
const toPosix = (path) => path.split(sep).join('/');

/** Every file under `root` as `relative path -> sha-256`, so "nothing moved" is a comparison
 * of two objects rather than a walk written twice. Directories named in `skip` are not entered.
 * @param {string} root @param {ReadonlyArray<string>} [skip]
 * @returns {Record<string, string>} */
export function hashTree(root, skip = []) {
  const base = resolve(root);
  /** @type {Record<string, string>} */
  const out = {};
  /** @type {(dir: string) => void} */
  const walk = (dir) => {
    for (const item of readdirSync(dir).sort()) {
      const full = join(dir, item);
      const rel = toPosix(full.slice(base.length + 1));
      if (skip.some((name) => rel === name || rel.startsWith(`${name}/`))) continue;
      if (statSync(full).isDirectory()) walk(full);
      else out[rel] = createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  };
  walk(base);
  return out;
}
