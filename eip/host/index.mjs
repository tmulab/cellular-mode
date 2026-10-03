// Composition. The host is the ONE place that knows every part — which is exactly
// what keeps the parts independent of each other. It is not a plugin and has no
// privileges inside the runtime: it builds the kernel, hands over the ports it is
// willing to grant, and exposes a transport.
//
// Three decisions live here and nowhere else:
//   1. who may approve a consequential act (default: nobody, so nothing happens);
//   2. what the filesystem looks like to a plugin (one directory, one safe name);
//   3. whether the diagnostics UI exists at all (default: no).
import { createServer } from 'node:http';
import { messageOf } from '../sdk/index.mjs';
import { createKernel } from '../kernel/index.mjs';
import { createRouter } from './router.mjs';
import { createWritePort } from './write-port.mjs';

/** Loopback only. A development host must not be a service on the network. */
export const HOST_ADDRESS = '127.0.0.1';

/**
 * @param {object} options
 * @param {ReadonlyArray<import('../sdk/types.mjs').Manifest>} options.plugins
 *   manifests to register and load
 * @param {import('../kernel/types.mjs').Approver} [options.approver] the human
 *   decision for consequential calls. ABSENT MEANS DENIED: every consequential
 *   capability answers APPROVAL_REQUIRED.
 * @param {boolean} [options.devUi=false] serve /dev/plugins/{key}
 * @param {string} [options.reportsDir] the only directory plugins may write into.
 *   ABSENT MEANS NO WRITE PORT AT ALL: a composition of read-only plugins must not
 *   have to trust the permission system to hide a writer nobody needs.
 * @param {Readonly<Record<string, { permission: string, fn: Function }>>} [options.ports]
 *   extra port descriptors this composition offers. The host stays generic: it knows
 *   how to hand ports over, not which ones a particular application wants (see
 *   `eip/host/observer-composition.mjs`).
 * @param {number} [options.defaultTimeoutMs] deadline for calls that give none
 */
export async function createHost({
  plugins, approver, devUi = false, reportsDir, ports: extraPorts = {}, defaultTimeoutMs,
}) {
  if (!Array.isArray(plugins) || plugins.length === 0) {
    throw new TypeError('createHost needs a non-empty array of plugin manifests');
  }
  const kernel = createKernel({
    ...(approver === undefined ? {} : { approver }),
    ...(defaultTimeoutMs === undefined ? {} : { defaultTimeoutMs }),
  });
  for (const manifest of plugins) kernel.register(manifest);

  // One port map for every plugin. The kernel grants each plugin only the ports
  // whose permission it declared, so least privilege is not the host's discipline.
  const ports = {
    ...(reportsDir === undefined ? {} : { writeFile: createWritePort(reportsDir) }),
    ...extraPorts,
  };
  // Load order is irrelevant (siblings resolve at call time), so registration
  // order is used: a composition that depends on load order is a composition that
  // will break when someone sorts a list.
  for (const manifest of plugins) await kernel.load(manifest.name, { ports });

  const handle = createRouter({ kernel, plugins, devUi });
  const server = createServer((req, res) => {
    handle(req, res).catch((cause) => {
      // A fault in the edge itself. The kernel already contains plugin faults; this
      // is the last resort, and it still never ships a stack.
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      }
      res.end(`${JSON.stringify({ ok: false, error: { code: 'PLUGIN_ERROR', message: `host failure: ${messageOf(cause)}` } })}\n`);
    });
  });

  return Object.freeze({
    kernel,
    server,
    devUi,
    /** Start listening. `0` asks the OS for a free port — what tests should use. */
    listen(port = 0) {
      /** @type {Promise<{ port: number, url: string }>} */
      const started = new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, HOST_ADDRESS, () => {
          // After `listening` this is always an AddressInfo; the guard says so
          // instead of assuming it, because `address()` can also answer a path.
          const address = server.address();
          const bound = typeof address === 'object' && address !== null ? address.port : port;
          resolve({ port: bound, url: `http://${HOST_ADDRESS}:${bound}` });
        });
      });
      return started;
    },
    /** Close the socket, then dispose every plugin: zero residue, dependents first. */
    async close() {
      await new Promise((resolve) => server.close(resolve));
      for (const manifest of [...plugins].reverse()) {
        if (kernel.isLoaded(manifest.name)) await kernel.dispose(manifest.name);
      }
    },
  });
}

export { STATUS_BY_CODE, statusFor } from './errors.mjs';
export { MAX_BODY_BYTES } from './body.mjs';
export { ROUTE_TABLE, routeOf } from './router.mjs';
export { createWritePort } from './write-port.mjs';
export { createVaultReadPorts } from './read-port.mjs';
export { createRepoReadPorts } from './repo-read-port.mjs';
// `createAdaptiveReadPorts` is deliberately NOT re-exported here. It belongs to the OPTIONAL
// adaptive module, and a static re-export would mean every importer of this file — the whole
// host, the Observer, every HTTP test — failed to resolve in a checkout that deleted it.
// `observerComposition` loads it behind the `--adaptive` flag instead (`adaptiveParts()`).
