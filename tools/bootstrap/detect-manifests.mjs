// detect-manifests.mjs — the small, KNOWN manifests analysis is allowed to read, and nothing else.
//
// Reading a target's files is a privilege, so it is spent narrowly. Only the handful of filenames
// in `KNOWN_MANIFESTS` are read at all; each read is confined by `writer.confine` and capped at
// `MAX_MANIFEST` bytes; and the only thing that may be SHOWN from a manifest is a
// `summaryOf` — one sanitized line of at most `SUMMARY_CAP` characters. A project's build file can
// hold a registry token or a private URL, and a report that echoed it would publish it.
//
// TOTAL, never throwing: a manifest that is absent, too large, unreadable or malformed is `null`,
// which downstream reads as UNKNOWN. A parse that failed is not an empty project.
//
// TOML and Gradle are NOT parsed. They are searched for known tool NAMES, which is why everything
// derived from them is labelled INFERRED and never VERIFIED.
import { sanitize } from './display.mjs';
import { readIfPresent } from './writer.mjs';

/** @typedef {{ scripts: Readonly<Record<string, string>>,
 *   dependencies: ReadonlyArray<string> }} PackageFacts */

/** The biggest manifest Bootstrap will read. A package.json or a pom.xml is kilobytes; a quarter
 * of a megabyte is generous and still bounded. */
export const MAX_MANIFEST = 256 * 1024;

/** How much of a manifest may ever appear in a report. */
export const SUMMARY_CAP = 100;

/** Every manifest filename analysis may open, as data. A name absent from this list is never read,
 * however interesting it looks. */
export const KNOWN_MANIFESTS = Object.freeze([
  'package.json', 'pyproject.toml', 'setup.cfg', 'requirements.txt', 'Cargo.toml', 'go.mod',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'Makefile', 'CMakeLists.txt', 'tsconfig.json',
  '.eslintrc', '.eslintrc.json', 'eslint.config.mjs', 'eslint.config.js', 'lefthook.yml',
  '.pre-commit-config.yaml',
]);

/**
 * The text of one known manifest, or `null`. TOTAL by design: every failure mode — absent, too
 * large, a directory, unreadable, not on the known list — is the same answer, UNKNOWN.
 * @param {string} targetRoot @param {string} rel @param {number} [maxBytes] @returns {string | null}
 */
export function readManifest(targetRoot, rel, maxBytes = MAX_MANIFEST) {
  const base = rel.includes('/') ? String(rel.split('/').pop()) : rel;
  if (!KNOWN_MANIFESTS.includes(base) && !base.endsWith('.csproj')) return null;
  try {
    return readIfPresent(targetRoot, rel, maxBytes);
  } catch {
    return null;
  }
}

/** PURE. One sanitized line, capped, safe to print. The ONLY form in which manifest text may
 * reach a human. @param {string | null} text @returns {string} */
export function summaryOf(text) {
  if (typeof text !== 'string') return '(not read)';
  const flat = text.replace(/\s+/g, ' ').trim();
  return sanitize(flat, SUMMARY_CAP);
}

/**
 * PURE and TOTAL. The two things planning needs from a `package.json`: its scripts, and the names
 * of its dependencies. Values that are not strings are dropped rather than coerced — a script
 * whose value is an object is not a command.
 * @param {string | null} text @returns {PackageFacts | null}
 */
export function packageFacts(text) {
  if (typeof text !== 'string') return null;
  /** @type {Record<string, unknown>} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  /** @type {Record<string, string>} */
  const scripts = {};
  const declared = parsed.scripts;
  if (typeof declared === 'object' && declared !== null && !Array.isArray(declared)) {
    for (const [name, value] of Object.entries(declared)) {
      if (typeof value === 'string') scripts[name] = value;
    }
  }
  /** @type {Set<string>} */
  const dependencies = new Set();
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const block = parsed[key];
    if (typeof block !== 'object' || block === null || Array.isArray(block)) continue;
    for (const name of Object.keys(block)) dependencies.add(name);
  }
  return Object.freeze({
    scripts: Object.freeze(scripts),
    dependencies: Object.freeze([...dependencies].sort()),
  });
}

/** PURE. Whether a token appears in some manifest text, case-insensitively and as a whole word.
 * A substring test would find `ruff` inside `truffle`. A `.` IS a boundary, because TOML spells a
 * table `[lints.clippy]` and a dotted key is how half of these tools are configured.
 * @param {string | null} text @param {string} token @returns {boolean} */
export function mentions(text, token) {
  if (typeof text !== 'string' || text === '') return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Za-z0-9_-])${escaped}(?:[^A-Za-z0-9_-]|$)`, 'i').test(text);
}

/** PURE. The phony-free target names a Makefile declares, in file order, capped. A target is a
 * line-initial name followed by `:` that is not `:=`.
 * @param {string | null} text @param {number} [cap] @returns {ReadonlyArray<string>} */
export function makeTargets(text, cap = 60) {
  if (typeof text !== 'string') return Object.freeze([]);
  /** @type {string[]} */
  const out = [];
  const pattern = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)[ \t]*:(?![=:])/gm;
  for (const found of text.matchAll(pattern)) {
    const name = String(found[1]);
    if (name !== '.PHONY' && !out.includes(name)) out.push(name);
    if (out.length >= cap) break;
  }
  return Object.freeze(out);
}

/** PURE. Whether any `scripts` value mentions a token — how `node --test`, `jest` or `tsc` is
 * found when the tool is not a declared dependency.
 * @param {PackageFacts | null} facts @param {string} token @returns {boolean} */
export function scriptMentions(facts, token) {
  if (facts === null) return false;
  return Object.values(facts.scripts).some((value) => mentions(value, token));
}
