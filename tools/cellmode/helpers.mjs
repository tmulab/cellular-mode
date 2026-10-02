// helpers.mjs — shared test plumbing (not a test file, so `node --test` skips it).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statePaths } from './paths.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const CLI = join(HERE, 'cli.mjs');
export const REPO_ROOT = join(HERE, '..', '..');
export const NOW = '2026-10-02 09:00';

export function freshRoot() {
  return mkdtempSync(join(tmpdir(), 'cellmode-'));
}

// Runs the real CLI in a child process with a fixed clock.
/** @param {string} root @param {string[]} args
 * @param {{ now?: string, expect?: number | null }} [options] */
export function run(root, args, { now = NOW, expect = 0 } = {}) {
  const result = { status: 0, stdout: '', stderr: '' };
  try {
    result.stdout = execFileSync(process.execPath, [CLI, ...args, '--root', root], {
      encoding: 'utf8',
      env: { ...process.env, CELLMODE_NOW: now },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    // execFileSync throws an Error carrying the child's status and streams.
    const failure = /** @type {{ status?: unknown, stdout?: unknown, stderr?: unknown }} */ (cause);
    result.status = typeof failure.status === 'number' ? failure.status : 1;
    result.stdout = String(failure.stdout ?? '');
    result.stderr = String(failure.stderr ?? '');
  }
  if (expect !== null && result.status !== expect) {
    throw new Error(`expected exit ${expect} from \`${args.join(' ')}\`, got ${result.status}\n`
      + `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
  }
  return result;
}

export const paths = statePaths;

/** The state files are addressed by the key names `statePaths` uses, plus the one
 * nested path; reading them through one lookup keeps the test helper honest about
 * what it does not know.
 * @type {(root: string, key: string) => string} */
const stateFile = (root, key) => {
  const p = statePaths(root);
  if (key === 'cells/README.md') return join(p.cells, 'README.md');
  const named = /** @type {Record<string, unknown>} */ (p)[key];
  if (typeof named !== 'string') throw new Error(`no state file named "${key}"`);
  return named;
};

/** The text of one state file. An absent file is a test failure, not a value: every
 * caller here is asserting on CONTENT, and `null` would only turn a clear failure
 * into a confusing one.
 * @param {string} root @param {string} key @returns {string} */
export function readState(root, key) {
  const file = stateFile(root, key);
  assert.ok(existsSync(file), `expected a state file at ${key}`);
  return readFileSync(file, 'utf8');
}

/** The text of one cell file, asserted to exist. `readCellText` keeps the nullable
 * answer for the one test that asks whether a cell file exists at all.
 * @param {string} root @param {string} slug @returns {string} */
export function cellText(root, slug) {
  const text = readCellText(root, slug);
  assert.ok(text !== null, `expected a cell file for "${slug}"`);
  return text;
}

/** @param {string} root @param {string} slug @returns {string | null} */
export function readCellText(root, slug) {
  const file = statePaths(root).cellFile(slug);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/** @param {string} root @param {string} key @param {string} text */
export function overwrite(root, key, text) {
  writeFileSync(stateFile(root, key), text, 'utf8');
}

/** @param {unknown} text @returns {string[]} */
export function lines(text) {
  return String(text).split('\n').filter((l) => l.trim() !== '');
}
