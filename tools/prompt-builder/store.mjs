// store.mjs — the ONLY module of the Builder that touches the filesystem, the same
// arrangement tools/cellmode/state.mjs has for the vault. Everything next door is pure and
// therefore testable without inventing a repository on disk.
//
// Three promises, each enforced here rather than remembered:
//   1. THE BUILDER WRITES IN TWO NAMED PLACES ONLY. Every write resolves inside
//      `<root>/vault/builder/` (the draft) or `<root>/vault/` (the approved contract),
//      checked by resolve + prefix (the idiom of tools/gates/removal-rehearsal.mjs), so a
//      crafted name cannot escape.
//   2. A FILE IS REPLACED, NEVER HALF-WRITTEN. Write to a temporary name beside it, then
//      rename: a crash leaves either the old document or the new one.
//   3. THE PROJECT IS ONLY EVER READ. `listProjectFiles` walks with a file cap and a depth
//      cap, NEVER follows a symlink, skips what is not ours, and reads TEXT for four small
//      manifests only. Every read is bounded before the bytes load — see ./store-read.mjs.
// The vault is not re-parsed here: `readCellState` reads `vault/state/INDEX.md` through
// cellmode's own parser. A second parser of that table would be a second opinion about the
// project's history, and the log is the only one allowed.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { parseIndex } from '../cellmode/index-table.mjs';
import { statePaths } from '../cellmode/paths.mjs';
import { BuilderError, CODES } from './errors.mjs';
import { isDraft } from './draft.mjs';
import { assertPublishable } from './publication.mjs';
import { manifestText, readDocument } from './store-read.mjs';
import { validateContract, validateDraft } from './validate.mjs';

/** @typedef {import('./types.mjs').CellState} CellState */
/** @typedef {import('./types.mjs').Draft} Draft */
/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */
/** @typedef {{ path: string, text?: string }} ProjectFile */

export const BUILDER_REL = 'vault/builder';
export const DRAFT_FILE = 'draft.json';
export const CONTRACT_REL = 'vault/project-contract.json';

/** Never walked: not ours, generated, or the Builder's own scratchpad. */
const SKIP_DIRS = Object.freeze(['node_modules', '.git', 'dist', 'build', '.cellular']);
/** @type {(path: string) => string} */
const toPosix = (path) => path.split(sep).join('/');

/** The Builder's directory inside `root`. @param {string} root @returns {string} */
export function builderDir(root) {
  return join(resolve(root), 'vault', 'builder');
}

/** A path inside `<root>/vault/builder/`, or a refusal. The check is on the RESOLVED path, so
 * `..`, an absolute name and a symlink-shaped string are judged by where they end up.
 * @param {string} root @param {string} name @returns {string} */
export function builderPath(root, name) {
  const base = builderDir(root);
  const target = resolve(base, name);
  if (target !== base && !target.startsWith(base + sep)) {
    throw new BuilderError(CODES.OUTSIDE_ROOT, `the Builder only writes inside ${BUILDER_REL}/ — refused "${name}"`);
  }
  return target;
}

/** Reads the draft, or `null` when there is none. A file that is not a version-1 draft the
 * SCHEMA accepts is a refusal and not an empty draft: overwriting somebody's hand-edited file
 * silently is worse than stopping. @param {string} root @returns {Draft | null} */
export function readDraft(root) {
  const file = builderPath(root, DRAFT_FILE);
  if (!existsSync(file)) return null;
  const label = `${BUILDER_REL}/${DRAFT_FILE}`;
  const parsed = readDocument(file, CODES.BAD_DRAFT, label);
  if (!isDraft(parsed)) throw new BuilderError(CODES.BAD_DRAFT, `${label} is not a version-1 builder draft`);
  const schema = validateDraft(parsed);
  if (!schema.ok) {
    throw new BuilderError(CODES.BAD_DRAFT, `${label} is one the schema refuses: ${schema.errors.length} error(s)`, { errors: schema.errors });
  }
  return /** @type {Draft} */ (parsed);
}

/** Replace-or-nothing: a temporary name beside the target, then a rename.
 * @type {(file: string, data: unknown) => string} */
function writeJson(file, data) {
  const temporary = `${file}.tmp`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
  return file;
}

