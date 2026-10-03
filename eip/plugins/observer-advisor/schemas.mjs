// The capability schemas of `observer.advisor` — the contract the UI is built against.
//
// Written in the SDK schema subset (no union, no `nullable`): a field that is "a string or
// null" omits `type`, which is the same idiom `observer.state` and `observer.audit` use.
//
// Two things in here are load-bearing rather than decorative. `label` and `kind` are CLOSED
// enums, so a model cannot introduce a fifth label or an unrenderable kind by answering one —
// the validator would have rejected it first, and the contract would refuse it even if the
// validator had not. And a recommendation has NO `status` field: the five audit verdicts
// belong to the auditor, and a shape that could carry one would be a shape a UI could render
// as a measurement.
import { ADAPTER_KINDS, LABELS, REC_KINDS } from './model.mjs';
import { MAX_REFS, MAX_STATEMENT, MAX_UNCERTAINTY } from './grounding.mjs';
import { MAX_RECS } from './validate.mjs';
import { DEFAULT_LIMITS } from './limits.mjs';

/** @typedef {import('../../sdk/types.mjs').Schema} Schema */
/** @typedef {import('../../sdk/types.mjs').Capability} Capability */

/** The question a human may ask. 500 characters is a question, not a brief. */
export const MAX_QUESTION = DEFAULT_LIMITS.maxQuestionChars;
/** How many accumulated recommendations `recommendations` may answer with. */
export const MAX_ACCUMULATED = 200;
/** The two modes. `on-demand` answers now; `silent` also accumulates for later reading. */
export const MODES = Object.freeze(['on-demand', 'silent']);

/** @type {(properties: Record<string, Schema>, required: string[]) => Schema} */
const obj = (properties, required) => ({
  type: 'object', properties, required, additionalProperties: false,
});

/** @type {Schema} */
const ID = { type: 'string', minLength: 1, maxLength: 140 };
/** @type {Schema} */
const COUNT = { type: 'integer', minimum: 0 };
/** @type {Schema} */
const SENTENCE = { type: 'string', maxLength: 1000 };

/** One recommendation. Six fields, every one of them text or a closed enum. @type {Schema} */
export const REC = obj({
  id: { type: 'string', minLength: 5, maxLength: 16 },
  kind: { type: 'string', enum: [...REC_KINDS] },
  label: { type: 'string', enum: [...LABELS] },
  statement: { type: 'string', minLength: 1, maxLength: MAX_STATEMENT },
  evidenceRefs: { type: 'array', items: ID, maxItems: MAX_REFS },
  uncertainty: { type: 'string', minLength: 1, maxLength: MAX_UNCERTAINTY },
}, ['id', 'kind', 'label', 'statement', 'evidenceRefs', 'uncertainty']);

/** @type {Schema} */
const RECS = { type: 'array', items: REC, maxItems: MAX_RECS };

/** What validation recorded about the answer. Published, not kept: a reader is entitled to
 * know that three references were removed. @type {Schema} */
export const VALIDATION = obj({
  parsed: { type: 'boolean' },
  accepted: COUNT,
  rejected: COUNT,
  downgraded: COUNT,
  refsRemoved: { type: 'array', items: ID, maxItems: 64 },
  notes: { type: 'array', items: SENTENCE, maxItems: 20 },
}, ['parsed', 'accepted', 'rejected', 'downgraded', 'refsRemoved', 'notes']);

/** @type {Schema} */
export const META = obj({
  adapter: { type: 'string', minLength: 1, maxLength: 40 },
  adapterKind: { type: 'string', enum: [...ADAPTER_KINDS] },
  network: { type: 'boolean' },
  contextBytes: COUNT,
  contextCap: COUNT,
  contextItems: { type: 'array', items: ID, maxItems: 500 },
  contextDropped: { type: 'array', items: ID, maxItems: 500 },
  calls: COUNT,
  remaining: COUNT,
  mode: { type: 'string', enum: [...MODES] },
  // A constant in the contract, not a value a caller may read as "maybe measured".
  generatedBy: { type: 'string', enum: ['model'] },
  disclaimer: { type: 'string', minLength: 20, maxLength: 300 },
  validation: VALIDATION,
}, ['adapter', 'adapterKind', 'network', 'contextBytes', 'contextCap', 'contextItems',
  'contextDropped', 'calls', 'remaining', 'mode', 'generatedBy', 'disclaimer', 'validation']);

/** @type {Schema} */
export const LIMITS = obj({
  maxCallsPerSession: COUNT, minIntervalMs: COUNT, timeoutMs: COUNT,
  maxQuestionChars: COUNT, maxContextBytes: COUNT, logEntries: COUNT, maxOutputChars: COUNT,
}, ['maxCallsPerSession', 'minIntervalMs', 'timeoutMs', 'maxQuestionChars', 'maxContextBytes',
  'logEntries', 'maxOutputChars']);

/** The three capabilities. All `consequential: false`: asking for an interpretation changes
 * nothing in the world, and this plugin has no port with which it could.
 * @type {Record<string, Capability>} */
export const CAPABILITIES = {
  advise: {
    description: 'Asks the composed model adapter for recommendations about the ACTIVE cell, from a'
      + ' bounded context (the cell, its declared dependencies, the recent log window, the last audit\'s'
      + ' verdicts and your question). The answer is validated, grounded in that evidence and never'
      + ' executed. In silent mode the recommendations are also accumulated for later reading.',
    consequential: false,
    input: obj({
      question: { type: 'string', maxLength: MAX_QUESTION },
      mode: { type: 'string', enum: [...MODES] },
    }, []),
    output: obj({ recommendations: RECS, meta: META }, ['recommendations', 'meta']),
  },
  recommendations: {
    description: 'The recommendations accumulated by silent-mode calls in this session, oldest first.'
      + ' Nothing is ever added in the background: only an explicit advise call accumulates.',
    consequential: false,
    input: obj({}, []),
    output: obj({
      recommendations: { type: 'array', items: REC, maxItems: MAX_ACCUMULATED },
      count: COUNT,
      // A timestamp, or `null` when nothing has been accumulated.
      lastAt: { maxLength: 40 },
      disclaimer: { type: 'string', minLength: 20, maxLength: 300 },
    }, ['recommendations', 'count', 'lastAt', 'disclaimer']),
  },
  status: {
    description: 'Whether the advisor is enabled, which adapter the composition supplied, whether it'
      + ' touches the network (it does not), the limits of this session and how much of the call budget'
      + ' is left. Costs nothing and consumes no call.',
    consequential: false,
    input: obj({}, []),
    output: obj({
      enabled: { type: 'boolean' },
      adapter: obj({
        id: { type: 'string', minLength: 1, maxLength: 40 },
        kind: { type: 'string', enum: [...ADAPTER_KINDS] },
        network: { type: 'boolean' },
        description: { type: 'string', minLength: 10, maxLength: 300 },
      }, ['id', 'kind', 'network', 'description']),
      network: { type: 'boolean' },
      limits: LIMITS,
      calls: obj({ used: COUNT, remaining: COUNT }, ['used', 'remaining']),
      disclaimer: { type: 'string', minLength: 20, maxLength: 300 },
    }, ['enabled', 'adapter', 'network', 'limits', 'calls', 'disclaimer']),
  },
};
