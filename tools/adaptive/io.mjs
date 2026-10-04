// io.mjs — the ONLY module of Cellular Adaptive that touches a filesystem or stdin.
//
// Everything else here is arithmetic over values, which is why the rest can be tested without
// a temporary directory. Four rules govern this file.
//
// CONFINED. Every path comes from one root and a constant name, and `confine()` refuses
// anything that would leave `<root>/.cellular/adaptive/`. The state lives outside `vault/`
// deliberately: the vault records the work, and a preference true for one afternoon is not that.
//
// TOLERANT. A missing file is an absence. A malformed one is a REPORT — never repaired, never
// deleted, never read as an absence, because it is the human's file and "nothing was declared"
// is a different claim from "I could not read this".
//
// ATOMIC. Writes are renamed into place, so a reader never meets half a document.
// CANONICAL. A policy text is normalised to LF on the way in, and only that (`canonicalPolicy`).
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { SCHEMA_VERSION, validatePreferences } from './schema.mjs';

/** @typedef {import('./types.mjs').Preferences} Preferences */
/** @typedef {import('./types.mjs').SessionState} SessionState */

/** Where the state lives, relative to the project root. Already git-ignored via `.cellular/`. */
export const STATE_REL = '.cellular/adaptive';

/** Where the on-demand policy texts live, relative to the root. Read, never written. */
export const POLICY_REL = 'adaptive/policies';

/** The three file names, named once so `clear` and `adaptivePaths` cannot disagree. */
const FILES = Object.freeze(['session.json', 'preferences.json', 'injected.json']);

/** @type {(dir: string, name: string) => string} */
export function confine(dir, name) {
  const full = resolve(dir, name);
  if (full !== join(dir, name) || !full.startsWith(dir + sep)) {
    throw new Error(`refused: "${name}" would leave ${STATE_REL}`);
  }
  return full;
}

/** Every path this module may touch, from a single root. `injected.json` is reserved for the
 * context-injection cache of cell 4, not read or written here. @param {string} root */
export function adaptivePaths(root) {
  const base = resolve(root);
  const dir = join(base, '.cellular', 'adaptive');
  return {
    root: base,
    dir,
    session: confine(dir, String(FILES[0])),
    preferences: confine(dir, String(FILES[1])),
    injected: confine(dir, String(FILES[2])),
  };
}

/** @type {(file: string) => { content: string, missing: boolean, error: string | null }} */
function readText(file) {
  try {
    return { content: readFileSync(file, 'utf8'), missing: false, error: null };
  } catch (error) {
    const code = String(/** @type {{ code?: unknown }} */ (error)?.code ?? 'unreadable');
    if (code === 'ENOENT' || code === 'ENOTDIR') return { content: '', missing: true, error: null };
    return { content: '', missing: false, error: code };
  }
}

/** @type {(file: string, label: string) => { value: unknown, error: string | null }} */
function readJson(file, label) {
  const text = readText(file);
  if (text.missing) return { value: null, error: null };
  if (text.error !== null) return { value: null, error: `${label} could not be read (${text.error})` };
  try {
    return { value: JSON.parse(text.content), error: null };
  } catch {
    return { value: null, error: `${label} is not valid JSON` };
  }
}

/** @type {(file: string, value: unknown) => void} */
function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
}

/** The raw parsed session, or an absence, or a report. Validation is NOT performed here:
 * `validity.mjs` decides what the value means, this module only whether there was anything to
 * read. @param {string} root @returns {{ value: unknown, error: string | null }} */
export function readSession(root) {
  return readJson(adaptivePaths(root).session, `${STATE_REL}/session.json`);
}

/** The preference file, validated, so every consumer sees one shape with the defaults filled
 * in. An invalid file is an ERROR, not a fallback: quietly ignoring what somebody wrote is how
 * a setting stops meaning anything. @param {string} root
 * @returns {{ value: Preferences | null, error: string | null }} */
export function readPreferences(root) {
  const label = `${STATE_REL}/preferences.json`;
  const raw = readJson(adaptivePaths(root).preferences, label);
  if (raw.error !== null) return { value: null, error: raw.error };
  if (raw.value === null) return { value: null, error: null };
  const parsed = validatePreferences(raw.value);
  if (parsed.ok) return { value: parsed.value, error: null };
  const first = parsed.errors[0];
  const where = first ? ` (${first.path === '' ? 'file' : first.path}: ${first.message})` : '';
  return { value: null, error: `${label} is not a valid preference file${where}` };
}

