// Running the corpus: read the cases from disk, start an implementation, replay, report.
//
// One process per CASE, on purpose. Three of the eleven cases end the conversation — a
// malformed line, `upp.exit`, a refused version — and a corpus whose later cases depend on
// what an earlier one left behind is a corpus that passes for the wrong reason. A fresh child
// costs a few hundred milliseconds and buys independence.
//
// The in-process implementation is wired here too, from the same cases and the same matcher.
// Its PIN is its own — `toUppManifest` of a `definePlugin` manifest legitimately declares
// `runtime: "in-process"` — so what is compared across implementations is the capability
// contract and every error integer, and `conformance.test.mjs` asserts that equality directly.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createKernel } from '../kernel/index.mjs';
import { manifestDigest } from './canonical.mjs';
import { createChannel } from './channel.mjs';
import { replayCase } from './conformance.mjs';
import { CASES_DIR, REFERENCE_MANIFEST, implementationNamed, IMPLEMENTATIONS } from './conformance-impl.mjs';
import { createInProcessEndpoint, endpointConversation } from './in-process-endpoint.mjs';
import { minimalEnv } from './operator.mjs';
import { wordcountPlugin } from './fixtures/wordcount-plugin.mjs';

/** @typedef {import('./conformance.mjs').Case} Case */
/** @typedef {import('./conformance.mjs').CaseResult} CaseResult */
/** @typedef {{ name: string, language: string, status: string, reason?: string,
 *   version?: string, command?: string, results: CaseResult[] }} Report */

/** Every case file, in file-name order — the numeric prefixes are the declared order.
 * @param {string} [dir] @returns {Case[]} */
export function loadCases(dir = CASES_DIR) {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((file) => /** @type {Case} */ (JSON.parse(readFileSync(join(dir, file), 'utf8'))));
}

/** The canonical digest of the reference manifest every process implementation must serve.
 * @returns {string} */
export const referencePin = () => manifestDigest(JSON.parse(readFileSync(REFERENCE_MANIFEST, 'utf8')));

/** The reference manifest itself, for the equivalence assertions. @returns {Record<string, unknown>} */
export const referenceManifest = () => JSON.parse(readFileSync(REFERENCE_MANIFEST, 'utf8'));

/** @type {(command: ReadonlyArray<string>, cwd: string) => { conversation:
 *   import('./conformance.mjs').Conversation, stderr: () => string[], close: () => Promise<void> }} */
function processConversation(command, cwd) {
  /** @type {unknown[]} */
  const messages = [];
  /** @type {string[]} */
  const stderr = [];
  const channel = createChannel({
    command,
    cwd,
    env: minimalEnv([]),
    onMessage: (message) => messages.push(message),
    onStderr: (line) => stderr.push(line),
  });
  return {
    conversation: { send: (line) => { channel.writeLine(line); }, messages: () => [...messages] },
    stderr: () => [...stderr],
    close: () => channel.kill(),
  };
}

/** The in-process endpoint over a freshly composed kernel. A new kernel per case, for the same
 * independence reason as a new child process.
 * @returns {{ conversation: import('./conformance.mjs').Conversation, pin: string,
 *   uppManifest: Record<string, unknown>, close: () => Promise<void> }} */
export function inProcessConversation() {
  const kernel = createKernel();
  const key = kernel.register(wordcountPlugin);
  const endpoint = createInProcessEndpoint({ kernel, manifest: wordcountPlugin });
  const loading = kernel.load(key);
  const talk = endpointConversation(endpoint);
  return {
    conversation: {
      send: (line) => { void loading.then(() => talk.send(line)); },
      messages: talk.messages,
    },
    pin: manifestDigest(endpoint.uppManifest),
    uppManifest: endpoint.uppManifest,
    close: async () => { await loading; await kernel.dispose(key); },
  };
}

/**
 * Replay every case against one implementation.
 * @param {string | import('./conformance-impl.mjs').Implementation} target
 * @param {{ cases?: Case[], settleMs?: number }} [options] @returns {Promise<Report>}
 */
export async function runImplementation(target, options = {}) {
  const impl = typeof target === 'string' ? implementationNamed(target) : target;
  const cases = options.cases ?? loadCases();
  const prepared = impl.prepare();
  if (!prepared.ok) {
    return { name: impl.name, language: impl.language, status: prepared.status, reason: prepared.reason, results: [] };
  }
  /** @type {CaseResult[]} */
  const results = [];
  for (const kase of cases) {
    const live = impl.kind === 'in-process'
      ? inProcessConversation()
      : { ...processConversation(prepared.command, prepared.cwd), pin: referencePin() };
    try {
      results.push(await replayCase(live.conversation, kase,
        { pin: live.pin, ...(options.settleMs === undefined ? {} : { settleMs: options.settleMs }) }));
    } finally {
      await live.close();
    }
  }
  return {
    name: impl.name,
    language: impl.language,
    status: results.every((r) => r.ok) ? 'PASS' : 'FAIL',
    version: prepared.version,
    command: impl.kind === 'in-process' ? '(in-process)' : prepared.command.join(' '),
    results,
  };
}

/** @param {{ only?: string[], cases?: Case[] }} [options] @returns {Promise<Report[]>} */
export async function runAll(options = {}) {
  const cases = options.cases ?? loadCases();
  const chosen = options.only === undefined
    ? IMPLEMENTATIONS
    : IMPLEMENTATIONS.filter((impl) => options.only?.includes(impl.name));
  /** @type {Report[]} */
  const reports = [];
  for (const impl of chosen) reports.push(await runImplementation(impl, { cases }));
  return reports;
}

/** A one-line verdict per implementation, for a human and for the job summary.
 * @param {ReadonlyArray<Report>} reports @returns {string[]} */
export function summarize(reports) {
  return reports.map((report) => {
    const passed = report.results.filter((r) => r.ok).length;
    const head = `${report.name.padEnd(12)} ${report.status.padEnd(10)}`;
    if (report.results.length === 0) return `${head} ${report.reason ?? ''}`.trimEnd();
    return `${head} ${passed}/${report.results.length} cases · ${report.version ?? ''}`.trimEnd();
  });
}
