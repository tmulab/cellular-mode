// Protocol version negotiation. Pure, and fail-closed by construction: the function can
// only ever return a version BOTH sides named, so there is no path on which a host is
// handed a MINOR it did not offer.
//
// A version is the STRING "MAJOR.MINOR" and never a number, because `1.10` as a float is
// `1.1` and a protocol that silently loses a minor version is worse than one with none.
import { JSONRPC_CODES, UPP_CODES, uppError } from './errors.mjs';

/** @typedef {import('./errors.mjs').UppError} UppError */
/** @typedef {{ ok: true, version: string } | { ok: false, error: UppError }} Negotiation */

/** The one protocol version this implementation speaks. */
export const UPP_VERSION = '1.0';

/** Everything this implementation accepts, newest first — the host's preference order. */
export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([UPP_VERSION]);

/** No leading zeros, exactly two components: `1.0`, `1.10`, `2.0`. */
export const PROTOCOL_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** `{major, minor}` for a legal version string, else `null`.
 * @param {unknown} value @returns {{ major: number, minor: number } | null} */
export function parseProtocolVersion(value) {
  if (typeof value !== 'string') return null;
  const match = PROTOCOL_VERSION_PATTERN.exec(value);
  // The pattern has two capturing groups, so a match has both; the guard says so rather
  // than assuming it, because `noUncheckedIndexedAccess` is right to ask.
  const [, major, minor] = match ?? [];
  if (major === undefined || minor === undefined) return null;
  return { major: Number(major), minor: Number(minor) };
}

/** Numeric ordering per component, usable directly as a sort comparator.
 * @param {string} a @param {string} b @returns {number} */
export function compareProtocolVersions(a, b) {
  const left = parseProtocolVersion(a);
  const right = parseProtocolVersion(b);
  if (left === null || right === null) return 0;
  return left.major - right.major || left.minor - right.minor;
}

/** @type {(list: unknown, path: string) => UppError | null} */
function checkList(list, path) {
  if (!Array.isArray(list) || list.length === 0) {
    return uppError(JSONRPC_CODES.INVALID_PARAMS,
      `${path} must be a non-empty array of "MAJOR.MINOR" strings`,
      [{ path, message: 'expected a non-empty array' }]);
  }
  for (const [index, value] of list.entries()) {
    if (parseProtocolVersion(value) === null) {
      return uppError(JSONRPC_CODES.INVALID_PARAMS,
        `${path}.${index} is not a "MAJOR.MINOR" version: ${JSON.stringify(value)}`,
        [{ path: `${path}.${index}`, message: 'expected "MAJOR.MINOR"' }]);
    }
  }
  return null;
}

/**
 * The agreed version, or a structured refusal. The chosen version is the FIRST member of
 * `hostSupported` that `pluginOffered` also names: the host's order is its preference, and
 * a plugin may only pick from the host's list (`docs/upp/SPEC.md` §5).
 *
 * No overlap — whether the MAJOR differs or only the MINOR does — is
 * `-32002 UNSUPPORTED_PROTOCOL_VERSION`, and the caller must not register the plugin.
 * A near miss inside one MAJOR is deliberately NOT upgraded to the nearest version:
 * guessing a version nobody offered is how a protocol acquires undefined behaviour.
 *
 * @param {ReadonlyArray<string>} hostSupported @param {ReadonlyArray<string>} pluginOffered
 * @returns {Negotiation}
 */
export function negotiate(hostSupported, pluginOffered) {
  const bad = checkList(hostSupported, 'hostSupported') ?? checkList(pluginOffered, 'pluginOffered');
  if (bad !== null) return Object.freeze({ ok: false, error: bad });
  const offered = new Set(pluginOffered);
  const chosen = [...hostSupported].find((version) => offered.has(version));
  if (chosen === undefined) {
    return Object.freeze({
      ok: false,
      error: uppError(UPP_CODES.UNSUPPORTED_PROTOCOL_VERSION,
        `no shared protocol version: host supports [${hostSupported.join(', ')}], `
        + `plugin offers [${pluginOffered.join(', ')}]`,
        [{ path: 'protocolVersions', message: 'no overlap - the plugin is not registered' }]),
    });
  }
  return Object.freeze({ ok: true, version: chosen });
}
