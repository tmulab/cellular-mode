// The only module here that reads disk: operator configuration and the pinned manifests.
//
// It is a thin shell on purpose. Every decision it makes was already made by a pure
// function — `validateUppConfig` for the authorisation file, `validateUppManifest` for the
// manifest, `manifestDigest` for the pin — so what remains is: read the bytes, parse them,
// and REFUSE with a structured error. No repair, no default path, no directory scan.
//
// Refusals are `UppError` objects rather than exceptions because a host composing several
// plugins must be able to report "three authorised, one refused and why" instead of dying
// on the first bad entry.
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve as resolvePath } from 'node:path';
import { JSONRPC_CODES, UPP_CODES, assertUppManifest, uppError, validateUppManifest } from '../upp/index.mjs';
import { authorizationFor, timeoutsOf, validateUppConfig } from './config.mjs';
import { applicationAuthorizationFor } from './app-config.mjs';
import { digestsMatch, manifestDigest } from './canonical.mjs';

/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */
/** @typedef {import('../upp/errors.mjs').UppError} UppError */
/** @typedef {Record<string, unknown>} Raw */
/** @typedef {{ ok: true, value: T } | { ok: false, error: UppError }} Loaded @template T */

/** @type {(code: number, message: string, details?: SchemaError[]) => { ok: false, error: UppError }} */
const refuse = (code, message, details = []) => Object.freeze({ ok: false, error: uppError(code, message, details) });

/** @type {(path: string, label: string) => Loaded<unknown>} */
const bad = (path, label) => refuse(JSONRPC_CODES.PARSE_ERROR, `${label} is not valid JSON: ${path}`,
  [{ path, message: 'nothing was loaded' }]);

/** @param {string} path @param {string} label @returns {Promise<Loaded<unknown>>} */
async function readJson(path, label) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (cause) {
    return refuse(UPP_CODES.PLUGIN_UNAVAILABLE, `${label} could not be read: ${path}`,
      [{ path, message: String(cause) }]);
  }
  try {
    return Object.freeze({ ok: true, value: JSON.parse(text) });
  } catch {
    return /** @type {{ ok: false, error: UppError }} */ (bad(path, label));
  }
}

/**
 * Read and validate `upp.config.json`. The path comes from the host OPERATOR — it is never
 * discovered — and is resolved against `baseDir` so a relative path in a script means what
 * the operator sees in their shell.
 * @param {string} configPath @param {{ baseDir?: string }} [options]
 * @returns {Promise<Loaded<{ path: string, dir: string, config: Raw }>>}
 */
export async function loadUppConfig(configPath, { baseDir = process.cwd() } = {}) {
  if (typeof configPath !== 'string' || configPath.trim() === '') {
    return refuse(JSONRPC_CODES.INVALID_PARAMS, 'the operator must name the upp.config.json path',
      [{ path: 'configPath', message: 'missing' }]);
  }
  const path = isAbsolute(configPath) ? configPath : resolvePath(baseDir, configPath);
  const read = await readJson(path, 'upp.config.json');
  if (!read.ok) return read;
  const verdict = validateUppConfig(read.value);
  if (!verdict.ok) {
    return refuse(JSONRPC_CODES.INVALID_PARAMS,
      `upp.config.json is invalid (${verdict.errors.length} problem(s)): ${path}`, verdict.errors);
  }
  const dir = resolvePath(path, '..');
  return Object.freeze({ ok: true, value: { path, dir, config: /** @type {Raw} */ (read.value) } });
}

/**
 * The authorisation for `id`, with its pinned manifest proved against `manifestSha256`.
 *
 * Three refusals, in this order, and none of them is recoverable by the plugin: the id is
 * not listed (nothing is spawned or contacted); the manifest does not validate; the digest
 * of its canonical form differs from the pin (a swapped plugin under a reviewed identity).
 *
 * @param {{ dir: string, config: Raw }} loaded the result of `loadUppConfig`
 * @param {string} id
 * @returns {Promise<Loaded<{ entry: Raw, manifest: Raw, digest: string,
 *   dir: string, timeouts: { startupMs: number, requestMs: number, shutdownMs: number } }>>}
 */
export async function authorizePlugin(loaded, id) {
  const entry = authorizationFor(loaded.config, id);
  if (entry === null) {
    return refuse(UPP_CODES.CAPABILITY_NOT_AUTHORIZED,
      `"${String(id)}" is not listed in upp.config.json — it is never spawned and never contacted`,
      [{ path: 'plugins', message: 'no authorisation for this id' }]);
  }
  const proved = await provePinnedManifest(loaded, entry, id);
  if (!proved.ok) return proved;
  const { manifest, digest, manifestPath } = proved.value;
  const dir = entry.cwd === undefined ? resolvePath(manifestPath, '..') : resolvePath(loaded.dir, String(entry.cwd));
  return Object.freeze({
    ok: true,
    value: { entry, manifest, digest, dir, timeouts: timeoutsOf(entry) },
  });
}

