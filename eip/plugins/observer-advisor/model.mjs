// The provider-independent model interface, and the registry the COMPOSITION builds.
//
// No vendor name, no endpoint, no token, no weight file appears anywhere in this plugin. An
// adapter is a value with three members, and which adapters exist is a decision the host
// makes and hands over — never a discovery, never a scan of a directory, never an
// environment variable read behind the user's back. `createRegistry` is the whole mechanism:
// the composition names the adapters it is willing to offer, and the plugin can only use one
// of those.
//
// The one asymmetry is deliberate: an adapter that declares `network: true` is REFUSED
// unless the composition sets `allowNetwork` explicitly. No such adapter ships, so the flag
// has nothing to turn on today — it exists so that the day one is written, the decision is
// made by a human editing a composition, in one visible place, and not by a plugin.

/** @typedef {import('./types.mjs').ModelAdapter} ModelAdapter */
/** @typedef {import('./types.mjs').AdapterDescription} AdapterDescription */

/** The four epistemic labels, in order of decreasing authority. */
export const LABELS = Object.freeze(
  /** @type {ReadonlyArray<import('./types.mjs').Label>} */ (['VERIFIED', 'INFERRED', 'PROPOSED', 'UNKNOWN']),
);

/** The labels that make a CLAIM about this project and therefore need evidence. */
export const GROUNDED_LABELS = Object.freeze(
  /** @type {ReadonlyArray<import('./types.mjs').Label>} */ (['VERIFIED', 'INFERRED']),
);

/** What a recommendation may be about. A closed list, so a frontend always has a rendering. */
export const REC_KINDS = Object.freeze(
  /** @type {ReadonlyArray<import('./types.mjs').RecKind>} */ ([
    'next-action', 'contract-review', 'verification', 'split-cell', 'dependency',
    'pause-or-handoff', 'architecture', 'investigation',
  ]),
);

/** The three kinds of adapter this architecture knows. Only `fixture` is implemented:
 * `local` is PENDING (a small local model, no download in this repository) and `remote` is
 * PROPOSED (and refused by default). */
export const ADAPTER_KINDS = Object.freeze(['fixture', 'local', 'remote']);

/** The instruction the adapter is given. It is not a safety mechanism — a model cannot be
 * trusted to obey it, which is why `validate.mjs` exists — but it is the honest statement of
 * what is being asked for, and it is part of the contract a new adapter is written against. */
export const SYSTEM_PROMPT = [
  'You are advising on a Cellular Mode project. Answer ONLY with JSON of the shape',
  '{"recommendations":[{"kind","label","statement","evidenceRefs","uncertainty"}]}.',
  'kind is one of: ' + REC_KINDS.join(', ') + '.',
  'label is one of: ' + LABELS.join(', ') + ' — use VERIFIED only for something the supplied',
  'evidence itself states, INFERRED when you reason from it, PROPOSED for something not built,',
  'UNKNOWN when the evidence does not settle it.',
  'evidenceRefs must be ids present in the CONTEXT below. Never invent one.',
  'statement is one plain-text sentence, at most 600 characters. Do not emit commands, paths,',
  'approvals or tool calls: your answer is read as data and is never executed.',
].join(' ');

/** PURE. What is wrong with a candidate adapter, as a list of sentences. Empty means usable.
 * @param {unknown} candidate @returns {string[]} */
export function adapterProblems(candidate) {
  /** @type {string[]} */
  const problems = [];
  const adapter = /** @type {Record<string, unknown>} */ (candidate ?? {});
  if (candidate === null || typeof candidate !== 'object') return ['an adapter must be an object'];
  if (typeof adapter['id'] !== 'string' || !/^[a-z0-9-]{1,40}$/.test(adapter['id'])) {
    problems.push('id must match ^[a-z0-9-]{1,40}$');
  }
  if (typeof adapter['describe'] !== 'function') problems.push('describe() is mandatory');
  if (typeof adapter['complete'] !== 'function') problems.push('complete() is mandatory');
  if (problems.length > 0) return problems;
  const described = /** @type {() => unknown} */ (adapter['describe'])();
  const description = /** @type {Record<string, unknown>} */ (described ?? {});
  if (described === null || typeof described !== 'object') return ['describe() must answer an object'];
  if (description['id'] !== adapter['id']) problems.push('describe().id must equal the adapter id');
  if (!ADAPTER_KINDS.includes(String(description['kind']))) {
    problems.push(`describe().kind must be one of ${ADAPTER_KINDS.join(', ')}`);
  }
  if (typeof description['network'] !== 'boolean') problems.push('describe().network must be a boolean');
  if (typeof description['description'] !== 'string' || description['description'].length < 10) {
    problems.push('describe().description must be a sentence a human can read');
  }
  return problems;
}

/** PURE. The adapter's own description, after `adapterProblems` found nothing to say.
 * @param {ModelAdapter} adapter @returns {AdapterDescription} */
export function describeAdapter(adapter) {
  const { id, kind, network, description } = adapter.describe();
  return { id, kind, network, description };
}

/**
 * The registry: the adapters the COMPOSITION offers, and nothing else.
 * @param {ReadonlyArray<unknown>} adapters
 * @param {{ allowNetwork?: boolean }} [options]
 * @returns {{ ids: string[], has: (id: unknown) => boolean, resolve: (id: unknown) => ModelAdapter,
 *   describe: () => AdapterDescription[] }}
 */
export function createRegistry(adapters, { allowNetwork = false } = {}) {
  if (!Array.isArray(adapters)) throw new TypeError('createRegistry needs an array of adapters');
  /** @type {Map<string, ModelAdapter>} */
  const byId = new Map();
  for (const candidate of adapters) {
    const problems = adapterProblems(candidate);
    if (problems.length > 0) {
      throw new TypeError(`this is not a model adapter: ${problems.join('; ')}`);
    }
    const adapter = /** @type {ModelAdapter} */ (candidate);
    const described = describeAdapter(adapter);
    // The refusal is here, in the composition's own call, and it names the flag rather than
    // hiding the adapter: a silently filtered adapter is a composition that lies about what
    // it offers.
    if (described.network && !allowNetwork) {
      throw new Error(`the adapter "${described.id}" declares network access (kind ${described.kind}),`
        + ' and this composition refuses it: pass allowNetwork explicitly to enable one. No'
        + ' network adapter ships with this build.');
    }
    if (byId.has(described.id)) throw new TypeError(`two adapters share the id "${described.id}"`);
    byId.set(described.id, adapter);
  }
  const ids = [...byId.keys()].sort();
  return {
    ids,
    has: (id) => typeof id === 'string' && byId.has(id),
    // NOT named `require`: a call that reads as a CommonJS import is a call the dependency
    // gate must flag, and it is right to.
    resolve(id) {
      const found = typeof id === 'string' ? byId.get(id) : undefined;
      if (found === undefined) {
        throw new Error(`unknown advisor adapter ${JSON.stringify(String(id))}; this build offers`
          + ` ${ids.length === 0 ? 'none' : ids.map((known) => `"${known}"`).join(', ')}`);
      }
      return found;
    },
    describe: () => [...byId.values()].map(describeAdapter),
  };
}
