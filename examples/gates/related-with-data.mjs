// Example light (commit-time) gate that is DATA-AWARE — the hole rule 4 of AGENTS.md closes.
//
// Field failure reproduced by the test beside this file: a commit-time gate built on
// `vitest related` (or any "changed source -> importing tests" selector) sees a staged
// `*.json` fixture as a leaf nobody imports, selects ZERO tests, and reports green while a
// test that READS that file is already broken. The full gate found it a day later.
//
// THE CRITERION — "a test that reads a data file D" (decided before coding, heuristic, static):
//   A test file T is a reader of D when the source text of T contains a string literal
//   (single, double or backtick quoted, no interpolation) whose value, normalised to `/`
//   and stripped of leading `./`, is a PATH-SUFFIX of D's repo-relative path: it equals
//   that path, or that path ends with `/` + the literal. Each hit is classified by what
//   stands immediately before it: `import` / `from` -> import, `require(` -> require, a
//   callee matching /read|load|open|fetch|parse|json/i -> read, anything else -> mention.
//   All four classes SELECT the test: a selector should fail open toward running one test
//   too many, never toward skipping one.
// BLIND SPOTS, named rather than hidden: a path assembled from a variable or two literals
//   (`join(DATA_DIR, name + '.json')`), reached through a helper in another module, a glob,
//   a whole-directory read. They are why GUARD directories ALWAYS run: the guard folder is
//   the floor the heuristic cannot lower, and what the light gate cannot reach, the FULL
//   gate must reach before delivery (AGENTS.md rule 4; docs/05-engineering-rules.md §3).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

/** Data extensions this example understands. JSON is the minimum; the list is DATA. */
export const DATA_EXTENSIONS = Object.freeze(['.json', '.ndjson', '.csv', '.yaml', '.yml']);

