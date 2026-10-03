// Harness for the advisor suite. Not a test file, so `node --test` skips it.
//
// Two things live here. The first is the composition under test: a real kernel (and a real
// host) over a real demo vault, with `observer.state`, `observer.audit` and
// `observer.advisor` loaded exactly the way the application loads them.
//
// The second is the HOSTILE ADAPTERS, and they are the reason this file exists. The shipped
// fixture adapter is well-behaved, so it can only prove the happy path; the interesting
// claims are about what happens when a model answers with rubbish, with a claim it cannot
// support, with a reference to something it was never shown, with 40 KB of text, or with a
// shell command and the word "approve". None of those adapters ships: they are test doubles,
// they live beside the tests, and the composition can only offer them because a test IS a
// composition.
import { join } from 'node:path';
import { createHost } from '../host/index.mjs';
import { observerComposition } from '../host/observer-composition.mjs';
import { createVaultReadPorts } from '../host/read-port.mjs';
import { createRepoReadPorts } from '../host/repo-read-port.mjs';
import { createWritePort } from '../host/write-port.mjs';
import { createKernel } from '../kernel/index.mjs';
import observerAudit from './observer-audit/index.mjs';
import observerState from './observer-state/index.mjs';
import { createAdvisorPlugin } from './observer-advisor/index.mjs';
import { fixtureAdapter } from './observer-advisor/fixture-adapter.mjs';
import { demoVault, hashTree } from './observer-fixture.mjs';
import { HOSTILE, cannedAdapter } from './observer-advisor-answers.mjs';

export { HOSTILE, cannedAdapter, createAdvisorPlugin, fixtureAdapter, hashTree, observerAudit, observerState };

/** The three capabilities, in the order the contract lists them. */
export const CAPABILITY_IDS = Object.freeze(['advise', 'recommendations', 'status']);

/** One sufficient input per capability, for a test that exercises all three. */
export const SAMPLE_INPUTS = Object.freeze({
  advise: { question: 'what should I do next?' },
  recommendations: {},
  status: {},
});

/** Limits that let a test make several calls in a row. The INTERVAL rule is proved on its
 * own, with its own budget, rather than by making every other test sleep two seconds. */
export const FAST_LIMITS = Object.freeze({ minIntervalMs: 0 });

/**
 * A kernel with the three observer plugins over a fresh demo project, plus - on purpose - a
 * `writeFile` port NONE of them declared, so that "the advisor cannot write" is a tested
 * claim and not an arrangement.
 * @param {{ adapter?: import('./observer-advisor/types.mjs').ModelAdapter,
 *   limits?: Partial<import('./observer-advisor/types.mjs').Limits>, now?: () => number,
 *   withAdvisor?: boolean }} [options]
 */
export async function loadAdvisor({ adapter = fixtureAdapter, limits = FAST_LIMITS, now, withAdvisor = true } = {}) {
  const vault = demoVault();
  const kernel = createKernel();
  /** @type {Array<{ key: string, cap: string }>} */
  const executed = [];
  /** @type {string[]} */
  const approvals = [];
  kernel.on('execute', (event) => executed.push({ key: String(event.key), cap: String(event.cap ?? '') }));
  kernel.on('approval', (event) => approvals.push(String(event.key)));
  kernel.register(observerState);
  kernel.register(observerAudit);
  if (withAdvisor) {
    kernel.register(createAdvisorPlugin({ adapter, limits, ...(now === undefined ? {} : { now }) }));
  }
  /** @type {Record<string, number>} */
  const portCalls = {};
  const described = {
    ...createVaultReadPorts(vault.root),
    ...createRepoReadPorts(vault.root),
    writeFile: createWritePort(join(vault.root, 'reports')),
  };
  // Every port is wrapped in a counter, so "no port was called" is measured rather than
  // assumed - and the write port is offered to all three plugins and granted to none.
  const ports = Object.fromEntries(Object.entries(described).map(([name, port]) => [name, {
    permission: port.permission,
    /** @param {...unknown} args */
    fn: (...args) => {
      portCalls[name] = (portCalls[name] ?? 0) + 1;
      return /** @type {(...a: unknown[]) => unknown} */ (port.fn)(...args);
    },
  }]));
  for (const key of ['observer.state', 'observer.audit', ...(withAdvisor ? ['observer.advisor'] : [])]) {
    await kernel.load(key, { ports });
  }
  return {
    kernel,
    ...vault,
    executed,
    approvals,
    portCalls,
    /** @type {(cap: string, input?: unknown) => Promise<import('../sdk/types.mjs').Result>} */
    call: (cap, input = {}) => kernel.execute('observer.advisor', cap, input),
    service: () => /** @type {Record<string, unknown>} */ (kernel.get('observer.advisor')),
    async cleanup() {
      for (const key of ['observer.advisor', 'observer.audit', 'observer.state']) {
        if (kernel.isLoaded(key)) await kernel.dispose(key);
      }
      vault.cleanup();
    },
  };
}

/** A real host over a fresh demo project, composed exactly as the application does it.
 * @param {{ withAdvisor?: boolean, adapter?: import('./observer-advisor/types.mjs').ModelAdapter,
 *   limits?: Partial<import('./observer-advisor/types.mjs').Limits> }} [options] */
export async function startAdvisorHost({ withAdvisor = true, adapter = fixtureAdapter, limits = FAST_LIMITS } = {}) {
  const vault = demoVault();
  /** @type {string[]} */
  const approvals = [];
  const plugins = [observerState, observerAudit,
    ...(withAdvisor ? [createAdvisorPlugin({ adapter, limits })] : [])];
  const host = await createHost({
    ...observerComposition({ root: vault.root, plugins }),
    devUi: false,
    // ABSENT MEANS DENIED everywhere else in this runtime; here it is present and counting,
    // so "the advisor never asked a human to approve anything" is a measurement.
    approver: (request) => {
      approvals.push(`${String(request.key)}/${String(request.cap)}`);
      return true;
    },
  });
  const { url } = await host.listen(0);
  return {
    host,
    url,
    approvals,
    ...vault,
    /** @param {string} cap @param {unknown} [input] @param {string} [key] */
    async post(cap, input = {}, key = 'observer.advisor') {
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
