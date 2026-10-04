// The UPP manifest contract: contract BEFORE code, and the same contract in every language.
//
// `validateUppManifest` is the single authority on what an external plugin may declare. It
// reuses the SDK rather than restating it — `KEY_PATTERN`, `CAPABILITY_ID_PATTERN`,
// `SEMVER_PATTERN`, `PERMISSIONS` and `validateSchema` are IMPORTED, so there is one key
// format in this repository and not two that drift.
//
// Unknown keys are REJECTED everywhere except inside `extensions`. That asymmetry is the
// whole forward-compatibility story: with no tolerant container every addition breaks a
// peer, and with tolerance anywhere a typo in `permissions` or `entry` becomes silent.
import {
  CAPABILITY_ID_PATTERN, KEY_PATTERN, PERMISSIONS, SEMVER_PATTERN, validateSchema,
} from '../sdk/index.mjs';
import { SUPPORTED_PROTOCOL_VERSIONS } from './version.mjs';
import {
  RUNTIMES, checkApplication, checkEntry, checkHealth, checkLifecycle,
} from './sections.mjs';

/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */
/** @typedef {Record<string, unknown>} Raw */

/** Every field a UPP manifest may carry. A field not on this list is a breach. */
export const UPP_MANIFEST_FIELDS = Object.freeze([
  'upp', 'id', 'version', 'description', 'type', 'runtime', 'entry', 'capabilities',
  'permissions', 'dependencies', 'config', 'health', 'lifecycle', 'application', 'extensions',
]);

export const UPP_MANIFEST_TYPES = Object.freeze(['capability', 'application']);

/** What a capability object may hold. Stricter than the SDK's, deliberately: a capability is
 * the thing that gets INVOKED, so an unrecognised member of it is not a comment. */
export const CAPABILITY_KEYS = Object.freeze([
  'input', 'output', 'consequential', 'description',
]);

export const MAX_DESCRIPTION_LENGTH = 1024;

/** @type {(v: unknown) => v is Raw} */
const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @type {(path: string, message: string) => SchemaError} */
const err = (path, message) => ({ path, message });

/** @type {(m: Raw, out: SchemaError[]) => void} */
function checkIdentity(m, out) {
  if (typeof m.upp !== 'string' || !SUPPORTED_PROTOCOL_VERSIONS.includes(m.upp)) {
    out.push(err('upp', `upp must be one of ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`));
  }
  if (typeof m.id !== 'string' || !KEY_PATTERN.test(m.id)) {
    out.push(err('id', 'id must be a key like "domain.capability-key" — the SDK key format'));
  }
  if (typeof m.version !== 'string' || !SEMVER_PATTERN.test(m.version)) {
    out.push(err('version', 'version must be semver, e.g. "1.0.0"'));
  }
  if (typeof m.description !== 'string' || m.description.trim() === '') {
    out.push(err('description', 'description must be a non-empty string'));
  } else if (m.description.length > MAX_DESCRIPTION_LENGTH) {
    out.push(err('description', `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`));
  }
  if (!UPP_MANIFEST_TYPES.includes(/** @type {string} */ (m.type))) {
    out.push(err('type', `type must be one of ${UPP_MANIFEST_TYPES.join(', ')}`));
  }
  if (!RUNTIMES.includes(/** @type {string} */ (m.runtime))) {
    out.push(err('runtime', `runtime must be one of ${RUNTIMES.join(', ')}`));
  }
}

/** @type {(m: Raw, out: SchemaError[]) => void} */
function checkCapabilities(m, out) {
  // An APPLICATION provides no in-process capabilities: it runs on its own and talks to the
  // system as a CLIENT of the HTTP API. Declaring none is therefore the honest answer, and
  // the only legal one — an app that also provides capabilities ships a second, ordinary
  // capability manifest, so identity never implies in-process execution.
  if (m.type === 'application') {
    if (!isPlain(m.capabilities) || Object.keys(m.capabilities).length > 0) {
      out.push(err('capabilities',
        'an application declares capabilities: {} — a provider of capabilities is a separate manifest'));
    }
    return;
  }
  if (!isPlain(m.capabilities) || Object.keys(m.capabilities).length === 0) {
    out.push(err('capabilities', 'at least one capability must be declared'));
    return;
  }
  for (const [id, cap] of Object.entries(m.capabilities)) {
    const at = `capabilities.${id}`;
    if (!CAPABILITY_ID_PATTERN.test(id)) {
      out.push(err(at, 'capability ids are lower-case dashed words'));
    }
    if (!isPlain(cap)) {
      out.push(err(at, 'a capability must be an object'));
      continue;
    }
    for (const key of Object.keys(cap)) {
      if (!CAPABILITY_KEYS.includes(key)) out.push(err(`${at}.${key}`, `unknown key "${key}"`));
    }
    if (typeof cap.consequential !== 'boolean') {
      out.push(err(`${at}.consequential`, 'consequential must be declared as a boolean'));
    }
    if (typeof cap.description !== 'string' || cap.description.trim() === '') {
      out.push(err(`${at}.description`, 'description must be a non-empty string'));
    }
    for (const side of ['input', 'output']) {
      if (cap[side] === undefined) out.push(err(`${at}.${side}`, `${side} schema is required`));
      else out.push(...validateSchema(cap[side], `${at}.${side}`));
    }
  }
}

