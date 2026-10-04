// The rules every OPERATOR entry obeys, whatever kind of thing it authorises.
//
// `upp.config.json` authorises two kinds of thing: a capability plugin the kernel will call
// (`plugins`) and an application that runs on its own (`applications`). They are different
// contracts, but the parts an operator gets wrong are the same parts: an argv array written
// as a shell string, an environment passed as values instead of names, a timeout of zero, a
// baseUrl that is not loopback. Those rules live here, once, so the two entry kinds cannot
// drift into two different ideas of what "argv" or "env" means.
//
// PURE: rules over parsed JSON. Reading a file, hashing a manifest and spawning anything
// happen in `operator.mjs`, `applications.mjs` and the transports.
import { closedObject } from '../upp/sections.mjs';

/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */
/** @typedef {Record<string, unknown>} Raw */

/** @type {(path: string, message: string) => SchemaError} */
export const err = (path, message) => ({ path, message });
/** @type {(v: unknown) => boolean} */
export const isText = (v) => typeof v === 'string' && v.trim() !== '' && !v.includes('\0');
/** @type {(v: unknown) => boolean} */
export const isWhole = (v) => Number.isInteger(v) && Number(v) > 0;

export const TIMEOUT_FIELDS = Object.freeze(['startupMs', 'requestMs', 'shutdownMs']);

/** Defaults are DECLARED, not scattered: an operator who omits `timeouts` gets these, and a
 * reader learns the real deadlines without running anything. */
export const DEFAULT_TIMEOUTS = Object.freeze({
  startupMs: 10_000, requestMs: 30_000, shutdownMs: 5_000,
});

/** Loopback hostnames. A non-loopback `baseUrl` needs `allowRemote` AND a bearer token env
 * NAME, because "reachable from the network" is a decision and not a typo. */
export const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', '::1', '[::1]', 'localhost']);

/** An environment variable NAME an operator may pass through. The pattern is deliberately
 * narrow: a name with a `=` or a NUL in it is not a name. */
export const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** @param {unknown} value @returns {boolean} */
export function isLoopbackUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    return LOOPBACK_HOSTS.includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** An argv ARRAY, never a shell string: that difference is the whole security posture of a
 * spawn. @type {(value: unknown, at: string, out: SchemaError[]) => void} */
export function checkArgv(value, at, out) {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isText)) {
    out.push(err(at, 'command must be a non-empty array [executable, ...args], never a shell string'));
  }
}

/** @type {(raw: Raw, at: string, out: SchemaError[]) => void} */
export function checkEnv(raw, at, out) {
  if (raw.env === undefined) return;
  if (!Array.isArray(raw.env)) {
    out.push(err(`${at}.env`, 'env must be an ARRAY of variable NAMES to pass through, never an object of values'));
    return;
  }
  raw.env.forEach((name, i) => {
    if (typeof name !== 'string' || !ENV_NAME_PATTERN.test(name)) {
      out.push(err(`${at}.env.${i}`, `not an environment variable name: ${JSON.stringify(name)}`));
    }
  });
}

/** @type {(raw: Raw, at: string, out: SchemaError[]) => void} */
export function checkTimeouts(raw, at, out) {
  if (raw.timeouts === undefined) return;
  const timeouts = closedObject(raw.timeouts, `${at}.timeouts`, TIMEOUT_FIELDS, out);
  if (timeouts === null) return;
  for (const field of TIMEOUT_FIELDS) {
    if (timeouts[field] !== undefined && !isWhole(timeouts[field])) {
      out.push(err(`${at}.timeouts.${field}`, `${field} must be a positive integer of milliseconds`));
    }
  }
}

/** The pin: 64 hex characters of the reviewed manifest, and the path to it.
 * @type {(entry: Raw, at: string, out: SchemaError[]) => void} */
export function checkPin(entry, at, out) {
  if (!isText(entry.manifestPath)) {
    out.push(err(`${at}.manifestPath`, 'manifestPath must be a path to the reviewed UPP manifest'));
  }
  if (typeof entry.manifestSha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(entry.manifestSha256)) {
    out.push(err(`${at}.manifestSha256`, 'manifestSha256 must be 64 hex characters: the pin of the reviewed manifest'));
  }
}

/** Effective timeouts for an entry: the declared values over `DEFAULT_TIMEOUTS`.
 * @param {Raw} entry @returns {{ startupMs: number, requestMs: number, shutdownMs: number }} */
export function timeoutsOf(entry) {
  const declared = /** @type {Raw} */ (entry.timeouts ?? {});
  /** @type {(field: 'startupMs' | 'requestMs' | 'shutdownMs') => number} */
  const pick = (field) => (isWhole(declared[field]) ? Number(declared[field]) : DEFAULT_TIMEOUTS[field]);
  return Object.freeze({ startupMs: pick('startupMs'), requestMs: pick('requestMs'), shutdownMs: pick('shutdownMs') });
}
