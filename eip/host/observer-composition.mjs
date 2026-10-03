// Observer wiring — COMPOSITION, not kernel.
//
// The host knows how to hand ports over; it must not know that an "observer" exists.
// So this module is the one place that says: these plugins, over this vault root,
// with these read ports and NO write port. Spread it into `createHost` and the
// generic host stays generic:
//
//   const host = await createHost({ ...observerComposition({ root }), devUi: false });
//
// Omitting `reportsDir` is a decision, not an oversight: a read-only composition must
// not rely on the permission system to hide a writer nobody needs. Least privilege is
// cheapest when the privilege was never created.
//
// The REPOSITORY read ports follow the same principle one step further: they are created
// only when a plugin that needs them is in the list. A composition that loads the
// dashboard alone can read the vault and nothing else — not because the kernel withholds
// the repository reader, but because it was never built.
import observerState from '../plugins/observer-state/index.mjs';
import { createVaultReadPorts } from './read-port.mjs';
import { createRepoReadPorts } from './repo-read-port.mjs';

/** @typedef {import('../sdk/types.mjs').Manifest} Manifest */
/** @typedef {Readonly<Record<string, { permission: string, fn: Function }>>} Ports */

/** Every observer plugin that is loaded by default. `observer.advisor` stays DISABLED by
 * default, which in this architecture means "not in this list". */
export const OBSERVER_PLUGINS = Object.freeze([observerState]);

/** The plugin key whose presence calls for the repository readers. */
export const AUDIT_KEY = 'observer.audit';

/** The plugin key whose presence calls for the ADAPTIVE reader. Same principle one step
 * further: a composition without this plugin cannot see `.cellular/adaptive/` at all, because
 * the port over it was never created. */
export const ADAPTIVE_KEY = 'adaptive.preferences';

/** The adaptive module's two halves, imported ONLY when a launcher asks for them. */
export const ADAPTIVE_MODULE = '../plugins/adaptive-preferences/index.mjs';
export const ADAPTIVE_PORT_MODULE = './adaptive-read-port.mjs';

/**
 * The OPTIONAL adaptive reader — plugin AND port factory — or `null` when this checkout has no
 * adaptive module.
 *
 * `null` is a legible state and not a fault: Cellular Adaptive is optional and deleting
 * `tools/adaptive/` must leave the Observer whole, so a launcher asked for `--adaptive` in a
 * checkout without it is told, and everything else still runs. BOTH imports are dynamic and
 * both live here, for the same reason the advisor's are: a static import — including a
 * re-export in `eip/host/index.mjs` — is resolved when the importing module loads, so one of
 * them turns "the module is absent" into "the host does not start". That is the defect this
 * function closes, and `tests/optional-module-imports.test.mjs` is what keeps it closed.
 * @returns {Promise<{ manifest: Manifest, createPorts: (root: string) => Ports } | null>}
 */
export async function adaptiveParts() {
  /** @type {{ default?: unknown }} */
  let plugin;
  /** @type {{ createAdaptiveReadPorts?: unknown }} */
  let port;
  try {
    [plugin, port] = await Promise.all([
      import('../plugins/adaptive-preferences/index.mjs'),
      import('./adaptive-read-port.mjs'),
    ]);
  } catch {
    return null;
  }
  const manifest = plugin.default;
  const createPorts = port.createAdaptiveReadPorts;
  if (manifest === null || typeof manifest !== 'object' || typeof createPorts !== 'function') return null;
  return {
    manifest: /** @type {Manifest} */ (manifest),
    createPorts: /** @type {(root: string) => Ports} */ (createPorts),
  };
}

/** The advisor's own module, imported ONLY when an adapter is asked for. */
export const ADVISOR_MODULE = '../plugins/observer-advisor/index.mjs';

/**
 * The advisor, with the ONE model adapter this composition is willing to offer.
 *
 * This function is the whole answer to "where do model adapters come from": here, in the
 * host, from a hand-written list. The plugin never discovers an adapter, never scans a
 * directory and never reads an environment variable, so "which model could this process
 * talk to" is answered by reading these ten lines. `allowNetwork` exists for the day a
 * network adapter is written and is refused by `createRegistry` until a human passes it;
 * no network adapter ships, so today it can only turn nothing on.
 *
 * `null` means the advisor is not in this checkout, which is a legible state and not a
 * fault. An UNKNOWN adapter id is the opposite: it throws, naming the ids that exist,
 * because a launcher that silently started without the advisor somebody asked for would be
 * lying about what is running.
 * @param {{ id: string, allowNetwork?: boolean,
 *   limits?: Partial<import('../plugins/observer-advisor/types.mjs').Limits> }} options
 * @returns {Promise<Manifest | null>}
 */
export async function advisorPlugin({ id, allowNetwork = false, limits }) {
  /** @type {typeof import('../plugins/observer-advisor/index.mjs')} */
  let plugin;
  /** @type {typeof import('../plugins/observer-advisor/fixture-adapter.mjs')} */
  let fixture;
  /** @type {typeof import('../plugins/observer-advisor/model.mjs')} */
  let model;
  try {
    [plugin, fixture, model] = await Promise.all([
      import('../plugins/observer-advisor/index.mjs'),
      import('../plugins/observer-advisor/fixture-adapter.mjs'),
      import('../plugins/observer-advisor/model.mjs'),
    ]);
  } catch {
    return null;
  }
  const registry = model.createRegistry([fixture.fixtureAdapter], { allowNetwork });
  return plugin.createAdvisorPlugin({
    adapter: registry.resolve(id),
    ...(limits === undefined ? {} : { limits }),
  });
}

/**
 * @param {{ root: string, plugins?: ReadonlyArray<Manifest>,
 *   adaptivePorts?: (root: string) => Ports }} options
 *   `root` is the project whose `vault/state` becomes readable — and, when the auditor is
 *   loaded, whose source files become readable too (minus the gates' exclusion list), and,
 *   when `adaptive.preferences` is loaded, whose two `.cellular/adaptive/` files become
 *   readable as well. No combination of plugins creates a write port.
 *
 *   `adaptivePorts` is the factory `adaptiveParts()` returned. This function cannot import it
 *   itself — that is exactly the static dependency that made an optional module load-bearing —
 *   so the launcher hands it over, and a composition that names the adaptive plugin WITHOUT it
 *   is refused rather than started half-wired. The port is still built only when the plugin is
 *   in the list: handing the factory over does not create the privilege.
 * @returns {{ plugins: ReadonlyArray<Manifest>, ports: Ports }}
 */
export function observerComposition({ root, plugins = OBSERVER_PLUGINS, adaptivePorts }) {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new TypeError('observerComposition needs a project root');
  }
  const auditing = plugins.some((manifest) => manifest.name === AUDIT_KEY);
  const adaptive = plugins.some((manifest) => manifest.name === ADAPTIVE_KEY);
  if (adaptive && adaptivePorts === undefined) {
    throw new TypeError(
      `${ADAPTIVE_KEY} is in this composition but its read-port factory is not: pass the `
      + '`adaptivePorts` returned by adaptiveParts(), or leave the optional module out',
    );
  }
  return {
    plugins: [...plugins],
    ports: {
      ...createVaultReadPorts(root),
      ...(auditing ? createRepoReadPorts(root) : {}),
      ...(adaptive && adaptivePorts !== undefined ? adaptivePorts(root) : {}),
    },
  };
}
