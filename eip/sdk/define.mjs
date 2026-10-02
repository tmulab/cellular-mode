// `definePlugin` is the only sanctioned way to author a manifest: it refuses an
// illegal contract at module load, long before a kernel exists, and it freezes
// what it returns so that no later composition can quietly rewrite a declaration.
import { ContractError } from './errors.mjs';
import { validateManifest } from './manifest.mjs';

/** @type {(value: unknown, seen?: WeakSet<object>) => unknown} */
function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

/**
 * Validate and freeze a plugin manifest.
 * @param {unknown} manifest the declaration to check
 * @returns {import('./types.mjs').Manifest} the same object, frozen
 * @throws {ContractError} with `details` = every `{path, message}` breach.
 */
export function definePlugin(manifest) {
  const { ok, errors } = validateManifest(manifest);
  if (!ok) {
    const where = errors.map((e) => (e.path === '' ? e.message : `${e.path}: ${e.message}`));
    throw new ContractError(
      `invalid plugin manifest (${errors.length} problem(s)): ${where.join('; ')}`,
      errors,
    );
  }
  // `apply` is a function and stays live; freezing the manifest freezes the
  // DECLARATION, not the behaviour it points at.
  // `validateManifest` has just proved every field of the contract; the assertion
  // records that proof rather than re-deriving it.
  const valid = /** @type {import('./types.mjs').Manifest} */ (manifest);
  for (const [key, value] of Object.entries(valid)) {
    if (key !== 'apply') deepFreeze(value);
  }
  return Object.freeze(valid);
}
