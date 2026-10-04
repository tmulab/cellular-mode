// The manifest contract: contract BEFORE code. Pure logic, no I/O.
//
// `validateManifest` is the single authority on what a plugin may declare. The
// kernel does not re-interpret it, and a host cannot soften it.
import { SDK_VERSION } from './version.mjs';
import { validateSchema } from './schema.mjs';

/** `domain.capability-key` — the name IS the key the plugin provides. */
export const KEY_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;
export const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
/** Semver, exported so no other layer has to restate it: one definition, not two. */
export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Closed list. A permission the kernel cannot name is a permission nobody granted. */
export const PERMISSIONS = Object.freeze([
  'fs.read', 'fs.write', 'net.outbound', 'process.spawn', 'clock', 'random',
]);

export const MAX_DEV_UI_BYTES = 64 * 1024;

const MANIFEST_FIELDS = Object.freeze([
  'name', 'version', 'sdk', 'description', 'inject', 'permissions',
  'config', 'capabilities', 'apply', 'devUi',
]);

/** @typedef {import('./types.mjs').SchemaError} SchemaError */
/** @typedef {import('./types.mjs').Raw} Raw */
/** @typedef {import('./types.mjs').Capability} Capability */
/** @typedef {import('./types.mjs').Manifest} Manifest */
/** @typedef {import('./types.mjs').ManifestDescription} ManifestDescription */

/** @type {(v: unknown) => v is Raw} */
const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @type {(path: string, message: string) => SchemaError} */
const err = (path, message) => ({ path, message });

/** @type {(m: Raw, out: SchemaError[]) => void} */
function checkIdentity(m, out) {
  if (typeof m.name !== 'string' || !KEY_PATTERN.test(m.name)) {
    out.push(err('name', 'name must be a key like "domain.capability-key"'));
  }
  if (typeof m.version !== 'string' || !SEMVER_PATTERN.test(m.version)) {
    out.push(err('version', 'version must be semver, e.g. "1.0.0"'));
  }
  if (m.sdk !== SDK_VERSION) {
    out.push(err('sdk', `sdk must be "${SDK_VERSION}", got ${JSON.stringify(m.sdk)}`));
  }
  if (typeof m.description !== 'string' || m.description.trim() === '') {
    out.push(err('description', 'description must be a non-empty string'));
  }
}

/** @type {(m: Raw, out: SchemaError[]) => void} */
function checkInject(m, out) {
  if (m.inject === undefined) return;
  if (!isPlain(m.inject)) {
    out.push(err('inject', 'inject must be an object of key -> {required}'));
    return;
  }
  for (const [key, spec] of Object.entries(m.inject)) {
    const at = `inject.${key}`;
    if (!KEY_PATTERN.test(key)) out.push(err(at, 'inject keys must be sibling capability keys'));
    if (key === m.name) out.push(err(at, 'a plugin cannot inject itself'));
    if (!isPlain(spec) || typeof spec.required !== 'boolean') {
      out.push(err(at, 'inject entries must be {required: boolean}'));
      continue;
    }
    for (const extra of Object.keys(spec)) {
      if (extra !== 'required') out.push(err(`${at}.${extra}`, 'only "required" is supported'));
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
function checkCapabilities(m, out) {
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
    if (typeof cap.consequential !== 'boolean') {
      out.push(err(`${at}.consequential`, 'consequential must be declared as a boolean'));
    }
    if (typeof cap.description !== 'string' || cap.description.trim() === '') {
      out.push(err(`${at}.description`, 'description must be a non-empty string'));
    }
    for (const side of ['input', 'output']) {
      if (cap[side] === undefined) {
        out.push(err(`${at}.${side}`, `${side} schema is required`));
      } else {
        out.push(...validateSchema(cap[side], `${at}.${side}`));
      }
    }
  }
}

/** @type {(m: Raw, out: SchemaError[]) => void} */
function checkDevUi(m, out) {
  if (m.devUi === undefined) return;
  if (!isPlain(m.devUi)) {
    out.push(err('devUi', 'devUi must be {title, html}'));
    return;
  }
  if (typeof m.devUi.title !== 'string' || m.devUi.title.trim() === '') {
    out.push(err('devUi.title', 'title must be a non-empty string'));
  }
  if (typeof m.devUi.html !== 'string') {
    out.push(err('devUi.html', 'html must be a string'));
  } else if (Buffer.byteLength(m.devUi.html, 'utf8') > MAX_DEV_UI_BYTES) {
    out.push(err('devUi.html', `html must be at most ${MAX_DEV_UI_BYTES} bytes`));
  }
}

/**
 * Validate a plugin manifest. Returns `{ok, errors:[{path, message}]}`.
 * Never throws for bad data — reporting every breach at once is what makes a
 * contract error fixable in one pass.
 * @param {unknown} manifest @returns {{ ok: boolean, errors: SchemaError[] }}
 */
export function validateManifest(manifest) {
  if (!isPlain(manifest)) {
    return { ok: false, errors: [err('', 'manifest must be an object')] };
  }
  const errors = [];
  for (const field of Object.keys(manifest)) {
    if (!MANIFEST_FIELDS.includes(field)) {
      errors.push(err(field, `unknown manifest field "${field}"`));
    }
  }
  checkIdentity(manifest, errors);
  checkInject(manifest, errors);
  checkPermissions(manifest, errors);
  if (manifest.config !== undefined) errors.push(...validateSchema(manifest.config, 'config'));
  checkCapabilities(manifest, errors);
  if (typeof manifest.apply !== 'function') {
    errors.push(err('apply', 'apply must be a function (ctx, config) -> service'));
  }
  checkDevUi(manifest, errors);
  return { ok: errors.length === 0, errors };
}

/**
 * Public metadata: the manifest minus the executable and minus the dev-UI body.
 * @param {Manifest} manifest
 * @returns {ManifestDescription}
 */
export function describeManifest(manifest) {
  const { name, version, sdk, description, inject, permissions, config, capabilities, devUi } = manifest;
  /** @type {Record<string, Capability>} */
  const caps = {};
  for (const [id, cap] of Object.entries(capabilities ?? {})) {
    caps[id] = {
      input: cap.input, output: cap.output,
      consequential: cap.consequential, description: cap.description,
    };
  }
  /** @type {ManifestDescription} */
  const out = {
    name, version, sdk, description,
    inject: { ...(inject ?? {}) },
    permissions: [...(permissions ?? [])],
    capabilities: caps,
  };
  if (config !== undefined) out.config = config;
  if (devUi !== undefined) out.devUi = { title: devUi.title };
  return out;
}
