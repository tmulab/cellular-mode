#!/usr/bin/env node
// reproduce.mjs — the vault in ./vault/state/ is not hand-written. It is the
// output of the command sequence below, replayed in a fresh temporary directory
// with a fixed clock.
//
//   node examples/text-stats/reproduce.mjs           verify (exit 0 identical, 1 drifted)
//   node examples/text-stats/reproduce.mjs --write    regenerate the committed vault
//
// Line endings are normalized before comparing: git on Windows may check the
// committed Markdown out with CRLF, and that is not a drift in the state.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', '..', 'tools', 'cellmode', 'cli.mjs');
const COMMITTED = join(HERE, 'vault', 'state');

const WORD_AREA = 'examples/text-stats/src/text-stats.mjs';

// [fixed clock, ...cellmode arguments] — the whole story of the example.
/** @type {Array<[string, string[]]>} */
const SCRIPT = [
  ['2026-03-02 09:00', ['init']],

  // Cell 1 — opened and finished in one sitting.
  ['2026-03-02 09:05', ['open', 'Word count',
    '--area', WORD_AREA,
    '--objective', 'Count the words in a string, Unicode whitespace included.',
    '--in', 'countWords() in src/text-stats.mjs + test/word-count.test.mjs',
    '--out', 'reading time, sentence count, language detection, a CLI',
    '--done', 'node --test green + a non-breaking space separates two words']],
  ['2026-03-02 09:40', ['complete',
    '--facts', 'Added countWords() to examples/text-stats/src/text-stats.mjs; '
      + '5 criteria in examples/text-stats/test/word-count.test.mjs, all green.',
    '--decisions', 'Split on \\p{White_Space} (+ BOM), not on /\\s/: the ideographic '
      + 'space must separate words. Punctuation stays glued to its word. '
      + 'A non-string throws TypeError instead of returning 0.',
    '--build', 'green',
    '--confirm']],

  // Cell 2 — opened, interrupted mid-way, resumed the next day.
  ['2026-03-03 08:10', ['open', 'Reading time',
    '--area', WORD_AREA,
    '--objective', 'Turn a word count into minutes of reading, rounded up.',
    '--in', 'readingTime() in src/text-stats.mjs + contracts/reading-time.md',
    '--out', 'CJK character counting, sentence splitting, HTML stripping',
    '--done', 'node --test green + the input/minutes table in the contract matches']],
  ['2026-03-03 08:28', ['park', 'Support CJK character counting (reading speed in '
    + 'Chinese/Japanese is characters per minute, not words per minute)']],
  ['2026-03-03 08:35', ['pause',
    '--facts', 'Wrote examples/text-stats/contracts/reading-time.md (question, '
      + 'pre-committed decisions, expected input/minutes table, C1-C4) and '
      + 'examples/text-stats/test/reading-time.test.mjs. readingTime() is not '
      + 'implemented yet in src/text-stats.mjs.',
    '--decisions', 'Round up with Math.ceil (a started minute is a whole minute); '
      + '0 words = 0 minutes, not 1; wpm default 200.',
    '--build', 'red (TypeError: readingTime is not a function)',
    '--next', 'run `node --test "examples/text-stats/test/reading-time.test.mjs"` '
      + 'and read the first error',
    '--note', 'Stopping with the tests already red is the cheapest bookmark there is.']],

  // Cell 3 — planned, never opened. No log entry: it never ran.
  ['2026-03-03 08:38', ['plan', 'Sentence count',
    '--area', WORD_AREA,
    '--objective', 'Count sentences, handling abbreviations and ellipses.']],

  // Back to cell 2.
  ['2026-03-04 07:50', ['resume', 'Reading time']],
  ['2026-03-04 08:25', ['complete',
    '--facts', 'Implemented readingTime() in examples/text-stats/src/text-stats.mjs; '
      + 'C1-C4 green in examples/text-stats/test/reading-time.test.mjs; each '
      + 'criterion proved red by one mutation, recorded in the contract verdict.',
    '--decisions', 'Kept the parked CJK idea out of scope: words-per-minute is the '
      + 'declared boundary of this cell.',
    '--build', 'green',
    '--confirm']],
];

/** @type {(root: string, now: string, args: string[]) => string} */
function cellmode(root, now, args) {
  try {
    return execFileSync(process.execPath, [CLI, ...args, '--root', root], {
      encoding: 'utf8',
      env: { ...process.env, CELLMODE_NOW: now },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    // execFileSync throws an Error carrying the child's status and streams.
    const failure = /** @type {{ status?: unknown, stdout?: unknown, stderr?: unknown }} */ (cause);
    const code = typeof failure.status === 'number' ? failure.status : 1;
    throw new Error(`cellmode ${args[0]} failed (exit ${code})\n${failure.stderr || failure.stdout || ''}`);
  }
}

/** @param {string} root */
function replay(root) {
  for (const [now, args] of SCRIPT) cellmode(root, now, args);
  // The example's own integrity guard: the replayed state must be consistent.
  cellmode(root, '2026-03-04 08:30', ['check']);
}

/** @type {(dir: string, base?: string) => string[]} */
function walk(dir, base = dir) {
  /** @type {string[]} */
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
}

/** @type {(text: string) => string} */
const normalize = (text) => text.replace(/\r\n/g, '\n');

/** @type {(dir: string, rel: string) => string | null} */
function read(dir, rel) {
  try {
    return normalize(readFileSync(join(dir, rel), 'utf8'));
  } catch {
    return null;
  }
}

// Returns the first difference as a string, or null when the two trees match.
/** @type {(expected: string, actual: string) => string | null} */
function diff(expected, actual) {
  const files = [...new Set([...walk(expected), ...walk(actual)])].sort();
  for (const rel of files) {
    const a = read(expected, rel);
    const b = read(actual, rel);
    if (a === null) return `${rel}: missing from the committed vault`;
    if (b === null) return `${rel}: missing from the replayed vault`;
    if (a !== b) {
      const left = a.split('\n');
      const right = b.split('\n');
      const i = left.findIndex((line, n) => line !== right[n]);
      return `${rel}: differs at line ${i + 1}\n`
        + `  committed: ${JSON.stringify(left[i] ?? null)}\n`
        + `  replayed:  ${JSON.stringify(right[i] ?? null)}`;
    }
  }
  return null;
}

/** @param {string[]} argv @returns {number} */
function main(argv) {
  const write = argv.includes('--write');
  const unknown = argv.filter((a) => a !== '--write');
  if (unknown.length) {
    process.stderr.write(`usage: node reproduce.mjs [--write]\n`);
    return 1;
  }
  const root = mkdtempSync(join(tmpdir(), 'text-stats-'));
  try {
    replay(root);
    const replayed = join(root, 'vault', 'state');
    if (write) {
      rmSync(COMMITTED, { recursive: true, force: true });
      mkdirSync(dirname(COMMITTED), { recursive: true });
      cpSync(replayed, COMMITTED, { recursive: true });
      const n = walk(COMMITTED).length;
      process.stdout.write(`wrote ${n} files to examples/text-stats/vault/state/\n`);
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

process.exitCode = main(process.argv.slice(2));