/** @param {string} p @returns {string} repo-relative path with `/` separators, no `./` */
export function normalise(p) {
  return p.split(sep).join('/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/** @param {string} p @returns {boolean} */
export function isDataFile(p) {
  const low = normalise(p).toLowerCase();
  return DATA_EXTENSIONS.some((ext) => low.endsWith(ext));
}

/** @param {string} p @returns {boolean} */
export function isTestFile(p) {
  return /\.test\.(mjs|cjs|js)$/.test(normalise(p));
}

/**
 * Path-suffix match, at a segment boundary. `data/users.json` is read by a literal
 * `../data/users.json`, by `data/users.json` and by `users.json`; never by
 * `other-users.json`.
 * @param {string} dataPath @param {string} literal @returns {boolean}
 */
export function pathSuffixMatch(dataPath, literal) {
  const target = normalise(dataPath);
  const lit = normalise(literal).replace(/^(\.\.\/)+/, '');
  if (!lit) return false;
  return target === lit || target.endsWith(`/${lit}`);
}

/** @typedef {{ value: string, index: number }} Literal */

/** @param {string} text @returns {Literal[]} string literals, interpolation-free */
export function stringLiterals(text) {
  /** @type {Literal[]} */
  const out = [];
  const re = /(['"`])([^'"`\n\\$]+)\1/g;
  for (const m of text.matchAll(re)) {
    const value = m[2];
    if (value !== undefined && m.index !== undefined) out.push({ value, index: m.index });
  }
  return out;
}

/** @typedef {'import' | 'require' | 'read' | 'mention'} Via */

/**
 * How the literal at `index` appears. Looks at the 60 characters before it only — a
 * documented window, not a parser.
 * @param {string} text @param {number} index @returns {Via}
 */
export function classify(text, index) {
  const before = text.slice(Math.max(0, index - 60), index);
  if (/\b(?:import|from)\s*\(?\s*$/.test(before)) return 'import';
  if (/\brequire\s*\(\s*$/.test(before)) return 'require';
  if (/\b[\w.]*(?:read|load|open|fetch|parse|json)[\w.]*\s*\([^()]*$/i.test(before)) return 'read';
  return 'mention';
}

/** @typedef {{ path: string, text: string }} SourceFile */
/** @typedef {{ test: string, via: Via }} Reader */

/**
 * Every test file that reads `dataPath`, by the criterion at the top of this file.
 * @param {string} dataPath @param {SourceFile[]} tests @returns {Reader[]}
 */
export function readersOf(dataPath, tests) {
  /** @type {Reader[]} */
  const out = [];
  for (const t of tests) {
    for (const lit of stringLiterals(t.text)) {
      if (!pathSuffixMatch(dataPath, lit.value)) continue;
      out.push({ test: normalise(t.path), via: classify(t.text, lit.index) });
      break;
    }
  }
  return out;
}

/** @param {string} root @param {string} dir @returns {string[]} repo-relative test files */
export function listTests(root, dir = '.') {
  /** @type {string[]} */
  const out = [];
  const abs = join(root, dir);
  for (const name of readdirSync(abs)) {
    if (name === 'node_modules' || name === '.git') continue;
    const child = join(abs, name);
    if (statSync(child).isDirectory()) out.push(...listTests(root, relative(root, child)));
    else if (isTestFile(name)) out.push(normalise(relative(root, child)));
  }
  return out;
}

/** @typedef {{ files: string[], reasons: string[] }} Selection */

/**
 * The selection a data-aware light gate must make: the staged tests themselves, every test
 * that reads a staged data file, every test that names a staged source file, and ALWAYS
 * every test under a guard directory.
 * @param {{ staged: string[], tests: SourceFile[], guardDirs?: string[] }} input
 * @returns {Selection}
 */
export function selectTests({ staged, tests, guardDirs = ['guard'] }) {
  /** @type {Map<string, string>} */
  const picked = new Map();
  const add = (/** @type {string} */ f, /** @type {string} */ why) => {
    if (!picked.has(f)) picked.set(f, why);
  };
  for (const t of tests) {
    const p = normalise(t.path);
    if (guardDirs.some((d) => p === normalise(d) || p.startsWith(`${normalise(d)}/`))) {
      add(p, 'guard directory (always runs)');
    }
  }
  for (const raw of staged) {
    const file = normalise(raw);
    if (isTestFile(file)) add(file, 'staged test file');
    else {
      const kind = isDataFile(file) ? 'data' : 'source';
      for (const r of readersOf(file, tests)) add(r.test, `reads ${kind} ${file} (${r.via})`);
    }
  }
  const files = [...picked.keys()].sort();
  return { files, reasons: files.map((f) => `${f} <- ${picked.get(f)}`) };
}

/** @typedef {{ ok: boolean, code: number, output: string, selection: Selection }} GateResult */

/**
 * Run the selection with `node --test`. Red when any selected test fails.
 * @param {{ root: string, staged: string[], guardDirs?: string[] }} input @returns {GateResult}
 */
export function runLightGate({ root, staged, guardDirs = ['guard'] }) {
  const tests = listTests(root).map((p) => ({ path: p, text: readFileSync(join(root, p), 'utf8') }));
  const selection = selectTests({ staged, tests, guardDirs });
  if (selection.files.length === 0) {
    return { ok: true, code: 0, output: 'no test selected', selection };
  }
  // NODE_TEST_CONTEXT must not be inherited: a `node --test` that believes it is already
  // inside a test run refuses to run files and exits 0 — a false green of the gate itself.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ['--test', ...selection.files], {
    cwd: root, encoding: 'utf8', env,
  });
  const code = run.status ?? 1;
  return { ok: code === 0, code, output: `${run.stdout ?? ''}${run.stderr ?? ''}`, selection };
}

/**
 * The gate the field used: data files are leaves nobody imports, so a change to one selects
 * nothing. Kept here as the control arm of the test beside this file — never as a model.
 * @param {{ root: string, staged: string[] }} input @returns {GateResult}
 */
export function runRelatedOnlyGate({ root, staged }) {
  const code = staged.filter((f) => !isDataFile(f));
  if (code.length === 0) {
    const selection = { files: [], reasons: ['no non-data file staged'] };
    return { ok: true, code: 0, output: 'nothing related', selection };
  }
  return runLightGate({ root, staged: code, guardDirs: [] });
}
