// The sandboxed `writeFile` PORT.
//
// A plugin declares `permissions: ['fs.write']`; this decides what that sentence
// is actually worth. The writable surface of the process is ONE directory, and the
// name a plugin may choose is a single safe segment — not a path. Everything the
// plugin sends is treated as hostile input, because "the plugin is ours" is not a
// security control.
//
// Two independent guards, in this order: the name is checked without touching the
// disk (pure, cheap, testable), then the resolved target is checked against the
// real directory (symlinks, races, surprises).
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { KernelError } from '../sdk/index.mjs';

/** One segment: letters, digits, dash, underscore, dot — never leading. */
export const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Always throws: naming `never` is what lets the checker see the guards below as
 * guards, and what stops a caller from treating a refusal as a value.
 * @type {(name: unknown, message: string) => never} */
const refuse = (name, message) => {
  throw new KernelError('PERMISSION_DENIED', `refused to write "${String(name)}": ${message}`, [
    { path: 'name', message },
  ]);
};

/**
 * PURE. Throws `PERMISSION_DENIED` unless `name` is a single safe file name.
 * Order matters for the error message, not for the verdict: every clause below
 * is independently sufficient to refuse.
 * @param {unknown} name @returns {string} the same name, once it is proved safe
 */
export function assertSafeSegment(name) {
  if (typeof name !== 'string' || name === '') refuse(name, 'a file name must be a non-empty string');
  if (name.includes('\0')) refuse(name, 'a file name may not contain a NUL byte');
  if (isAbsolute(name) || /^[A-Za-z]:/.test(name) || name.startsWith('/') || name.startsWith('\\')) {
    refuse(name, 'absolute paths are refused');
  }
  if (name.includes('/') || name.includes('\\')) refuse(name, 'path separators are refused');
  if (name === '.' || name === '..' || name.split(/[\\/]/).includes('..')) {
    refuse(name, 'parent-directory traversal is refused');
  }
  if (!SAFE_SEGMENT.test(name)) refuse(name, 'must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$');
  return name;
}

/**
 * The port descriptor the kernel grants to plugins declaring `fs.write`.
 * `fn(name, body)` writes `body` as UTF-8 under `reportsDir` and returns the
 * RELATIVE name: the API must not publish where the filesystem keeps things.
 * @param {string} reportsDir directory the host owns; created if absent
 */
export function createWritePort(reportsDir) {
  if (typeof reportsDir !== 'string' || reportsDir.trim() === '') {
    throw new TypeError('createWritePort needs a reportsDir');
  }
  const base = resolve(reportsDir);

  return {
    permission: 'fs.write',
    /** @param {unknown} name @param {unknown} body @returns {Promise<string>} */
    async fn(name, body) {
      const safe = assertSafeSegment(name);
      if (typeof body !== 'string') refuse(name, 'the body must be a string');
      await mkdir(base, { recursive: true });
      // realpath AFTER mkdir: if the directory itself is a link, containment is
      // checked against where it really is, not against the alias.
      const root = await realpath(base);
      const target = resolve(root, safe);
      if (!target.startsWith(root + sep)) refuse(name, 'resolved outside the reports directory');
      const existing = await lstat(target).catch(() => null);
      if (existing !== null && existing.isSymbolicLink()) {
        refuse(name, 'the target is a symbolic link');
      }
      if (existing !== null && !existing.isFile()) {
        refuse(name, 'the target exists and is not a regular file');
      }
      await writeFile(target, body, { encoding: 'utf8', flag: 'w' });
      return safe;
    },
  };
}
