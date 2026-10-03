// The path-confined `fs.read` PORTS over a Cellular Mode vault.
//
// A plugin declares `permissions: ['fs.read']`; this decides what that sentence is
// worth. The readable surface of the process is ONE directory — `<root>/vault/state`
// — and inside it a CLOSED SET of names: the four protocol files and
// `cells/<slug>.md`. A plugin cannot ask for "any file under the vault", because the
// method's file list is known and an open-ended reader is an open-ended reader.
//
// Two guards, in this order, exactly as the write port does it: the name is checked
// without touching the disk (pure, cheap, testable), then the resolved target is
// checked against the real directory by `confinedTarget` — the SAME helper, so there
// is one confinement rule in this host and not two that can drift apart.
//
// No path ever leaves through these ports: `readVault` answers TEXT and `listCells`
// answers SLUGS. The API must not publish where the filesystem keeps things.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { assertSafeSegment, confinedTarget, refuseAccess } from './write-port.mjs';

/** The four files the protocol defines at the root of `vault/state/`. */
export const VAULT_FILES = Object.freeze(['INDEX.md', 'CURRENT-CELL.md', 'log.md', 'parking-lot.md']);

/** A cell id, and therefore a cell file name. The same shape the API contract declares. */
export const CELL_SLUG = /^[a-z0-9-]{1,80}$/;

/** A vault file is Markdown written by hand or by the CLI, never a payload. */
export const MAX_READ_BYTES = 4 * 1024 * 1024;

/** `<root>/vault/state`, the one directory these ports can see. @type {(root: string) => string} */
export const stateDirOf = (root) => join(root, 'vault', 'state');

/** @type {(name: unknown, message: string) => never} */
const refuse = (name, message) => refuseAccess(name, message, 'read');

/**
 * PURE. The path segments a vault name denotes, or a refusal. The closed set IS the
 * validation: there is no pattern to outsmart, only a list to be on.
 * @param {unknown} name @returns {string[]} segments, relative to `vault/state`
 */
export function assertVaultName(name) {
  if (typeof name !== 'string' || name === '') refuse(name, 'a vault name must be a non-empty string');
  if (name.includes('\0')) refuse(name, 'a vault name may not contain a NUL byte');
  if (VAULT_FILES.includes(name)) return [name];
  const parts = name.split('/');
  const [dir, leaf] = parts;
  if (parts.length !== 2 || dir !== 'cells' || leaf === undefined) {
    refuse(name, `must be one of ${VAULT_FILES.join(', ')} or cells/<slug>.md`);
  }
  if (!leaf.endsWith('.md')) refuse(name, 'a cell file must end in .md');
  const slug = leaf.slice(0, -'.md'.length);
  // `assertSafeSegment` refuses separators, traversal, absolute and drive-letter
  // forms; `CELL_SLUG` then narrows it to the id shape the API contract declares.
  assertSafeSegment(slug);
  if (!CELL_SLUG.test(slug)) refuse(name, 'a cell slug must match ^[a-z0-9-]{1,80}$');
  return ['cells', leaf];
}

/**
 * The two port descriptors granted to a plugin declaring `fs.read`.
 *
 *   `readVault(name)` -> the file's text, or `null` when it does not exist. Absence is
 *     a VALUE: an incomplete vault is a normal state the observer must describe, while
 *     a refusal is an attempted escape and must never be confused with it.
 *   `listCells()`     -> the slugs of `cells/*.md`, sorted, `README` excluded.
 *
 * @param {string} root the project root; only `<root>/vault/state` becomes readable
 */
export function createVaultReadPorts(root) {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new TypeError('createVaultReadPorts needs a project root');
  }
  const base = stateDirOf(root);

  return Object.freeze({
    readVault: {
      permission: 'fs.read',
      /** @param {unknown} name @returns {Promise<string | null>} */
      async fn(name) {
        const segments = assertVaultName(name);
        /** @type {string | null} */
        let target = null;
        try {
          target = await confinedTarget(base, segments, name, 'read');
        } catch (cause) {
          // A missing vault, or a missing cells/ directory, is absence — not an
          // escape. Only the base-directory refusal can mean that here.
          const named = /** @type {{ details?: ReadonlyArray<{ message?: unknown }> }} */ (cause);
          if (named.details?.[0]?.message === 'the base directory does not exist') return null;
          throw cause;
        }
        const info = await stat(target).catch(() => null);
        if (info === null) return null;
        if (info.size > MAX_READ_BYTES) refuse(name, `is larger than ${MAX_READ_BYTES} bytes`);
        return readFile(target, 'utf8');
      },
    },
    listCells: {
      permission: 'fs.read',
      /** @returns {Promise<string[]>} */
      async fn() {
        const entries = await readdir(join(base, 'cells'), { withFileTypes: true }).catch(() => []);
        return entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
          .map((entry) => entry.name.slice(0, -'.md'.length))
          .filter((slug) => CELL_SLUG.test(slug))
          .sort();
      },
    },
  });
}
