#!/usr/bin/env node
// reproduce.mjs — the vault in ./vault/state/ is not hand-written. It is the output
// of `script.mjs`, replayed by the real CLI in a fresh temporary directory under a
// fixed clock.
//
//   node examples/observer-demo/reproduce.mjs           verify (0 identical, 1 drifted)
//   node examples/observer-demo/reproduce.mjs --write   regenerate the committed vault
//
// Line endings are normalized before comparing: git on Windows may check the
// committed Markdown out with CRLF, and that is not a drift in the state.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_AT, SCRIPT } from './script.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', '..', 'tools', 'cellmode', 'cli.mjs');
const COMMITTED = join(HERE, 'vault', 'state');

/** One CLI invocation with a fixed clock. A non-zero exit is a hard failure: a
 * reproduction that tolerates a failed command reproduces nothing.
 * @type {(root: string, now: string, args: string[]) => string} */
function cellmode(root, now, args) {
  try {
    return execFileSync(process.execPath, [CLI, ...args, '--root', root], {
      encoding: 'utf8',
      env: { ...process.env, CELLMODE_NOW: now },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    const failure = /** @type {{ status?: unknown, stdout?: unknown, stderr?: unknown }} */ (cause);
    const code = typeof failure.status === 'number' ? failure.status : 1;
    throw new Error(`cellmode ${args[0]} failed (exit ${code})\n${failure.stderr || failure.stdout || ''}`);
  }
}

/** Replay the whole story into `root`, then prove the result is consistent.
 * @param {string} root @returns {string} the state directory of the replay */
export function replay(root) {
  for (const [now, args] of SCRIPT) cellmode(root, now, args);
  cellmode(root, CHECK_AT, ['check']);
  return join(root, 'vault', 'state');
}

/** A fresh temporary vault, for a caller that will remove it itself.
 * @returns {{ root: string, state: string }} */
export function replayToTemp() {
  const root = mkdtempSync(join(tmpdir(), 'observer-demo-'));
  return { root, state: replay(root) };
}

/** @type {(dir: string, base?: string) => string[]} */
function walk(dir, base = dir) {
  /** @type {string[]} */
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
}

/** @type {(dir: string, rel: string) => string | null} */
function read(dir, rel) {
  try {
    return readFileSync(join(dir, rel), 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

/** The first difference between two trees, or `null` when they match.
 * @type {(expected: string, actual: string) => string | null} */
export function diff(expected, actual) {
  for (const rel of [...new Set([...walk(expected), ...walk(actual)])].sort()) {
    const a = read(expected, rel);
    const b = read(actual, rel);
    if (a === null) return `${rel}: missing from the committed vault`;
    if (b === null) return `${rel}: missing from the replayed vault`;
    if (a !== b) {
      const left = a.split('\n');
      const right = b.split('\n');
      const i = left.findIndex((line, n) => line !== right[n]);
      return `${rel}: differs at line ${i + 1}\n  committed: ${JSON.stringify(left[i] ?? null)}\n`
        + `  replayed:  ${JSON.stringify(right[i] ?? null)}`;
    }
  }
  return null;
}

/** @param {string[]} argv @returns {number} */
function main(argv) {
  const write = argv.includes('--write');
  if (argv.filter((a) => a !== '--write').length) {
    process.stderr.write('usage: node reproduce.mjs [--write]\n');
    return 1;
  }
  const root = mkdtempSync(join(tmpdir(), 'observer-demo-'));
  try {
    const replayed = replay(root);
    if (write) {
      rmSync(COMMITTED, { recursive: true, force: true });
      mkdirSync(dirname(COMMITTED), { recursive: true });
      cpSync(replayed, COMMITTED, { recursive: true });
      process.stdout.write(`wrote ${walk(COMMITTED).length} files to examples/observer-demo/vault/state/\n`);
      return 0;
    }
    const found = diff(COMMITTED, replayed);
    if (found) {
      process.stderr.write(`vault drift: ${found}\n`
        + 'Re-run with --write if the replayed state is the one you want.\n');
      return 1;
    }
    process.stdout.write(`vault reproduced: ${walk(COMMITTED).length} files identical, `
      + `${SCRIPT.length} commands, check exit 0\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('reproduce.mjs')) {
  process.exitCode = main(process.argv.slice(2));
}
