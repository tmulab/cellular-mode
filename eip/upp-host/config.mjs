// `upp.config.json`: the OPERATOR's authorisation file, validated as strictly as a manifest.
//
// The separation this file exists for: a manifest is written by the plugin AUTHOR and says
// what a plugin would like to be; this configuration is written by the HOST OPERATOR and
// says what may actually be executed on this machine. A plugin absent from `plugins` is
// never spawned and never contacted — there is no "discovery", no directory scan, and no
// default. Authority flows from the operator, downward, and never from a file a plugin ships.
//
// Everything here is PURE: rules over the parsed JSON. Reading the file, hashing manifests
// and spawning anything happens in `operator.mjs` and the transports.
import { checkBaseUrl, closedObject } from '../upp/sections.mjs';
import { checkApplications } from './app-config.mjs';
import {
  ENV_NAME_PATTERN, checkEnv, checkPin, checkTimeouts, err, isLoopbackUrl, isText,
} from './entry-rules.mjs';

/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */
/** @typedef {Record<string, unknown>} Raw */

// The rules an operator ENTRY obeys — argv, env, timeouts, the pin, loopback — are shared
// with `applications` and live in `entry-rules.mjs`. They are re-exported here because this
// module is the address every caller already knows.
export {
  DEFAULT_TIMEOUTS, ENV_NAME_PATTERN, LOOPBACK_HOSTS, TIMEOUT_FIELDS, isLoopbackUrl, timeoutsOf,
} from './entry-rules.mjs';

export const CONFIG_VERSION = '1.0';
export const CONFIG_FIELDS = Object.freeze(['upp', 'plugins', 'applications']);
export const PLUGIN_RUNTIMES = Object.freeze(['process', 'http']);
export const PLUGIN_FIELDS = Object.freeze([
  'id', 'runtime', 'command', 'baseUrl', 'manifestPath', 'manifestSha256', 'cwd', 'env',
  'allowNetwork', 'allowRemote', 'bearerTokenEnv', 'timeouts', 'restart',
]);
/** @type {(raw: Raw, at: string, out: SchemaError[]) => void} */
function checkRuntime(raw, at, out) {
  if (raw.runtime === 'process') {
    if (!Array.isArray(raw.command) || raw.command.length === 0 || !raw.command.every(isText)) {
      out.push(err(`${at}.command`, 'command must be a non-empty array [executable, ...args], never a shell string'));
    }
    if (raw.baseUrl !== undefined) out.push(err(`${at}.baseUrl`, 'a process plugin has no baseUrl'));
    return;
  }
  if (raw.runtime !== 'http') {
    out.push(err(`${at}.runtime`, `runtime must be one of ${PLUGIN_RUNTIMES.join(', ')}`));
    return;
  }
  if (raw.command !== undefined) out.push(err(`${at}.command`, 'an http plugin is not spawned and has no command'));
  checkBaseUrl(raw.baseUrl, `${at}.baseUrl`, out);
  if (isLoopbackUrl(raw.baseUrl) || out.some((e) => e.path === `${at}.baseUrl`)) return;
  // Non-loopback: two explicit decisions, both required, neither inferable.
  if (raw.allowRemote !== true) {
    out.push(err(`${at}.allowRemote`, 'a non-loopback baseUrl requires allowRemote:true from the operator'));
  }
  if (!isText(raw.bearerTokenEnv) || !ENV_NAME_PATTERN.test(String(raw.bearerTokenEnv))) {
    out.push(err(`${at}.bearerTokenEnv`,
      'a non-loopback baseUrl requires bearerTokenEnv: the NAME of an environment variable holding the token (never the token)'));
  }
}

/** @type {(raw: unknown, index: number, out: SchemaError[]) => void} */
function checkPlugin(raw, index, out) {
  const at = `plugins.${index}`;
  const entry = closedObject(raw, at, PLUGIN_FIELDS, out);
  if (entry === null) return;
  if (!isText(entry.id)) out.push(err(`${at}.id`, 'id must be the plugin key, e.g. "text.stats"'));
  checkPin(entry, at, out);
  if (entry.cwd !== undefined && !isText(entry.cwd)) out.push(err(`${at}.cwd`, 'cwd must be a path'));
  if (typeof entry.allowNetwork !== 'boolean') {
    out.push(err(`${at}.allowNetwork`, 'allowNetwork must be declared as a boolean'));
  } else if (entry.allowNetwork === true) {
    out.push(err(`${at}.allowNetwork`, 'allowNetwork:true is NOT IMPLEMENTED in UPP 1.0 — a process plugin is not sandboxed, so the host cannot grant or deny it network access; see eip/upp-host/README.md'));
  }
  if (entry.restart !== undefined && typeof entry.restart !== 'boolean') {
    out.push(err(`${at}.restart`, 'restart must be a boolean: at most ONE automatic restart is ever attempted'));
  }
  checkEnv(entry, at, out);
  checkTimeouts(entry, at, out);
  checkRuntime(entry, at, out);
}

/**
 * Validate a parsed `upp.config.json`. Returns every breach, not the first.
 * @param {unknown} raw @returns {{ ok: boolean, errors: SchemaError[] }}
 */
export function validateUppConfig(raw) {
  /** @type {SchemaError[]} */
  const out = [];
  const config = closedObject(raw, 'config', CONFIG_FIELDS, out);
  if (config === null) return { ok: false, errors: out };
  if (config.upp !== CONFIG_VERSION) {
    out.push(err('upp', `upp must be "${CONFIG_VERSION}", got ${JSON.stringify(config.upp)}`));
  }
  // Applications are validated FIRST and independently: a broken `plugins` list must not
  // hide a breach in `applications`, and an app-only host still writes `"plugins": []`.
  checkApplications(config.applications, out);
  if (!Array.isArray(config.plugins)) {
    out.push(err('plugins', 'plugins must be an array — an absent array authorises nothing, which is also the safe default'));
    return { ok: out.length === 0, errors: out };
  }
  /** @type {Set<string>} */
  const seen = new Set();
  config.plugins.forEach((entry, index) => {
    checkPlugin(entry, index, out);
    const id = /** @type {Raw} */ (entry ?? {}).id;
    if (typeof id === 'string') {
      if (seen.has(id)) out.push(err(`plugins.${index}.id`, `duplicate id "${id}": one authorisation per plugin`));
      seen.add(id);
    }
  });
  return { ok: out.length === 0, errors: out };
}

/** The entry authorising `id`, or `null`. The ONLY way a transport learns a command or a
 * URL: an id this returns `null` for is never spawned and never contacted.
 * @param {unknown} config a config that has passed `validateUppConfig`
 * @param {string} id @returns {Raw | null} */
export function authorizationFor(config, id) {
  const plugins = /** @type {Raw} */ (config ?? {}).plugins;
  if (!Array.isArray(plugins)) return null;
  const hit = plugins.find((entry) => /** @type {Raw} */ (entry ?? {}).id === id);
  return hit === undefined ? null : /** @type {Raw} */ (hit);
}
