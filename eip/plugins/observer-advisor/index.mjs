// observer.advisor - the optional second opinion. DATA ONLY, by construction.
//
// This is the only part of the observer that does not measure anything, so it is the only one
// that could mislead. Everything below exists to make that impossible to do quietly:
//
//   it is DISABLED by default. Not "configured off": absent. `OBSERVER_PLUGINS` does not
//     contain it, so without `--advisor <id>` there is no `observer.advisor` key and a call
//     for one is NOT_FOUND. The dashboard and the auditor do not know it exists.
//   it declares NO permission at all, so `ctx.ports` is empty: no reader, no writer, no
//     socket, no spawn. The vault readers the host hands its siblings are invisible here.
//   it does not choose its model. The COMPOSITION hands it one adapter, resolved from a
//     registry the host builds (`eip/host/observer-composition.mjs`): no discovery, no
//     directory scan, no environment variable, and a network adapter refused twice.
//   it does not trust the answer. The model's text is parsed, validated, grounded and rebuilt
//     field by field in `validate.mjs`. There is no code path from a model's output to an
//     action, which is a stronger statement than "we check for shell metacharacters".
//
// The two effects it has are in memory and both have inverses: the call budget and the
// silent-mode accumulation, cleared by `onDispose`.
import { KernelError, definePlugin } from '../../sdk/index.mjs';
import { buildContext } from './context.mjs';
import { callModel } from './call-model.mjs';
import { adapterProblems, describeAdapter, SYSTEM_PROMPT } from './model.mjs';
import { createBudget, normaliseLimits } from './limits.mjs';
import { CAPABILITIES, MAX_ACCUMULATED, MODES } from './schemas.mjs';
import { validateOutput } from './validate.mjs';

/** @typedef {import('../../sdk/types.mjs').PluginContext} PluginContext */
/** @typedef {import('./types.mjs').ModelAdapter} ModelAdapter */
/** @typedef {import('./types.mjs').Rec} Rec */

/** The siblings whose data this advisor reads. Declared in `inject`, fetched lazily, never
 * imported: a sibling arrives by contract. */
export const STATE_KEY = 'observer.state';
export const AUDIT_KEY = 'observer.audit';

/** The sentence that travels with every answer. It is in the payload, not only in the UI, so
 * a second client cannot render these recommendations as measurements by forgetting to. */
export const DISCLAIMER = 'AI-generated interpretation, not a verification: nothing here was'
  + ' executed, measured or approved. Labels are the model\'s own claims, checked only for'
  + ' grounding in the evidence it was given.';

/** @param {string} path @param {string} message @returns {never} */
const refuse = (path, message) => {
  throw new KernelError('INPUT_INVALID', message, [{ path, message }]);
};

/**
 * The manifest, built around ONE adapter the composition supplies.
 * @param {{ adapter: ModelAdapter, limits?: Partial<import('./types.mjs').Limits>,
 *   now?: () => number }} options
 */