/** Writes the draft atomically. @param {string} root @param {Draft} draft @returns {string} */
export function writeDraft(root, draft) {
  if (!isDraft(draft)) throw new BuilderError(CODES.BAD_DRAFT, 'refusing to write a value that is not a version-1 builder draft');
  return writeJson(builderPath(root, DRAFT_FILE), draft);
}

/** A path inside `<root>/vault/`, or a refusal — same resolve-and-compare as `builderPath`.
 * The approved contract lives beside `state/` and `builder/`, not inside either.
 * @param {string} root @param {string} name @returns {string} */
export function vaultPath(root, name) {
  const base = join(resolve(root), 'vault');
  const target = resolve(base, name);
  if (!target.startsWith(base + sep)) {
    throw new BuilderError(CODES.OUTSIDE_ROOT, `the Builder only writes inside vault/ — refused "${name}"`);
  }
  return target;
}

/** Reads `vault/project-contract.json`, or `null` when there is none. A file that is not a
 * version-1 contract is a refusal, never an empty contract.
 * @param {string} root @returns {ProjectContract | null} */
export function readContract(root) {
  const file = vaultPath(root, 'project-contract.json');
  if (!existsSync(file)) return null;
  const parsed = readDocument(file, CODES.BAD_CONTRACT, CONTRACT_REL);
  const schema = validateContract(parsed);
  if (!schema.ok) {
    throw new BuilderError(CODES.BAD_CONTRACT, `${CONTRACT_REL} is one the schema refuses: ${schema.errors.length} error(s)`, { errors: schema.errors });
  }
  return /** @type {ProjectContract} */ (parsed);
}

/** Writes the approved contract atomically — and re-asks both questions FIRST, through
 * `assertPublishable`. This is the last code that runs before the bytes exist, and a gate
 * enforced only upstream is a gate with a bypass. Fails closed: on any finding, nothing is
 * written at all. @param {string} root @param {ProjectContract} contract @returns {string} */
export function writeContract(root, contract) {
  assertPublishable(contract, `${CONTRACT_REL}`);
  return writeJson(vaultPath(root, 'project-contract.json'), contract);
}

/** READ-ONLY. The project's files as repository-relative POSIX paths, with text for the four
 * manifests only. Both caps are limits on THIS tool rather than on the project: a discovery
 * step that walks a million files is a mistake regardless of what it would have found.
 * @param {string} root @param {{ maxFiles?: number, maxDepth?: number }} [limits]
 * @returns {ProjectFile[]} */
export function listProjectFiles(root, limits = {}) {
  const maxFiles = limits.maxFiles ?? 2000;
  const maxDepth = limits.maxDepth ?? 6;
  const base = resolve(root);
  /** @type {ProjectFile[]} */
  const out = [];
  /** @type {(dir: string, depth: number) => void} */
  const walk = (dir, depth) => {
    if (depth > maxDepth || out.length >= maxFiles) return;
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= maxFiles) return;
      const full = join(dir, item.name);
      const rel = toPosix(full.slice(base.length + 1));
      if (item.isDirectory()) {
        if (SKIP_DIRS.includes(item.name) || rel === BUILDER_REL) continue;
        walk(full, depth + 1);
      } else if (item.isFile()) {
        const text = manifestText(dir, item.name);
        out.push(text === undefined ? { path: rel } : { path: rel, text });
      }
    }
  };
  walk(base, 0);
  return out;
}

/** READ-ONLY. What `vault/state/` says about cells, through cellmode's own index parser. The
 * Builder asks this one question and never writes an answer: cells are created, activated and
 * closed by the cellmode transitions only. @param {string} root @returns {CellState} */
export function readCellState(root) {
  const paths = statePaths(resolve(root));
  if (!existsSync(paths.state)) return { exists: false, active: null, paused: [] };
  if (!existsSync(paths.index)) return { exists: true, active: null, paused: [] };
  const rows = parseIndex(readFileSync(paths.index, 'utf8'));
  const active = rows.find((row) => row.status === '🔵');
  return {
    exists: true,
    active: active === undefined ? null : active.name,
    paused: rows.filter((row) => row.status === '⏸').map((row) => row.name),
  };
}
