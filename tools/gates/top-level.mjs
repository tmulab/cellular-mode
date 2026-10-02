// top-level.mjs — "can this module be imported safely?", as a pure function.
//
// WHY IT EXISTS: this repository has no build step, so the build leg of Trilateral
// Verification is a MODULE-LOAD gate - import every module and see that it resolves
// and parses. But importing an entry point RUNS it: `tools/cellmode/cli.mjs` would
// execute the CLI and set the process exit code, and `examples/text-stats/reproduce.mjs`
// would create and delete temporary directories. So entry points must be excluded,
// and the exclusion has to be a rule rather than a hand-kept list that rots.
//
// THE RULE (documented in tools/gates/README.md): a module is importable when its
// top level contains DECLARATIONS ONLY - import, export, const/let/var, function,
// class, type-ish lines, comments, blank lines. A module with an executable
// STATEMENT at top level (a call, an assignment to something it did not declare, a
// try block) is an entry point and is excluded - and COUNTED, so the report says how
// many modules were skipped instead of quietly shrinking.
//
// This is a heuristic, not a parser. It is deliberately conservative: a false
// "entry point" only skips a module from the gate; it never passes a broken one,
// because every skipped file still goes through the syntax check.

/** @typedef {import('./types.mjs').FileTuple} FileTuple */

/** Removes comments and string/template bodies so brace counting is not fooled.
 * @param {unknown} text @returns {string} */
export function stripNoise(text) {
  return String(text ?? '')
    .replace(/\\./g, '__')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:/])\/\/[^\n]*/gm, '$1')
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
}

const DECLARATION = /^(?:export\b|import\b|const\b|let\b|var\b|async\s+function\b|function\b|class\b|\}|\)|\]|,|;|#!)/;

/** @type {(line: string) => number} */
const depthDelta = (line) => {
  let d = 0;
  for (const ch of line) {
    if (ch === '{' || ch === '(' || ch === '[') d += 1;
    if (ch === '}' || ch === ')' || ch === ']') d -= 1;
  }
  return d;
};

/**
 * PURE. Returns the first top-level executable statement found, or `null`.
 * Reporting the offending line (not just a boolean) is what lets the gate explain
 * why it skipped a file.
 * @param {unknown} text @returns {{ line: number, source: string } | null}
 */
export function topLevelStatement(text) {
  const lines = stripNoise(text).split('\n');
  let depth = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (depth === 0 && trimmed !== '' && !DECLARATION.test(trimmed)) {
      return { line: i + 1, source: trimmed.slice(0, 80) };
    }
    depth += depthDelta(raw);
    if (depth < 0) depth = 0;
  }
  return null;
}

/** Convenience predicate.
 * @type {(text: unknown) => boolean} */
export const hasTopLevelSideEffects = (text) => topLevelStatement(text) !== null;

/** Test files are run by `node --test`, not by the load gate.
 * @type {(rel: string) => boolean} */
export const isTestFile = (rel) => /\.test\.mjs$/.test(rel);

/**
 * PURE. Splits candidate modules into what the load gate imports and what it skips.
 * `files` is `[{ path, text }]`.
 * @param {ReadonlyArray<FileTuple>} files
 * @returns {{ load: string[], skipped: Array<{ path: string, reason: string }> }}
 */
export function partitionModules(files) {
  /** @type {string[]} */
  const load = [];
  /** @type {Array<{ path: string, reason: string }>} */
  const skipped = [];
  for (const { path, text } of files) {
    if (!path.endsWith('.mjs')) continue;
    if (isTestFile(path)) {
      skipped.push({ path, reason: 'test file - executed by the tests leg' });
      continue;
    }
    const statement = topLevelStatement(text);
    if (statement) {
      skipped.push({ path, reason: `entry point - top-level statement at line ${statement.line}: ${statement.source}` });
      continue;
    }
    load.push(path);
  }
  return { load, skipped };
}