/** CANONICAL. A line ending belongs to a CHECKOUT, not to a policy: `.gitattributes` commits
 * these files as LF and a Windows working copy may hold CRLF for the same bytes, while the
 * injected block is measured in bytes and its size documented. So: CRLF to LF, and NOTHING
 * else — a lone CR, a tab, a trailing space and a blank line are content and survive
 * (./policy-bytes.test.mjs). @type {(text: string) => string} */
const canonicalPolicy = (text) => text.split('\r\n').join('\n');

/** The on-demand policy texts, read from the PROJECT (`<root>/adaptive/policies/`) so an
 * adopting project may edit its own. An absent or unreadable file is REPORTED, never
 * substituted: `context.mjs` is never handed a silent blank.
 * @param {string} root @param {ReadonlyArray<string>} relPaths repository-relative paths
 * @returns {{ texts: Record<string, string>, missing: string[] }} */
export function readPolicyTexts(root, relPaths) {
  const dir = join(resolve(root), 'adaptive', 'policies');
  /** @type {Record<string, string>} */
  const texts = {};
  /** @type {string[]} */
  const missing = [];
  for (const rel of relPaths) {
    const name = rel.startsWith(`${POLICY_REL}/`) ? rel.slice(POLICY_REL.length + 1) : null;
    if (name === null || name.includes('/')) {
      missing.push(rel);
      continue;
    }
    // Normalised on the way in, so every consumer sees the canonical bytes.
    const read = readText(confine(dir, name));
    if (read.missing || read.error !== null) missing.push(rel);
    else texts[rel] = canonicalPolicy(read.content);
  }
  return { texts, missing };
}

/** @param {string} root @param {SessionState} session @returns {string} the path written */
export function writeSession(root, session) {
  writeJson(adaptivePaths(root).session, session);
  return `${STATE_REL}/session.json`;
}

/** Refuses to write anything the reader would reject — in particular a preference file carrying
 * a mode or any other condition key.
 * @param {string} root @param {Preferences} preferences @returns {string} the path written */
export function writePreferences(root, preferences) {
  const parsed = validatePreferences(preferences);
  if (!parsed.ok) {
    throw new Error(`refused: ${parsed.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`);
  }
  writeJson(adaptivePaths(root).preferences, parsed.value);
  return `${STATE_REL}/preferences.json`;
}

/** Stdin, or `''`: a hook that cannot read its own payload must still exit 0. @type {() => string} */
export const readStdinText = () => { try { return readFileSync(0, 'utf8'); } catch { return ''; } };

/** A short content hash: "is this the same block as last time?". @type {(text: string) => string} */
export const hashOf = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);

/** The injection cache: ONE entry, never a history. It answers a single question — was this
 * exact block already given to this session — so a log of what was injected when, which would
 * be a record about a person by another name, never has to exist. Hence no history here.
 * @param {string} root @returns {{ sessionId: string, hash: string }} */
export function readInjected(root) {
  const raw = readJson(adaptivePaths(root).injected, `${STATE_REL}/injected.json`).value;
  const v = /** @type {Record<string, unknown>} */ (typeof raw === 'object' && raw !== null ? raw : {});
  const str = (/** @type {unknown} */ x) => (typeof x === 'string' ? x : '');
  return { sessionId: str(v.sessionId), hash: str(v.hash) };
}

/** @param {string} root @param {string} sessionId @param {string} hash @returns {string} */
export function writeInjected(root, sessionId, hash) {
  writeJson(adaptivePaths(root).injected, { schema: SCHEMA_VERSION, sessionId, hash });
  return `${STATE_REL}/injected.json`;
}

/** @param {string} root @returns {boolean} whether there was anything to delete */
export function deleteSession(root) {
  const file = adaptivePaths(root).session;
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}

/** Deletes every file of the module and NAMES what it deleted. No backup: it is the human's
 * data. @param {string} root @returns {string[]} */
export function clear(root) {
  const { dir } = adaptivePaths(root);
  const present = FILES.filter((name) => existsSync(confine(dir, name)));
  for (const name of present) rmSync(confine(dir, name));
  return present.map((name) => `${STATE_REL}/${name}`);
}
