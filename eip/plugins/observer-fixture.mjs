// Harness for the observer suite. Not a test file, so `node --test` skips it.
//
// The vault under test is created by the REAL CLI, replaying the same script the
// public example commits (`examples/observer-demo/script.mjs`). That is deliberate:
// a fixture hand-written in a test file would let the plugin and the protocol drift
// apart silently, and the first thing to break would be the thing nobody re-reads.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { EXPECTED } from '../../examples/observer-demo/script.mjs';
import { replayToTemp } from '../../examples/observer-demo/reproduce.mjs';
import { createKernel } from '../kernel/index.mjs';
import { createHost } from '../host/index.mjs';
import { observerComposition } from '../host/observer-composition.mjs';
import { createVaultReadPorts } from '../host/read-port.mjs';
import { createWritePort } from '../host/write-port.mjs';
import observerState from './observer-state/index.mjs';

export { EXPECTED, observerState };

/** Every file under `dir`, as `relative/posix/path -> sha256`. The read-only claim is
 * about BYTES, so it is measured in bytes and not in "we did not call writeFile".
 * @param {string} dir @param {string} [base] @returns {Record<string, string>} */
export function hashTree(dir, base = dir) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, hashTree(full, base));
    else {
      const rel = relative(base, full).split('\\').join('/');
      out[rel] = createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  }
  return out;
}

/** A temporary vault, replayed by the CLI. The caller removes it. */
export function demoVault() {
  const { root, state } = replayToTemp();
  return { root, state, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * A kernel with `observer.state` loaded over a fresh demo vault, plus — on purpose —
 * a `writeFile` port the plugin never declared, so that "the writer is invisible" is
 * a tested claim and not an arrangement.
 * @param {{ offerWritePort?: boolean, root?: string }} [options]
 */
export async function loadObserver({ offerWritePort = true, root } = {}) {
  const vault = root === undefined ? demoVault() : { root, state: join(root, 'vault', 'state'), cleanup: () => {} };
  const kernel = createKernel();
  kernel.register(observerState);
  const ports = {
    ...createVaultReadPorts(vault.root),
    ...(offerWritePort ? { writeFile: createWritePort(join(vault.root, 'reports')) } : {}),
  };
  await kernel.load('observer.state', { ports });
  return {
    kernel,
    ...vault,
    /** @type {(cap: string, input?: unknown) => Promise<import('../sdk/types.mjs').Result>} */
    call: (cap, input = {}) => kernel.execute('observer.state', cap, input),
    /** The live service object, for the diagnostics its manifest publishes. */
    service: () => /** @type {Record<string, unknown>} */ (kernel.get('observer.state')),
    async cleanup() {
      if (kernel.isLoaded('observer.state')) await kernel.dispose('observer.state');
      vault.cleanup();
    },
  };
}

/** A real host over a fresh demo vault, composed exactly as an application would. */
export async function startObserverHost() {
  const vault = demoVault();
  const host = await createHost(observerComposition({ root: vault.root }));
  const { url } = await host.listen(0);
  const CAP = `${url}/api/v1/plugins/observer.state/capabilities`;
  return {
    host,
    url,
    ...vault,
    /** POST one capability with the canonical envelope.
     * @param {string} cap @param {unknown} [input] */
    async post(cap, input = {}) {
      const response = await fetch(`${CAP}/${cap}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      const text = await response.text();
      return { status: response.status, text, body: JSON.parse(text) };
    },
    /** @param {string} path */
    async get(path) {
      const response = await fetch(`${url}${path}`);
      return { status: response.status, body: await response.json() };
    },
    async cleanup() {
      await host.close();
      vault.cleanup();
    },
  };
}

/** The five capabilities, in the order the contract lists them. */
export const CAPABILITY_IDS = Object.freeze(['overview', 'cells', 'cell-detail', 'graph', 'timeline']);

/** One sufficient input per capability, for a test that exercises all of them. */
export const SAMPLE_INPUTS = Object.freeze({
  overview: {},
  cells: {},
  'cell-detail': { id: EXPECTED.activeId },
  graph: {},
  timeline: { limit: 10 },
});