/** The three refusals shared by every authorisation, in this order and none of them
 * recoverable by the plugin: the manifest does not validate; it declares another id; the
 * digest of its canonical form differs from the pin (a swapped artefact under a reviewed
 * identity). One copy, because a second one would eventually be the lenient one.
 * @param {{ dir: string }} loaded @param {Raw} entry @param {string} id
 * @returns {Promise<Loaded<{ manifest: Raw, digest: string, manifestPath: string }>>} */
async function provePinnedManifest(loaded, entry, id) {
  const manifestPath = resolvePath(loaded.dir, String(entry.manifestPath));
  const read = await readJson(manifestPath, `the pinned manifest of "${id}"`);
  if (!read.ok) return read;
  const verdict = validateUppManifest(read.value);
  if (!verdict.ok) {
    return refuse(JSONRPC_CODES.INVALID_PARAMS,
      `the pinned manifest of "${id}" is invalid (${verdict.errors.length} problem(s))`, verdict.errors);
  }
  const manifest = /** @type {Raw} */ (assertUppManifest(read.value));
  if (manifest.id !== id) {
    return refuse(JSONRPC_CODES.INVALID_PARAMS,
      `the pinned manifest declares id "${String(manifest.id)}" but is authorised as "${id}"`,
      [{ path: 'id', message: 'the authorisation and the manifest must name the same plugin' }]);
  }
  const digest = manifestDigest(manifest);
  if (!digestsMatch(digest, entry.manifestSha256)) {
    return refuse(JSONRPC_CODES.INVALID_PARAMS,
      `the manifest of "${id}" does not match its pin — refused`,
      [{ path: 'manifestSha256', message: `pinned ${String(entry.manifestSha256)}, computed ${digest}` }]);
  }
  return Object.freeze({ ok: true, value: { manifest, digest, manifestPath } });
}

/**
 * The authorisation for an APPLICATION `id`, from the `applications` list and nowhere else.
 *
 * The same pin, the same refusals — and two of its own, because an application is a
 * different kind of thing: the manifest must declare `type: "application"` (a capability
 * manifest is never supervised as an app), and the supervision mode comes from the OPERATOR,
 * never from the manifest, because who may start a process is not the app author's call.
 *
 * @param {{ dir: string, config: Raw }} loaded the result of `loadUppConfig`
 * @param {string} id
 * @returns {Promise<Loaded<{ entry: Raw, manifest: Raw, digest: string, dir: string,
 *   supervision: string, timeouts: { startupMs: number, requestMs: number, shutdownMs: number } }>>}
 */
export async function authorizeApplication(loaded, id) {
  const entry = applicationAuthorizationFor(loaded.config, id);
  if (entry === null) {
    return refuse(UPP_CODES.CAPABILITY_NOT_AUTHORIZED,
      `"${String(id)}" is not listed in the applications of upp.config.json — it is never started and never contacted`,
      [{ path: 'applications', message: 'no authorisation for this id' }]);
  }
  const proved = await provePinnedManifest(loaded, entry, id);
  if (!proved.ok) return proved;
  const { manifest, digest, manifestPath } = proved.value;
  if (manifest.type !== 'application') {
    return refuse(JSONRPC_CODES.INVALID_PARAMS,
      `"${id}" is authorised as an application but its manifest declares type "${String(manifest.type)}"`,
      [{ path: 'type', message: 'an application is registered, never loaded into the kernel' }]);
  }
  const dir = entry.cwd === undefined ? resolvePath(manifestPath, '..') : resolvePath(loaded.dir, String(entry.cwd));
  return Object.freeze({
    ok: true,
    value: {
      entry, manifest, digest, dir,
      supervision: String(entry.supervision), timeouts: timeoutsOf(entry),
    },
  });
}

/**
 * The MINIMAL environment a spawned plugin sees: nothing inherited except what the platform
 * needs to run a program at all, plus the NAMES the operator listed. A host secret is not
 * in a plugin's environment because it was never put there — not because the plugin is
 * trusted not to read it.
 *
 * `PATH` is unavoidable (`spawn` resolves the executable through it); on Windows
 * `SystemRoot` and `SYSTEMROOT` are too — a Node child without them cannot start. Both are
 * named here and nowhere else, so widening this set is a visible diff.
 * @param {ReadonlyArray<string>} allowed @param {NodeJS.ProcessEnv} [source]
 * @returns {Record<string, string>}
 */
export function minimalEnv(allowed = [], source = process.env) {
  const base = process.platform === 'win32'
    ? ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP']
    : ['PATH'];
  /** @type {Record<string, string>} */
  const env = {};
  for (const name of [...base, ...allowed]) {
    const value = source[name];
    if (typeof value === 'string') env[name] = value;
  }
  return env;
}
