// The adapter: an external plugin becomes a NORMAL plugin of the existing kernel.
//
// This is the decision the whole stage rests on, so it is worth stating as a negative: there
// is no second runtime. Nothing here validates input, approves a consequential call, applies
// a deadline, emits an event or resolves a dependency. All of that is the kernel's, already
// written and already tested, and it keeps happening on exactly the same path it does for an
// in-process plugin. What this module produces is a `definePlugin` manifest whose service
// methods happen to be a transport call.
//
// Two consequences follow, and both are deliberate:
//   · APPROVAL comes BEFORE the transport. The kernel refuses a consequential capability
//     with no approver before it calls the service at all, so the refusal costs zero bytes
//     on the wire — the side effect cannot have happened already.
//   · PORTS ARE NOT FORWARDED. A port is an in-process function; there is no honest way to
//     hand one across a pipe or an HTTP request. The permissions the manifest declares are
//     DECLARED (an operator can read what the plugin wants), the kernel may well grant the
//     matching ports to the adapter, and the adapter gives the external plugin none of them.
//     An empty object is the truthful answer; a serialised proxy would be a lie with latency.
import { KernelError, SDK_VERSION, definePlugin } from '../sdk/index.mjs';

/** @typedef {import('../sdk/types.mjs').Result} Result */
/** @typedef {import('./types.mjs').Transport} Transport */
/** @typedef {Record<string, unknown>} Raw */

/** @type {(v: unknown) => v is Raw} */
const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What an external plugin's `ctx.ports` is, always. Frozen and shared: there is one answer.
 * @type {Readonly<Record<string, never>>} */
export const NO_PORTS = Object.freeze({});

/** A transport failure, as the throw the kernel expects. The code is honoured only when it
 * is one the architecture names; anything else is `PLUGIN_ERROR`. The kernel then applies
 * its own containment rule on top (only `NOT_FOUND` and `INPUT_INVALID` pass through), so a
 * remote peer cannot name an authority code even if this layer were wrong.
 * @param {{ code: string, message: string, details?: ReadonlyArray<{ path: string, message: string }> }} error
 * @returns {KernelError} */
export function kernelErrorOf(error) {
  try {
    return new KernelError(error.code, error.message, error.details ?? []);
  } catch {
    return new KernelError('PLUGIN_ERROR', error.message, error.details ?? []);
  }
}

/**
 * The SDK manifest for an external plugin. Pure: it builds a declaration, registers nothing.
 * @param {Transport} transport @param {{ deadlineMs?: number }} [options]
 * @returns {{ manifest: import('../sdk/types.mjs').Manifest, forwarded: Readonly<Record<string, never>>,
 *   grantedPorts: () => string[] }}
 */
export function uppPluginManifest(transport, options = {}) {
  const upp = transport.manifest;
  // An APPLICATION is never adapted into the kernel. It runs on its own, it has no
  // capabilities to serve, and the only honest refusal is the earliest one: before a
  // manifest exists, so no key can ever be registered for it. `eip/upp-host/applications.mjs`
  // registers it as an identity instead; it reaches the system as a CLIENT of the HTTP API.
  if (upp.type === 'application') {
    throw new KernelError('INPUT_INVALID',
      `"${transport.id}" is an application plugin: it is registered and supervised, never loaded into the kernel`,
      [{ path: 'type', message: 'an application receives no kernel service and no port' }]);
  }
  const declared = isPlain(upp.capabilities) ? upp.capabilities : {};
  /** @type {string[]} */
  let granted = [];
  /** @type {Raw} */
  const capabilities = {};
  for (const [id, raw] of Object.entries(declared)) {
    const cap = isPlain(raw) ? raw : {};
    capabilities[id] = {
      input: cap.input, output: cap.output,
      consequential: cap.consequential === true,
      description: String(cap.description ?? id),
    };
  }

  /** @type {Raw} */
  const manifest = {
    name: transport.id,
    version: String(upp.version),
    sdk: SDK_VERSION,
    description: String(upp.description),
    config: isPlain(upp.config) ? upp.config : { type: 'object' },
    capabilities,
    /** @param {import('../sdk/types.mjs').PluginContext} ctx */
    apply(ctx) {
      // Recorded, not forwarded: the test that proves "an external plugin gets no ports"
      // needs to see that the kernel DID grant some and that the seam carried none.
      granted = Object.keys(ctx.ports);
      // Captured stderr and transport diagnostics become `plugin` kernel events carrying
      // this key. `ctx.emit` is the only emitter a plugin has, which is exactly right: an
      // external plugin cannot forge an event type either.
      transport.onDiagnostic?.((detail) => ctx.emit(detail));
      ctx.onDispose(() => transport.shutdown());
      /** @type {Raw} */
      const service = {};
      for (const id of Object.keys(capabilities)) {
        /** @param {unknown} input @param {{ signal?: AbortSignal }} [call] @returns {Promise<unknown>} */
        service[id] = async (input, call = {}) => {
          const result = await transport.execute(id, input, {
            signal: call.signal, ...(options.deadlineMs === undefined ? {} : { deadlineMs: options.deadlineMs }),
          });
          if (result.ok) return result.value;
          throw kernelErrorOf(result.error);
        };
      }
      return service;
    },
  };
  const permissions = Array.isArray(upp.permissions) ? upp.permissions : [];
  if (permissions.length > 0) manifest.permissions = [...permissions];
  const dependencies = isPlain(upp.dependencies) ? upp.dependencies : {};
  /** @type {Raw} */
  const inject = {};
  for (const [key, spec] of Object.entries(dependencies)) {
    inject[key] = { required: isPlain(spec) && spec.required === true };
  }
  if (Object.keys(inject).length > 0) manifest.inject = inject;

  return Object.freeze({
    manifest: definePlugin(manifest),
    forwarded: NO_PORTS,
    grantedPorts: () => [...granted],
  });
}

/**
 * Register an external plugin into `kernel`. Returns the key and the inspection handles a
 * reviewer needs; LOADING stays the host's call, with the config and ports it chooses, so
 * the external path goes through the same `kernel.load` as every other plugin — including
 * `DEPENDENCY_MISSING` and `DEPENDENCY_CYCLE`.
 *
 * In UPP 1.0 an external plugin cannot CALL a sibling: `dependencies` becomes `inject`, so
 * the composition checks still run, but `ctx.get` is unreachable from the far side of a pipe
 * (no ports, no re-entry). A required dependency therefore still has to be loaded — the
 * declaration is enforced even though the capability is not yet usable. Documented in
 * `eip/upp-host/README.md`; calling siblings from an external plugin is PROPOSED, not built.
 *
 * @param {{ register: (manifest: unknown) => string }} kernel
 * @param {Transport} transport @param {{ deadlineMs?: number }} [options]
 * @returns {{ key: string, manifest: import('../sdk/types.mjs').Manifest,
 *   transport: Transport, forwardedPorts: Readonly<Record<string, never>>, grantedPorts: () => string[] }}
 */
export function registerUppPlugin(kernel, transport, options = {}) {
  const built = uppPluginManifest(transport, options);
  const key = kernel.register(built.manifest);
  return Object.freeze({
    key,
    manifest: built.manifest,
    transport,
    forwardedPorts: built.forwarded,
    grantedPorts: built.grantedPorts,
  });
}
