// The path-confined `fs.read` PORT over `.cellular/adaptive/` — the OPTIONAL adaptive state.
//
// Same shape as `read-port.mjs`, same two guards, the same single `confinedTarget` helper, and
// deliberately a SEPARATE port map: the directory a mode declaration lives in has nothing to do
// with the vault, and a reader that could see both would be a reader whose confinement is a
// sentence in a review rather than a property of the process.
//
// The readable surface is ONE directory and a CLOSED SET OF TWO NAMES:
//
//   session.json ....... the mode the human declared, and the window it applies in
//   preferences.json ... whether the module is enabled, and the declared TTL
//
// Everything else is refused BY NAME, including `injected.json` — the hook's own
// idempotence cache, which is nobody's business but the hook's. There is no pattern to
// outsmart here, only a list of two to be on.
//
// This port is created only by a composition that loads an `adaptive.*` plugin (see
// `observer-composition.mjs`): the privilege nobody needs is never built. It answers TEXT,
// never a path and never a parsed object — parsing belongs to the plugin, which owns the one
// implementation of the adaptive contract. And there is NO write counterpart, anywhere: a
// declaration is the human's to make, never a reader's.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { confinedTarget, refuseAccess } from './write-port.mjs';

/** The two files of the adaptive contract. The closed set IS the validation. */
export const ADAPTIVE_FILES = Object.freeze(['session.json', 'preferences.json']);

/** Two small JSON records written by the CLI, never a payload. */
export const MAX_ADAPTIVE_BYTES = 64 * 1024;

/** `<root>/.cellular/adaptive`, the one directory this port can see.
 * @type {(root: string) => string} */
export const adaptiveDirOf = (root) => join(root, '.cellular', 'adaptive');

/** @type {(name: unknown, message: string) => never} */
const refuse = (name, message) => refuseAccess(name, message, 'read');

/**
 * PURE. The single segment an adaptive name denotes, or a refusal.
 * @param {unknown} name @returns {string[]} segments, relative to `.cellular/adaptive`
 */
export function assertAdaptiveName(name) {
  if (typeof name !== 'string' || name === '') {
    refuse(name, 'an adaptive name must be a non-empty string');
  }
  if (name.includes('\0')) refuse(name, 'an adaptive name may not contain a NUL byte');
  if (!ADAPTIVE_FILES.includes(name)) {
    refuse(name, `must be one of ${ADAPTIVE_FILES.join(', ')}`);
  }
  return [name];
}

/**
 * The ONE port descriptor granted to a plugin declaring `fs.read` over the adaptive state.
 *
 *   `readAdaptive(name)` -> the file's text, or `null` when it does not exist.
 *
 * Absence is a VALUE, and here it is the COMMON case: no declaration at all is the default
 * state of the module, and a human who never typed a mode command must not look like an
 * error. A refusal is the opposite — an attempted escape — and the two are never confused.
 * @param {string} root the project root; only `<root>/.cellular/adaptive` becomes readable
 */
export function createAdaptiveReadPorts(root) {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new TypeError('createAdaptiveReadPorts needs a project root');
  }
  const base = adaptiveDirOf(root);

  return Object.freeze({
    readAdaptive: {
      permission: 'fs.read',
      /** @param {unknown} name @returns {Promise<string | null>} */
      async fn(name) {
        const segments = assertAdaptiveName(name);
        /** @type {string | null} */
        let target = null;
        try {
          target = await confinedTarget(base, segments, name, 'read');
        } catch (cause) {
          // The module having never been used is not an escape, and it is the normal state
          // of a checkout: `.cellular/adaptive/` simply does not exist yet.
          const named = /** @type {{ details?: ReadonlyArray<{ message?: unknown }> }} */ (cause);
          if (named.details?.[0]?.message === 'the base directory does not exist') return null;
          throw cause;
        }
        const info = await stat(target).catch(() => null);
        if (info === null) return null;
        if (info.size > MAX_ADAPTIVE_BYTES) refuse(name, `is larger than ${MAX_ADAPTIVE_BYTES} bytes`);
        return readFile(target, 'utf8');
      },
    },
  });
}
