// host-adapter.mjs — the ONE place that knows how this application composes the runtime.
//
// The frontend and the backend of this cell shipped in parallel, so the coupling is kept to
// a single function. Everything the launcher needs is behind `composeObserverHost`; if the
// observer plugins move or the composition grows an option, this file changes and nothing
// else does.
//
// The wiring is the host's own: `createHost({ ...observerComposition({ root }) })`.
// `observerComposition` supplies the plugin list and the vault READ ports, and supplies no
// `reportsDir` — so no write port is created at all. That is stronger than declaring no
// write permission: the privilege the observer must not have was never built.
//
// `observer.audit` (Cell 2) and `observer.advisor` (Cell 3) are later cells. They are loaded
// when their modules exist and are simply absent otherwise, which is exactly the state the
// AUDIT and ADVISOR areas of the page already describe out loud.
import { createHost } from '../../eip/host/index.mjs';
import { OBSERVER_PLUGINS, advisorPlugin, observerComposition } from '../../eip/host/observer-composition.mjs';

/** @typedef {import('../../eip/sdk/types.mjs').Manifest} Manifest */

/** Specifier of the auditor plugin, relative to this file. */
export const AUDIT_PLUGIN = '../../eip/plugins/observer-audit/index.mjs';

/** Specifier of the advisor plugin. Loaded only when a model adapter is named: the advisor
 * is disabled by default, which in this architecture means "not in the plugin list". */
export const ADVISOR_PLUGIN = '../../eip/plugins/observer-advisor/index.mjs';

/** What the user is told when a plugin this build expects is not installed. A missing
 * backend is a legible state of the world, not a stack trace.
 * @param {string} specifier @param {unknown} cause @returns {Error} */
export function missingPlugin(specifier, cause) {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(
    `the observer plugin "${specifier}" is not available in this checkout, so there is `
    + 'nothing for the dashboard to read. Start the app with --fixture to review the '
    + `interface against the recorded contract fixtures instead. (${detail})`,
  );
}

/** Loads an OPTIONAL plugin: `null` when its module is not in this checkout.
 * @param {string} specifier @returns {Promise<Manifest | null>} */
async function optionalManifest(specifier) {
  /** @type {{ default?: unknown }} */
  let module;
  try {
    module = await import(specifier);
  } catch {
    return null;
  }
  const manifest = module.default;
  if (manifest === null || typeof manifest !== 'object') {
    throw new Error(`the observer plugin "${specifier}" does not default-export a manifest`);
  }
  return /** @type {Manifest} */ (manifest);
}

/**
 * Starts the host that serves the `observer.*` capabilities on loopback.
 * @param {object} options
 * @param {string} options.root the project whose vault is read
 * @param {string} [options.advisor] model-adapter id; omitted means no advisor plugin
 * @returns {Promise<{ url: string, port: number, keys: string[], close: () => Promise<void> }>}
 */
export async function composeObserverHost({ root, advisor }) {
  /** @type {Manifest[]} */
  const plugins = [...OBSERVER_PLUGINS];
  const audit = await optionalManifest(AUDIT_PLUGIN);
  if (audit !== null) plugins.push(audit);
  if (advisor !== undefined) {
    // The ADAPTER is the composition's to choose, so the host builds the advisor rather than
    // importing a ready-made manifest: `advisorPlugin` resolves the id against the registry
    // it owns and throws, naming the ids that exist, when the id is not one of them.
    const adviser = await advisorPlugin({ id: advisor });
    if (adviser === null) throw missingPlugin(ADVISOR_PLUGIN, 'the advisor module is not installed');
    plugins.push(adviser);
  }
  const host = await createHost({ ...observerComposition({ root, plugins }), devUi: false });
  const { port, url } = await host.listen(0);
  return {
    port,
    url,
    keys: plugins.map((manifest) => manifest.name),
    close: () => host.close(),
  };
}
