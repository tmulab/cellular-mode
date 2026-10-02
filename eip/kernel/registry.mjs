// The registry: who declared what. No privileged core — the registry owns no
// behaviour, only the map from a key to the manifest that claims it.
import { KernelError, describeManifest, validateManifest } from '../sdk/index.mjs';

/** @typedef {import('../sdk/types.mjs').Manifest} Manifest */

/**
 * Pure: the required-inject path that closes a cycle, or `null`.
 * Only REQUIRED edges count. An optional edge is a degradation, never a knot:
 * two plugins may optionally want each other and both still load.
 * @param {Map<string, Manifest>} manifests @param {string} start
 * @returns {string[] | null}
 */
export function findRequiredCycle(manifests, start) {
  /** @type {string[]} */
  const path = [];
  /** @type {Set<string>} */
  const onPath = new Set();
  /** @type {Set<string>} */
  const settled = new Set();

  /** @type {(key: string) => string[] | null} */
  function walk(key) {
    if (onPath.has(key)) return [...path.slice(path.indexOf(key)), key];
    if (settled.has(key)) return null;
    const manifest = manifests.get(key);
    if (manifest === undefined) return null; // absence is DEPENDENCY_MISSING, not a cycle
    onPath.add(key);
    path.push(key);
    for (const [dep, spec] of Object.entries(manifest.inject ?? {})) {
      if (!spec.required) continue;
      const found = walk(dep);
      if (found !== null) return found;
    }
    path.pop();
    onPath.delete(key);
    settled.add(key);
    return null;
  }

  return walk(start);
}

/** Pure: required inject keys of `manifest` that are absent from `manifests`.
 * @param {Map<string, Manifest>} manifests @param {Manifest} manifest @returns {string[]}
 */
export function missingRequired(manifests, manifest) {
  return Object.entries(manifest.inject ?? {})
    .filter(([key, spec]) => spec.required && !manifests.has(key))
    .map(([key]) => key);
}

export function createRegistry() {
  /** @type {Map<string, Manifest>} */
  const manifests = new Map();

  /** @param {unknown} manifest @returns {string} the key it claims */
  function register(manifest) {
    const { ok, errors } = validateManifest(manifest);
    if (!ok) {
      const where = errors.map((e) => (e.path === '' ? e.message : `${e.path}: ${e.message}`));
      throw new KernelError(
        'CONTRACT_INVALID',
        `manifest rejected (${errors.length} problem(s)): ${where.join('; ')}`,
        errors,
      );
    }
    // `validateManifest` has just proved every field; the assertion records that.
    const valid = /** @type {Manifest} */ (manifest);
    if (manifests.has(valid.name)) {
      throw new KernelError(
        'DUPLICATE_KEY',
        `key "${valid.name}" is already registered — one key, one owner`,
        [{ path: 'name', message: 'already registered' }],
      );
    }
    manifests.set(valid.name, valid);
    return valid.name;
  }

  /** @param {string} key @returns {Manifest} */
  function get(key) {
    const manifest = manifests.get(key);
    if (manifest === undefined) {
      throw new KernelError('NOT_FOUND', `no plugin registered for key "${key}"`);
    }
    return manifest;
  }

  /** @type {(key: string) => boolean} */
  const has = (key) => manifests.has(key);

  /** Metadata only: no `apply`, no dev-UI body. Safe to serialise to a client. */
  const list = () => [...manifests.values()].map(describeManifest);

  /** Keys whose manifest declares `key` as a REQUIRED inject.
   * @type {(key: string) => string[]} */
  const dependentsOf = (key) => [...manifests.values()]
    .filter((m) => m.inject?.[key]?.required === true)
    .map((m) => m.name);

  return { register, get, has, list, dependentsOf, manifests };
}