export function createAdvisorPlugin({ adapter, limits: partial, now }) {
  const problems = adapterProblems(adapter);
  if (problems.length > 0) {
    throw new TypeError(`observer.advisor was given something that is not a model adapter:`
      + ` ${problems.join('; ')}`);
  }
  const described = describeAdapter(adapter);
  // The second refusal. The registry already refused a network adapter unless a human asked
  // for one; the plugin refuses it unconditionally, because this plugin declares no
  // `net.outbound` permission and must not be the place where that claim becomes untrue.
  if (described.network) {
    throw new TypeError(`observer.advisor refuses the adapter "${described.id}": it declares`
      + ' network access, and this plugin ships with no network capability at all.');
  }
  const limits = normaliseLimits(partial ?? {});

  return definePlugin({
    name: 'observer.advisor',
    version: '1.0.0',
    sdk: '1',
    description: 'Asks a composed model adapter for recommendations about the active cell, from a'
      + ' bounded context, and answers them as validated, grounded, labelled DATA - never as a'
      + ' measurement and never as an action. Disabled unless a composition loads it.',
    // Both REQUIRED: advice with no cell is a horoscope, and advice that cannot see the
    // auditor's verdicts would be advice about a project nobody checked.
    inject: { [STATE_KEY]: { required: true }, [AUDIT_KEY]: { required: true } },
    // No permission, therefore no port: no network, no filesystem, no process, ever.
    permissions: [],
    config: {
      type: 'object', properties: {}, required: [], additionalProperties: false,
    },
    capabilities: CAPABILITIES,
    /** @param {PluginContext} ctx */
    apply(ctx) {
      const budget = createBudget(limits, now);
      /** @type {Rec[]} */
      let accumulated = [];
      /** @type {string | null} */
      let lastAt = null;
      ctx.onDispose(() => {
        accumulated = [];
        lastAt = null;
        budget.reset();
      });

      return {
        /** @param {{ question?: string, mode?: string }} [input] @param {{ signal?: AbortSignal }} [meta] */
        advise: async (input = {}, meta = {}) => {
          const question = input.question ?? '';
          if (typeof question !== 'string' || question.length > limits.maxQuestionChars) {
            refuse('question', `a question is at most ${limits.maxQuestionChars} characters`);
          }
          const mode = input.mode ?? 'on-demand';
          if (!MODES.includes(mode)) refuse('mode', `mode is one of ${MODES.join(', ')}`);
          const owed = budget.due();
          // Refused BEFORE the adapter is reached: a limit that is checked after the call is
          // a limit on nothing.
          if (owed !== null) refuse(owed.path, owed.message);
          budget.spend();

          const state = /** @type {{ model: () => Promise<import('./types.mjs').AdvisorModel> }} */ (
            ctx.get(STATE_KEY));
          const audit = /** @type {{ findings: (i: object) => Promise<import('./types.mjs').AdvisorFindings> }} */ (
            ctx.get(AUDIT_KEY));
          const [model, findings] = await Promise.all([state.model(), audit.findings({})]);
          const context = buildContext({
            model,
            findings,
            question,
            logEntries: limits.logEntries,
            maxBytes: limits.maxContextBytes,
          });
          const text = await callModel({
            adapter,
            system: SYSTEM_PROMPT,
            context: context.text,
            question,
            maxOutputChars: limits.maxOutputChars,
            timeoutMs: limits.timeoutMs,
            ...(meta.signal === undefined ? {} : { signal: meta.signal }),
          });
          const { recommendations, validation } = validateOutput(text, {
            contextIds: context.ids,
            contextText: context.text,
          });
          const at = new Date().toISOString();
          if (mode === 'silent') {
            accumulated = [...accumulated, ...recommendations].slice(-MAX_ACCUMULATED);
            lastAt = at;
          }
          return {
            recommendations,
            meta: {
              adapter: described.id,
              adapterKind: described.kind,
              network: described.network,
              contextBytes: context.bytes,
              contextCap: context.cap,
              contextItems: context.ids,
              contextDropped: context.dropped,
              calls: budget.used(),
              remaining: budget.remaining(),
              mode,
              generatedBy: /** @type {const} */ ('model'),
              disclaimer: DISCLAIMER,
              validation,
            },
          };
        },
        recommendations: async () => ({
          recommendations: [...accumulated],
          count: accumulated.length,
          lastAt,
          disclaimer: DISCLAIMER,
        }),
        status: async () => ({
          enabled: true,
          adapter: described,
          network: described.network,
          limits: { ...limits },
          calls: { used: budget.used(), remaining: budget.remaining() },
          disclaimer: DISCLAIMER,
        }),
        /** Diagnostics. `portNames` is EMPTY, and this is how a test sees that rather than
         * taking the manifest's word for it; `sessionState` shows the inverse effects ran. */
        portNames: () => Object.keys(ctx.ports).sort(),
        sessionState: () => ({ calls: budget.used(), accumulated: accumulated.length, lastAt }),
      };
    },
  });
}
