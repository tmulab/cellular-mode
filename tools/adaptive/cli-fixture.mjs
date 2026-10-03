// Shared fixture for the adaptive CLI tests. Not a test file: the name does not match the
// `node --test` discovery patterns, and it asserts nothing.
//
// It exists because the CLI suite reached the 200-line rule and split in two
// (`cli.test.mjs` for usage and declaration, `cli-state.test.mjs` for persistence and
// standing). Two copies of the same temporary-directory setup would have been two things to
// keep in step, and the one that drifts is always the one nobody runs.
//
// Every root it builds contains a `vault/`, so any test can prove the vault was not touched:
// a module about temporary preferences has no business writing to the authoritative record,
// and "we never write there" is only a claim until something hashes the bytes.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { adaptivePaths } from './io.mjs';
import { main } from './main.mjs';

export const NOW = '2026-10-03T14:02:00.000Z';
export const UNTIL = '2026-10-03T18:02:00.000Z';
export const LATER = '2026-10-03T19:00:00.000Z';
export const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));

/** A throwaway project root with a vault in it. @returns {string} */
export function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'cellular-adaptive-cli-'));
  mkdirSync(join(root, 'vault', 'state'), { recursive: true });
  writeFileSync(join(root, 'vault', 'state', 'log.md'), '# log\n', 'utf8');
  return root;
}

/** @type {(root: string) => string} */
export const vaultHash = (root) => createHash('sha256')
  .update(readFileSync(join(root, 'vault', 'state', 'log.md'))).digest('hex');

/** Runs the CLI in-process with a fixed clock, capturing both streams.
 * @type {(root: string, args: string[], now?: string) => { code: number, out: string, err: string }} */
export function run(root, args, now = NOW) {
  let out = '';
  let err = '';
  const code = main(['node', 'cli.mjs', ...args, '--root', root], {
    stdout: { write: (text) => { out += text; return true; } },
    stderr: { write: (text) => { err += text; return true; } },
    env: { ADAPTIVE_NOW: now },
  });
  return { code, out, err };
}

/** @type {(root: string) => unknown} */
export const storedSession = (root) => JSON.parse(readFileSync(adaptivePaths(root).session, 'utf8'));

/** Copies this repository's policy texts into a throwaway root, because `context` reads them
 * from the PROJECT: an adopting project may edit its own, so the CLI must not read ours.
 * @type {(root: string) => void} */
export function copyPolicies(root) {
  const from = fileURLToPath(new URL('../../adaptive/policies/', import.meta.url));
  const to = join(root, 'adaptive', 'policies');
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) copyFileSync(join(from, name), join(to, name));
}
