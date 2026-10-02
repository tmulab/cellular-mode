// The kernel: the smallest thing that can hold plugins together.
//
// It is NOT a privileged core. It owns no domain behaviour, no logging policy
// and no I/O: it validates contracts, wires siblings lazily, grants ports by
// declared permission, and keeps every registration reversible. Anything a
// plugin could do, the kernel does not do.
//
// Each member of the API earns its place:
//   register  — a contract must be checked before it can be composed
//   load      — config + ports enter here, and only here
//   dispose   — reversibility is structural, not a matter of discipline
//   execute   — the only way in: validated, approved, bounded
//   get       — a host sometimes needs the service object itself
//   list      — composition must be inspectable without reading code
//   on        — observability, in memory, silent by default
import { createEvents } from './events.mjs';
import { createRegistry } from './registry.mjs';
import { createLifecycle } from './lifecycle.mjs';
import { createExecutor } from './execute.mjs';

/**
 * @param {{ approver?: import('./types.mjs').Approver | undefined,
 *   defaultTimeoutMs?: number | undefined }} [options]
 *   `approver` is the human decision for consequential capabilities, and ABSENT MEANS
 *   DENIED; `defaultTimeoutMs` is the deadline applied when a call gives none.
 */
export function createKernel(options = {}) {
  const { approver, defaultTimeoutMs } = options;
  if (approver !== undefined && typeof approver !== 'function') {
    throw new TypeError('approver must be a function');
  }
  const events = createEvents();
  const registry = createRegistry();
  const lifecycle = createLifecycle({ registry, events });
  const executor = createExecutor({ registry, lifecycle, events, approver, defaultTimeoutMs });

  return Object.freeze({
    /** Validate and record a manifest. Throws CONTRACT_INVALID / DUPLICATE_KEY.
     * @param {unknown} manifest @returns {string} */
    register(manifest) {
      const key = registry.register(manifest);
      events.emit({ type: 'register', key });
      return key;
    },

    /** Instantiate a registered plugin with its config and host ports. */
    load: lifecycle.load,

    /** Run the inverse effects in reverse order and remove the service. */
    dispose: lifecycle.dispose,

    /** Call a capability. Always resolves to {ok:true,value} | {ok:false,error}. */
    execute: executor.execute,

    /** The live service object of a loaded plugin. Throws NOT_FOUND otherwise. */
    get: lifecycle.serviceOf,

    /** Metadata for every registered plugin: no `apply`, no dev-UI body. */
    list: registry.list,

    /** True when the key is currently loaded. */
    isLoaded: lifecycle.isLoaded,

    /** Loaded plugins that declare `key` as a required inject. */
    dependentsOf: lifecycle.loadedDependents,

    /** Subscribe to an event type or to '*'. Returns an unsubscribe function. */
    on: events.on,

    /** Listeners that threw while observing — silence must not mean blindness. */
    listenerFailures: events.listenerFailures,
  });
}

export { EVENT_TYPES } from './events.mjs';
