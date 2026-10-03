// Harness for the auditor suite. Not a test file, so `node --test` skips it.
//
// The project under test is a REAL one: the demo vault is replayed by the actual CLI (same
// script the public example commits) into a temporary directory, and that directory is then
// also the "repository" the auditor reads. Files planted on top of it are how a test asks for
// a specific finding — an oversized module, a credential-shaped literal, an import that
// points the wrong way — without ever planting one in this repository.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHost } from '../host/index.mjs';
import { observerComposition } from '../host/observer-composition.mjs';
import { createVaultReadPorts } from '../host/read-port.mjs';
import { createRepoReadPorts } from '../host/repo-read-port.mjs';
import { createWritePort } from '../host/write-port.mjs';
import { createKernel } from '../kernel/index.mjs';
import observerAudit from './observer-audit/index.mjs';
import observerState from './observer-state/index.mjs';
import { demoVault, hashTree } from './observer-fixture.mjs';

export { observerAudit, observerState, hashTree };

/** The two capabilities, in the order the contract lists them. */
export const CAPABILITY_IDS = Object.freeze(['run-audit', 'findings']);

/** One sufficient input per capability, for a test that exercises both. */
export const SAMPLE_INPUTS = Object.freeze({ 'run-audit': {}, findings: {} });

/** Write extra files into the temporary project. Directories are created as needed.
 * @param {string} root @param {Readonly<Record<string, string>>} plant */
export function plantFiles(root, plant) {
  for (const [rel, text] of Object.entries(plant)) {
    const target = join(root, ...rel.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, 'utf8');
  }
}

/**
 * A kernel with `observer.state` and `observer.audit` loaded over a fresh demo project, plus
 * — on purpose — a `writeFile` port neither plugin declared, so that "the writer is
 * invisible" is a tested claim and not an arrangement.
 * @param {{ plant?: Readonly<Record<string, string>>, offerWritePort?: boolean }} [options]
 */
export async function loadAuditor({ plant = {}, offerWritePort = true } = {}) {
  const vault = demoVault();
  plantFiles(vault.root, plant);
  const kernel = createKernel();
  kernel.register(observerState);
  kernel.register(observerAudit);
  const ports = {
    ...createVaultReadPorts(vault.root),
    ...createRepoReadPorts(vault.root),
    ...(offerWritePort ? { writeFile: createWritePort(join(vault.root, 'reports')) } : {}),
  };
  await kernel.load('observer.state', { ports });
  await kernel.load('observer.audit', { ports });
  return {
    kernel,
    ...vault,
    /** @type {(cap: string, input?: unknown) => Promise<import('../sdk/types.mjs').Result>} */
    call: (cap, input = {}) => kernel.execute('observer.audit', cap, input),
    /** The live service object, for the diagnostics its manifest publishes. */
    service: () => /** @type {Record<string, unknown>} */ (kernel.get('observer.audit')),
    async cleanup() {
      for (const key of ['observer.audit', 'observer.state']) {
        if (kernel.isLoaded(key)) await kernel.dispose(key);
      }
      vault.cleanup();
    },
  };
}

/** A real host over a fresh demo project, composed exactly as the application does it.
 * @param {{ plant?: Readonly<Record<string, string>>, withAudit?: boolean }} [options] */
export async function startAuditHost({ plant = {}, withAudit = true } = {}) {
  const vault = demoVault();
  plantFiles(vault.root, plant);
  const plugins = withAudit ? [observerState, observerAudit] : [observerState];
  const host = await createHost({ ...observerComposition({ root: vault.root, plugins }), devUi: false });
  const { url } = await host.listen(0);
  return {
    host,
    url,
    ...vault,
    /** POST one capability with the canonical envelope.
     * @param {string} cap @param {unknown} [input] @param {string} [key] */
    async post(cap, input = {}, key = 'observer.audit') {
      const response = await fetch(`${url}/api/v1/plugins/${key}/capabilities/${cap}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      const text = await response.text();
      return { status: response.status, text, body: JSON.parse(text) };
    },
    async cleanup() {
      await host.close();
      vault.cleanup();
    },
  };
}

/** A module long enough to break the 200-line rule, and dull enough to break nothing else. */
export const OVERSIZED_MODULE = `${Array.from({ length: 205 }, (_, i) => `export const n${i} = ${i};`).join('\n')}\n`;

/** A credential-shaped literal, assembled at runtime so THIS file never contains one and the
 * secret scan never flags the harness. The value is fake and the test asserts that it never
 * appears in any finding. */
export const FAKE_SECRET = ['s', 'k', '-', 'notarealkey', '0123456789abcdef'].join('');

/** A file that breaks the import-direction rule: Cellular Mode may not import the runtime. */
export const BOUNDARY_BREAKER = 'import { createKernel } from \'../../eip/kernel/index.mjs\';\n'
  + 'export const k = createKernel;\n';