/** @type {(m: Raw, out: SchemaError[]) => void} */
function checkPermissions(m, out) {
  if (m.permissions === undefined) return;
  if (!Array.isArray(m.permissions)) {
    out.push(err('permissions', 'permissions must be an array'));
    return;
  }
  const seen = new Set();
  m.permissions.forEach((p, i) => {
    if (!PERMISSIONS.includes(p)) {
      out.push(err(`permissions.${i}`, `unknown permission ${JSON.stringify(p)}`));
    } else if (seen.has(p)) {
      out.push(err(`permissions.${i}`, `duplicate permission "${p}"`));
    }
    seen.add(p);
  });
}

/** @type {(m: Raw, out: SchemaError[]) => void} */
function checkDependencies(m, out) {
  if (m.dependencies === undefined) return;
  if (!isPlain(m.dependencies)) {
    out.push(err('dependencies', 'dependencies must be an object of key -> {required}'));
    return;
  }
  for (const [key, spec] of Object.entries(m.dependencies)) {
    const at = `dependencies.${key}`;
    if (!KEY_PATTERN.test(key)) out.push(err(at, 'dependency keys must be sibling plugin keys'));
    if (key === m.id) out.push(err(at, 'a plugin cannot depend on itself'));
    if (!isPlain(spec) || typeof spec.required !== 'boolean') {
      out.push(err(at, 'dependency entries must be {required: boolean}'));
      continue;
    }
    for (const extra of Object.keys(spec)) {
      if (extra !== 'required') out.push(err(`${at}.${extra}`, 'only "required" is supported'));
    }
  }
}

/**
 * Validate a UPP manifest. Returns `{ok, errors:[{path, message}]}` and NEVER throws for bad
 * data: reporting every breach at once is what makes a contract error fixable in one pass.
 * @param {unknown} manifest @returns {{ ok: boolean, errors: SchemaError[] }}
 */
export function validateUppManifest(manifest) {
  if (!isPlain(manifest)) {
    return { ok: false, errors: [err('', 'manifest must be an object')] };
  }
  /** @type {SchemaError[]} */
  const errors = [];
  for (const field of Object.keys(manifest)) {
    if (!UPP_MANIFEST_FIELDS.includes(field)) {
      errors.push(err(field, `unknown manifest field "${field}"`));
    }
  }
  checkIdentity(manifest, errors);
  checkEntry(manifest.entry, manifest.runtime, errors);
  checkCapabilities(manifest, errors);
  checkPermissions(manifest, errors);
  checkDependencies(manifest, errors);
  if (manifest.config !== undefined) errors.push(...validateSchema(manifest.config, 'config'));
  checkHealth(manifest.health, manifest.runtime, errors);
  checkLifecycle(manifest.lifecycle, errors);
  checkApplication(manifest.application, manifest.type, errors);
  // `extensions` is the ONE tolerant container: its keys are whatever a later MINOR added,
  // so only its shape is checked. Everything above rejected what it did not recognise.
  if (manifest.extensions !== undefined && !isPlain(manifest.extensions)) {
    errors.push(err('extensions', 'extensions must be an object'));
  }
  return { ok: errors.length === 0, errors };
}

/** The thrown form, for a caller that would rather fail at load than branch.
 * @param {unknown} manifest @returns {Raw} the same object, frozen */
export function assertUppManifest(manifest) {
  const { ok, errors } = validateUppManifest(manifest);
  if (!ok) {
    const where = errors.map((e) => (e.path === '' ? e.message : `${e.path}: ${e.message}`));
    throw new TypeError(`invalid UPP manifest (${errors.length} problem(s)): ${where.join('; ')}`);
  }
  return Object.freeze(/** @type {Raw} */ (manifest));
}
