// `upp.initialize`, as a pure decision over the answer.
//
// Startup is where a transport is most tempted to be forgiving — the plugin is up, the pipe
// works, something came back — and it is exactly where forgiveness is most expensive: a
// plugin admitted here is a plugin the kernel will route real calls to. So the answer is
// judged on two independent grounds, both of which must hold:
//
//   1. VERSION. The agreed version is chosen by `negotiate` from the host's list. No
//      overlap is `-32002` and the plugin is NOT registered — never an upgrade to the
//      nearest version, which is how a protocol acquires undefined behaviour.
//   2. IDENTITY. The manifest the plugin returns must have the same canonical digest as the
//      one the operator pinned. Not "compatible", not "a superset": equal. A plugin that
//      can describe itself differently at runtime than in the reviewed file has made the
//      review meaningless.
//
// Shared by both transports because the handshake is the protocol's, not the pipe's.
import { JSONRPC_CODES, SUPPORTED_PROTOCOL_VERSIONS, negotiate, uppError } from '../upp/index.mjs';
import { digestsMatch, manifestDigest } from './canonical.mjs';

/** @typedef {import('../sdk/types.mjs').SchemaError} SchemaError */
/** @typedef {import('../upp/errors.mjs').UppError} UppError */
/** @typedef {Record<string, unknown>} Raw */
/** @typedef {{ ok: true, protocolVersion: string } | { ok: false, error: UppError }} Admission */

/** @type {(message: string, details: SchemaError[]) => { ok: false, error: UppError }} */
const refuse = (message, details) => Object.freeze({
  ok: false, error: uppError(JSONRPC_CODES.INVALID_PARAMS, message, details),
});

/** The host half of the handshake. `config` is the plugin's own configuration, validated by
 * the kernel against the manifest's `config` schema before it ever gets here.
 * @param {{ name: string, version: string }} host @param {Raw} [config]
 * @param {ReadonlyArray<string>} [supported] @returns {Raw} */
export function initializeParams(host, config = {}, supported = SUPPORTED_PROTOCOL_VERSIONS) {
  return {
    protocolVersions: [...supported],
    host: { name: host.name, version: host.version, capabilities: {} },
    config,
  };
}

/**
 * Judge an `upp.initialize` result. `result` has already passed `validateResponse`, so
 * `protocolVersion` is a string and `manifest` an object; what is decided here is whether
 * they are the RIGHT ones.
 * @param {Raw} result @param {{ manifest: Raw, digest: string,
 *   supported?: ReadonlyArray<string> }} pinned @returns {Admission}
 */
export function admit(result, pinned) {
  const supported = pinned.supported ?? SUPPORTED_PROTOCOL_VERSIONS;
  const offered = typeof result.protocolVersion === 'string' ? [result.protocolVersion] : [];
  const agreed = negotiate(supported, offered);
  if (!agreed.ok) return Object.freeze({ ok: false, error: agreed.error });
  let digest;
  try {
    digest = manifestDigest(result.manifest);
  } catch (cause) {
    return refuse('the manifest returned by upp.initialize is not representable as JSON',
      [{ path: 'manifest', message: String(cause) }]);
  }
  if (!digestsMatch(digest, pinned.digest)) {
    return refuse('the manifest returned by upp.initialize does not match the pinned one — refused',
      [{ path: 'manifest', message: `pinned ${pinned.digest}, answered ${digest}` }]);
  }
  return Object.freeze({ ok: true, protocolVersion: agreed.version });
}

/** The capability ids a pinned manifest authorises. A capability absent from this set is
 * refused by the adapter before any transport is touched: the reviewed manifest is the
 * authorisation, and a plugin cannot widen it by answering `upp.capabilities` generously.
 * @param {Raw} manifest @returns {ReadonlyArray<string>} */
export function authorizedCapabilities(manifest) {
  const capabilities = manifest.capabilities;
  if (typeof capabilities !== 'object' || capabilities === null) return Object.freeze([]);
  return Object.freeze(Object.keys(capabilities));
}
