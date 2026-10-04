// Test harness: an operator configuration that authorises the fixture plugin.
//
// It writes a real `upp.config.json` into a real temporary directory and loads it through
// the real `loadUppConfig` / `authorizePlugin`, because the pin, the path resolution and the
// strict validation are precisely what the tests are about. A hand-built authorisation
// object would skip all three and prove nothing.
//
// `os.tmpdir()` only, one directory per call, removed by the caller through `cleanup()`.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { manifestDigest } from '../canonical.mjs';
import { authorizeApplication, authorizePlugin, loadUppConfig } from '../operator.mjs';

export const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = join(FIXTURE_DIR, 'manifest.json');
export const HTTP_MANIFEST_PATH = join(FIXTURE_DIR, 'http-manifest.json');
export const PLUGIN_PATH = join(FIXTURE_DIR, 'node-plugin.mjs');
export const APP_PATH = join(FIXTURE_DIR, 'app-server.mjs');
export const FIXTURE_ID = 'fixture.node-plugin';
export const APP_ID = 'fixture.app';

/** A port the OS has just confirmed is free. An application manifest PINS its `baseUrl`, so
 * the port has to be known before the app is written — there is no "ask the child".
 * @returns {Promise<number>} */
export async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => { probe.listen(0, '127.0.0.1', () => resolve(undefined)); });
  const address = probe.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  await new Promise((resolve) => { probe.close(() => resolve(undefined)); });
  return port;
}

/** The UPP manifest of the fixture application, pinned to `baseUrl`.
 * @param {string} baseUrl @param {Record<string, unknown>} [over]
 * @returns {Record<string, unknown>} */
export const appManifest = (baseUrl, over = {}) => ({
  upp: '1.0',
  id: APP_ID,
  version: '1.0.0',
  description: 'A fixture application plugin: its own server, its own routes.',
  type: 'application',
  runtime: 'http',
  entry: { baseUrl },
  capabilities: {},
  application: {
    baseUrl, healthPath: '/healthz', routes: ['/'], auth: 'none-local', cors: { allowedOrigins: [] },
  },
  ...over,
});

/**
 * An operator configuration whose `applications` list authorises the fixture app, written to
 * a real temporary directory and loaded through the real `loadUppConfig`.
 * @param {{ baseUrl: string, entry?: Record<string, unknown>,
 *   manifest?: Record<string, unknown>, applications?: Array<Record<string, unknown>> }} options
 */
export async function withApplicationConfig(options) {
  const dir = await mkdtemp(join(tmpdir(), 'upp-app-'));
  const configPath = join(dir, 'upp.config.json');
  const manifestPath = join(dir, 'app-manifest.json');
  const manifest = options.manifest ?? appManifest(options.baseUrl);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  /** @type {Record<string, unknown>} */
  const base = {
    id: APP_ID,
    supervision: 'external',
    manifestPath,
    manifestSha256: manifestDigest(manifest),
    timeouts: { startupMs: 8000, requestMs: 2000, shutdownMs: 800 },
  };
  const applications = options.applications ?? [{ ...base, ...options.entry }];
  await writeFile(configPath, `${JSON.stringify({ upp: '1.0', plugins: [], applications }, null, 2)}\n`, 'utf8');
  const loaded = await loadUppConfig(configPath);
  return {
    dir,
    configPath,
    manifest,
    loaded: loaded.ok ? loaded.value : null,
    load: () => loadUppConfig(configPath),
    authorize: (/** @type {string} */ id = APP_ID) => {
      if (!loaded.ok) throw new Error(`the harness config did not load: ${loaded.error.message}`);
      return authorizeApplication(loaded.value, id);
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/** The pin of a committed manifest, computed the way the host computes it.
 * @param {string} path @returns {string} */
export const pinOf = (path) => manifestDigest(JSON.parse(readFileSync(path, 'utf8')));

export const FIXTURE_DIGEST = pinOf(MANIFEST_PATH);

/**
 * Write and load an operator configuration authorising the fixture plugin.
 * @param {{ entry?: Record<string, unknown>, id?: string, manifestPath?: string,
 *   plugins?: Array<Record<string, unknown>> }} [options]
 *   `entry` is merged over the default authorisation; `plugins` replaces the list entirely.
 * @returns {Promise<{ dir: string, configPath: string, cleanup: () => Promise<void>,
 *   loaded: { path: string, dir: string, config: Record<string, unknown> } | null,
 *   load: () => ReturnType<typeof loadUppConfig>,
 *   authorize: (id?: string) => ReturnType<typeof authorizePlugin> }>}
 */
export async function withOperatorConfig(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'upp-host-'));
  const configPath = join(dir, 'upp.config.json');
  const manifestPath = options.manifestPath ?? MANIFEST_PATH;
  /** @type {Record<string, unknown>} */
  const base = {
    id: options.id ?? FIXTURE_ID,
    runtime: 'process',
    command: [process.execPath, PLUGIN_PATH],
    manifestPath,
    manifestSha256: pinOf(manifestPath),
    allowNetwork: false,
    timeouts: { startupMs: 8000, requestMs: 2000, shutdownMs: 800 },
  };
  const plugins = options.plugins ?? [{ ...base, ...options.entry }];
  await writeFile(configPath, `${JSON.stringify({ upp: '1.0', plugins }, null, 2)}\n`, 'utf8');
  const loaded = await loadUppConfig(configPath);
  return {
    dir,
    configPath,
    loaded: loaded.ok ? loaded.value : null,
    load: () => loadUppConfig(configPath),
    authorize: (/** @type {string} */ id = options.id ?? FIXTURE_ID) => {
      if (!loaded.ok) throw new Error(`the harness config did not load: ${loaded.error.message}`);
      return authorizePlugin(loaded.value, id);
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/** The authorisation itself, for the common case. Throws when the harness config is wrong —
 * a broken harness must fail loudly rather than produce a green test.
 * @param {{ entry?: Record<string, unknown>, id?: string, manifestPath?: string }} [options]
 * @returns {Promise<{ authorization: import('../types.mjs').Authorization, cleanup: () => Promise<void> }>} */
export async function authorizeFixture(options = {}) {
  const harness = await withOperatorConfig(options);
  const authorized = await harness.authorize();
  if (!authorized.ok) {
    await harness.cleanup();
    throw new Error(`the fixture was not authorised: ${authorized.error.message}`);
  }
  return { authorization: authorized.value, cleanup: harness.cleanup };
}
