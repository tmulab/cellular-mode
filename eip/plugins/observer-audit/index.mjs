// observer.audit — the deterministic auditor. READ-ONLY, by construction.
//
// What it is: a plugin that applies rules THIS PROJECT ALREADY HAS to the project itself,
// and answers findings with evidence. What it is not, and cannot be:
//
//   it does not write. No `fs.write` is declared, and the composition that loads it creates
//     no write port at all — the privilege was never built, so there is nothing to withhold.
//   it does not run anything. There is no port that spawns a process, which is precisely why
//     typecheck, build and tests are read from an EVIDENCE RECORD and reported as
//     UNAVAILABLE when there is none. An auditor that cannot run a gate must not claim one.
//   it does not re-parse the vault. `observer.state` is injected and asked for its model, so
//     there is one parser of the method's files in this process and not two.
//   it does not act on its own findings. `action` is a sentence for a human.
//
// The ONE thing it keeps is the last result, in memory, so `findings` can filter it. That is
// an effect, so it has an inverse: `onDispose` clears it, and `findings` goes back to saying
// no audit has run.
import { KernelError, definePlugin } from '../../sdk/index.mjs';
import { runAudit } from './audit.mjs';
import { gather } from './gather.mjs';
import { CAPABILITIES } from './schemas.mjs';
import { PROJECT, STATUSES, draft, filterFindings, isStatus, summarise } from './statuses.mjs';

/** @typedef {import('../../sdk/types.mjs').PluginContext} PluginContext */
/** @typedef {import('./types.mjs').AuditModel} AuditModel */
/** @typedef {import('./types.mjs').AuditResult} AuditResult */

/** The sibling whose model this auditor reads. Declared in `inject`, fetched lazily. */
export const STATE_KEY = 'observer.state';

/** The four ports an audit needs, all under one permission. */
export const REQUIRED_PORTS = Object.freeze(['readRepoFile', 'listRepoFiles', 'readEvidence', 'readHead']);

/** The scope shape the contract admits: `project`, or `cell:<id>`. */
export const SCOPE = /^(?:project|cell:[a-z0-9-]{1,80})$/;

/**
 * The answer when no audit has run in this session. ONE UNAVAILABLE finding, not an empty
 * list: an empty list of findings reads as "nothing is wrong", which is the single most
 * expensive lie this plugin could tell.
 * @returns {{ ran: false, at: null, findings: import('./types.mjs').Finding[],
 *   summary: import('./types.mjs').Summary }}
 */
export function neverRun() {
  const findings = [{
    id: 'AUD-AUDIT-NOT-RUN-001',
    ...draft({
      rule: 'audit-not-run',
      status: 'UNAVAILABLE',
      scope: PROJECT,
      explanation: 'no audit has run in this session, so there are no findings to report — which is'
        + ' not the same as there being nothing to find.',
      action: 'call run-audit.',
    }),
  }];
  return { ran: false, at: null, findings, summary: summarise(findings) };
}

/** @param {unknown} value @param {string} path @returns {never} */
const refuse = (value, path) => {
  throw new KernelError('INPUT_INVALID', `"${path}" is not a value this capability accepts`, [
    { path, message: path === 'status' ? `one of ${STATUSES.join(', ')}` : 'project, or cell:<id>' },
  ]);
};

export default definePlugin({
  name: 'observer.audit',
  version: '1.0.0',
  sdk: '1',
  description: 'Audits a Cellular Mode project against the rules it already declares, and answers'
    + ' findings with evidence. Deterministic, read-only, and never a PASS without execution evidence.',
  // REQUIRED: without the dashboard's model there is no vault to audit, and re-reading the
  // vault here would create the second parser this architecture exists to avoid.
  inject: { [STATE_KEY]: { required: true } },
  permissions: ['fs.read'],
  config: {
    type: 'object', properties: {}, required: [], additionalProperties: false,
  },
  capabilities: CAPABILITIES,
  /** @param {PluginContext} ctx */
  apply(ctx) {
    // Checked HERE, at load: a reader that accepts work and answers from nothing is worse
    // than one that refuses to exist. An undeclared port is INVISIBLE, so `typeof` is the
    // only honest test — and this is also what catches a host offering them under the
    // wrong permission.
    const missing = REQUIRED_PORTS.filter((name) => typeof ctx.ports[name] !== 'function');
    if (missing.length > 0) {
      throw new Error(`ports ${REQUIRED_PORTS.join(', ')} (permission fs.read) are mandatory for`
        + ` observer.audit; missing: ${missing.join(', ')}`);
    }
    const ports = /** @type {Record<string, (...args: unknown[]) => Promise<unknown>>} */ (
      /** @type {unknown} */ (ctx.ports));
    const readers = {
      /** @type {(rel: string) => Promise<string | null>} */
      readRepoFile: async (rel) => {
        const text = await ports['readRepoFile']?.(rel);
        return typeof text === 'string' ? text : null;
      },
      /** @type {() => Promise<import('./types.mjs').RepoFile[]>} */
      listRepoFiles: async () => {
        const listed = await ports['listRepoFiles']?.();
        return Array.isArray(listed) ? /** @type {import('./types.mjs').RepoFile[]} */ (listed) : [];
      },
      /** @type {() => Promise<unknown>} */
      readEvidence: async () => ports['readEvidence']?.() ?? null,
      /** @type {() => Promise<string | null>} */
      readHead: async () => {
        const head = await ports['readHead']?.();
        return typeof head === 'string' ? head : null;
      },
    };

    /** @type {AuditResult | null} */
    let last = null;
    ctx.onDispose(() => { last = null; });

    return {
      /** @returns {Promise<AuditResult>} */
      'run-audit': async () => {
        // Lazy, per call: the sibling is resolved when it is used, so load order is
        // irrelevant and a disposed sibling is an error at the moment it matters.
        const state = /** @type {{ model: () => Promise<AuditModel> }} */ (ctx.get(STATE_KEY));
        const model = await state.model();
        const gathered = await gather(readers);
        const result = runAudit({ ...gathered, model, at: new Date().toISOString() });
        last = result;
        return result;
      },
      /** @param {{ status?: string, scope?: string }} [input] */
      findings: async (input = {}) => {
        if (input.status !== undefined && !isStatus(input.status)) refuse(input.status, 'status');
        if (input.scope !== undefined && !SCOPE.test(input.scope)) refuse(input.scope, 'scope');
        const result = last;
        if (result === null) return neverRun();
        const selected = filterFindings(result.findings, input);
        // The summary describes the SELECTION, so a filtered view can never imply that the
        // statuses it filtered out do not exist: the unfiltered counts stay reachable
        // through run-audit, and `at` says which audit this is.
        return { ran: true, at: result.at, findings: selected, summary: summarise(selected) };
      },
      /** Diagnostic: what the outside world actually looks like from in here. A port the
       * plugin did not declare is INVISIBLE, and this is how a test sees that. */
      portNames: () => Object.keys(ctx.ports).sort(),
      /** Diagnostic: lets a test observe that the inverse effect really ran. */
      hasResult: () => last !== null,
    };
  },
});
