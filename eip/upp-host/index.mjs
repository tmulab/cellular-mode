// Public surface of the UPP HOST layer: the transports and the kernel adapter.
//
// `eip/upp` is the protocol as pure rules. This directory is the only place that turns those
// rules into a process, a socket and a pinned manifest on disk — which is why just one layer
// may import it (`upp-host-is-imported-by-the-host-only`, a gate rule). The kernel must keep
// working with no transport in the repository at all, and a plugin must never learn which
// transport carried its caller.
//
// The seam is deliberately narrow: an operator authorises (`loadUppConfig`,
// `authorizePlugin`), a transport is started (`startProcessPlugin`, `startHttpPlugin`), and
// the result is registered into the EXISTING kernel (`registerUppPlugin`). There is no
// parallel runtime and no second place where a capability is validated or approved.
export {
  CONFIG_FIELDS, CONFIG_VERSION, DEFAULT_TIMEOUTS, ENV_NAME_PATTERN, LOOPBACK_HOSTS,
  PLUGIN_FIELDS, PLUGIN_RUNTIMES, TIMEOUT_FIELDS,
  authorizationFor, isLoopbackUrl, timeoutsOf, validateUppConfig,
} from './config.mjs';
export {
  APPLICATION_FIELDS, SUPERVISION_MODES, applicationAuthorizationFor, checkApplications,
} from './app-config.mjs';
export { canonicalJson, digestsMatch, manifestDigest, sha256Hex } from './canonical.mjs';
export { authorizeApplication, authorizePlugin, loadUppConfig, minimalEnv } from './operator.mjs';
export { HEALTHY_STATUS, MAX_HEALTH_BODY_BYTES, healthUrlOf, probeApplication } from './app-health.mjs';
export { APPLICATION_STATES, MAX_RESTARTS, createApplicationRegistry } from './applications.mjs';
export { admit, authorizedCapabilities, initializeParams } from './handshake.mjs';
export { createLineReader } from './lines.mjs';
export { MAX_STDERR_LINE, createChannel } from './channel.mjs';
export { createCorrelator } from './correlate.mjs';
export { HOST_IDENTITY, startProcessPlugin } from './process-transport.mjs';
export { ACCEPTED_STATUSES, UPP_PATH, endpointOf, startHttpPlugin } from './http-transport.mjs';
export { NO_PORTS, kernelErrorOf, registerUppPlugin, uppPluginManifest } from './adapter.mjs';
