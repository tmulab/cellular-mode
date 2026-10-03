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
 * `verb` is the only thing that differs between a refused write and a refused read,
 * so the refusal itself is written once and both ports use it.
 * @type {(name: unknown, message: string, verb?: string) => never} */
export const refuseAccess = (name, message, verb = 'access') => {
  throw new KernelError('PERMISSION_DENIED', `refused to ${verb} "${String(name)}": ${message}`, [
    { path: 'name', message },
  ]);
};

/** @type {(name: unknown, message: string) => never} */
const refuse = (name, message) => refuseAccess(name, message, 'write');

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
 * The SECOND guard, shared by every path-confined port: the resolved target must
 * really live under the real base directory. "Really" is the word that matters —
 * `realpath` is applied to the base AND, when it exists, to the target, so a symbolic
 * link or a Windows junction anywhere in the chain cannot redirect the operation
 * outside the sandbox. Containment is a property of the filesystem, not of the string.
 *
 * Every segment has already been proved a single safe name by `assertSafeSegment`, so
 * this function never has to interpret a path.
 *
 * `assertSegment` exists for ONE caller: the repository read port, whose segment rule is
 * this one plus a single leading dot (`.claude/`, `.gitattributes` — handwritten files the
 * gates do check). It is a parameter rather than a second copy of this function, so there
 * stays exactly one confinement implementation in this host; the default is the strict rule,
 * so no existing caller changes and no caller can relax it by forgetting an argument.
 * @param {string} base the directory the host owns, already created if it must exist
 * @param {ReadonlyArray<string>} segments safe segments, in order
 * @param {unknown} name what the caller asked for, for the message
 * @param {string} [verb] 'read' | 'write', for the message
 * @param {(segment: unknown) => string} [assertSegment] the segment rule to apply
 * @returns {Promise<string>} the absolute target, once containment is proved
 */
export async function confinedTarget(base, segments, name, verb = 'access', assertSegment = assertSafeSegment) {
  for (const segment of segments) assertSegment(segment);
  const root = await realpath(base).catch(() => refuseAccess(name, 'the base directory does not exist', verb));
  const target = resolve(root, ...segments);
  if (!target.startsWith(root + sep)) refuseAccess(name, 'resolved outside the confined directory', verb);
  const existing = await lstat(target).catch(() => null);
  if (existing !== null && existing.isSymbolicLink()) {
    refuseAccess(name, 'the target is a symbolic link', verb);
  }
  if (existing !== null && !existing.isFile()) {
    refuseAccess(name, 'the target exists and is not a regular file', verb);
  }
  if (existing !== null) {
    // A junction on an INTERMEDIATE directory is invisible to `lstat` on the leaf:
    // only resolving the whole chain shows where the bytes actually are.
    const real = await realpath(target).catch(() => null);
    if (real !== null && !real.startsWith(root + sep)) {
      refuseAccess(name, 'the target resolves outside the confined directory', verb);
    }
  }
  return target;
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
      // mkdir BEFORE the containment check: `confinedTarget` realpaths the base, so
      // containment is checked against where the directory really is, not the alias.
      const target = await confinedTarget(base, [safe], name, 'write');
      await writeFile(target, body, { encoding: 'utf8', flag: 'w' });
      return safe;
    },
  };
}
