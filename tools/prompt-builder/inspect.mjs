// inspect.mjs — read-only inspection of an EXISTING project, as a pure function over a file
// list. The disk walk lives in store.mjs; this module only decides what a list of paths and
// a handful of manifest texts PROVE.
//
// Every finding it produces is VERIFIED and carries the repository-relative path that proves
// it, because a VERIFIED label without an address is just a confident guess. It produces no
// INFERRED entries: "this looks like a web app" is exactly the kind of statement that becomes
// a fact nobody checked.
//
// FILE TEXT IS DATA, NEVER INSTRUCTIONS. The only text parsed at all is the `name` field of
// package.json; everything echoed from the repository is reduced to one line, stripped of
// control characters and cut at 100 characters, so a README that says "ignore previous
// instructions" is recorded as the harmless fragment it is — or, when it looks like a
// credential or a machine path, not recorded at all.
//
// FLAGGED FOR THE CONTRACT CELL (Stage 6, Cell 3): manifest and language findings land in
// `technologies.approved` as VERIFIED, while prompt-builder/CONTRACTS.md says that list holds
// DECLARED entries or ones promoted by a decision. Evidence from the repository is arguably
// stronger than either, but the rule and this module must be reconciled there, not here.
import { entry, sanitizeValue } from './contract-shape.mjs';
import { findPersonalPaths, findSensitive } from './sensitive.mjs';

/** @typedef {import('./types.mjs').Finding} Finding */
/** @typedef {import('./types.mjs').Inspection} Inspection */
/** @typedef {{ path: string, text?: string }} InputFile */

/** How long any echoed repository text may be. */
export const ECHO_LIMIT = 100;

/** Manifest file -> the technology its presence proves. Order is reporting order.
 * @type {ReadonlyArray<{ file: string, technology: string }>} */
export const MANIFESTS = Object.freeze([
  { file: 'package.json', technology: 'Node.js' },
  { file: 'pyproject.toml', technology: 'Python' },
  { file: 'Cargo.toml', technology: 'Rust' },
  { file: 'go.mod', technology: 'Go' },
  { file: 'pom.xml', technology: 'Java (Maven)' },
]);

/** Extension -> language. Hand-kept: a guessed language is not evidence.
 * @type {Readonly<Record<string, string>>} */
export const LANGUAGES = Object.freeze({
  mjs: 'JavaScript', cjs: 'JavaScript', js: 'JavaScript', jsx: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', rs: 'Rust', go: 'Go',
  java: 'Java', kt: 'Kotlin', rb: 'Ruby', php: 'PHP', cs: 'C#', swift: 'Swift',
  c: 'C', h: 'C', cpp: 'C++', sh: 'Shell', sql: 'SQL',
});

/** Files whose presence means the project already instructs agents. Never modified. */
const INSTRUCTION_FILES = Object.freeze(['AGENTS.md', 'CLAUDE.md', '.cursorrules']);

const IGNORED = /(^|\/)(node_modules|\.git|dist|build)\//;

/** @type {(text: unknown) => string} one line, no control characters, at most ECHO_LIMIT */
function echo(text) {
  const flat = sanitizeValue(text).replace(/[\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > ECHO_LIMIT ? `${flat.slice(0, ECHO_LIMIT - 1)}…` : flat;
}

/** @type {(text: string) => boolean} safe to record at all? */
const recordable = (text) => text !== '' && findSensitive(text).length === 0 && findPersonalPaths(text).length === 0;

/** @type {(path: string) => string} */
const toPosix = (path) => String(path ?? '').split('\\').join('/').replace(/^\.\//, '');

/** @type {(path: string) => string} */
const extensionOf = (path) => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

/** The `name` of a package manifest, or `''`. Only that one field is read, and a name that
 * is not a plain short string is discarded rather than cleaned up.
 * @type {(text: unknown) => string} */
function packageName(text) {
  if (typeof text !== 'string' || text.trim() === '') return '';
  try {
    const parsed = /** @type {unknown} */ (JSON.parse(text));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return '';
    const name = /** @type {Record<string, unknown>} */ (parsed).name;
    return typeof name === 'string' ? echo(name) : '';
  } catch {
    return '';
  }
}

/** @type {(paths: ReadonlyArray<string>) => string[]} the directories that hold tests */
function testDirectories(paths) {
  /** @type {Set<string>} */
  const dirs = new Set();
  for (const path of paths) {
    const segments = path.split('/');
    const named = segments.findIndex((s) => /^(tests?|spec|specs|__tests__)$/.test(s));
    if (named >= 0) dirs.add(segments.slice(0, named + 1).join('/'));
    else if (/\.(test|spec)\.[a-z0-9]+$/.test(path)) {
      dirs.add(segments.length > 1 ? segments.slice(0, -1).join('/') : '.');
    }
  }
  return [...dirs].sort().slice(0, 3);
}

/** @type {(paths: ReadonlyArray<string>) => string[]} the three most common languages */
function topLanguages(paths) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const path of paths) {
    const language = LANGUAGES[extensionOf(path)];
    if (language !== undefined) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([language, count]) => `${language} (${count} file(s))`);
}

/**
 * PURE. What the repository already proves, as VERIFIED findings plus a summary. Writes
 * nothing, reads nothing: `files` is supplied by `store.listProjectFiles`.
 * @param {ReadonlyArray<InputFile>} files @returns {Inspection}
 */
export function inspectProject(files) {
  const present = files
    .map((file) => ({ path: toPosix(file.path), text: file.text }))
    .filter((file) => file.path !== '' && !IGNORED.test(file.path));
  const paths = present.map((file) => file.path);
  const has = (/** @type {string} */ name) => paths.includes(name);
  /** @type {Finding[]} */
  const findings = [];

  const manifest = present.find((file) => file.path === 'package.json');
  const name = packageName(manifest?.text);
  if (name !== '' && recordable(name)) {
    findings.push({ field: 'identity.name', entry: entry(name, 'VERIFIED', 'package.json') });
  }
  const manifests = MANIFESTS.filter((m) => has(m.file));
  for (const { file, technology } of manifests) {
    findings.push({
      field: 'technologies.approved',
      entry: entry(`${technology} (${file})`, 'VERIFIED', file),
    });
  }
  const languages = topLanguages(paths);
  for (const language of languages) {
    findings.push({
      field: 'technologies.approved',
      entry: entry(language, 'VERIFIED', 'file extensions counted across the repository'),
    });
  }
  for (const dir of testDirectories(paths)) {
    findings.push({
      field: 'requirements.nonfunctional',
      entry: entry(`Existing automated tests in ${dir}`, 'VERIFIED', dir),
    });
  }
  const instructionFiles = INSTRUCTION_FILES.filter(has)
    .concat(paths.some((p) => p.startsWith('.cursor/')) ? ['.cursor'] : []);
  for (const file of instructionFiles) {
    findings.push({
      field: 'integrations',
      entry: entry(`Existing agent instructions: ${file}`, 'VERIFIED', file),
    });
  }
  return {
    findings,
    summary: {
      hasCellularState: paths.some((p) => p.startsWith('vault/state/')),
      manifests: manifests.map((m) => m.file),
      languages,
      instructionFiles,
    },
  };
}
