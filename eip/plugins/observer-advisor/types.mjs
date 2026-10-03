// The type vocabulary of `observer.advisor`: typedefs only, no runtime code.
//
// Two shapes matter more than the rest. `ModelAdapter` is the whole provider interface —
// anything that can answer with text can be one, which is why nothing below mentions a
// vendor, an endpoint, a token or a weight file. `Rec` is what a model is allowed to have
// said: a label, a sentence, the evidence it cited and its own uncertainty. A model may
// return any JSON it likes; only these fields survive validation, so a field that could be
// executed cannot exist by construction.
//
// Nothing imports this at runtime: `import('./types.mjs').Rec` is read by the type checker
// and never by the module loader.

/** The four epistemic labels of the constitution.
 * @typedef {'VERIFIED' | 'INFERRED' | 'PROPOSED' | 'UNKNOWN'} Label
 */

/** What a recommendation can be ABOUT. A closed list: a model cannot invent a kind, and a
 * frontend cannot receive one it has no rendering for.
 * @typedef {'next-action' | 'contract-review' | 'verification' | 'split-cell' | 'dependency'
 *   | 'pause-or-handoff' | 'architecture' | 'investigation'} RecKind
 */

/** One recommendation, AFTER validation. `statement` is plain text; `evidenceRefs` are ids
 * that were present in the supplied context, every other reference having been removed.
 * There is deliberately no `status` field: a verdict is what the auditor produces.
 * @typedef {{ id: string, kind: RecKind, label: Label, statement: string,
 *   evidenceRefs: string[], uncertainty: string }} Rec
 */

/** What an adapter says about itself. `network` is the field the composition refuses on.
 * @typedef {{ id: string, kind: 'fixture' | 'local' | 'remote', network: boolean,
 *   description: string }} AdapterDescription
 */

/** One completion request. `context` is the bounded text built by `context.mjs`, `question`
 * is the human's own words, and `signal` is the deadline the plugin owns.
 * @typedef {{ system: string, context: string, question: string, maxOutputChars: number,
 *   signal?: AbortSignal }} CompleteRequest
 */

/** The provider-independent interface. A fixture, a local model or a remote service are all
 * the same shape; only `describe()` tells them apart, and only the composition decides which
 * one exists.
 * @typedef {{ id: string, describe: () => AdapterDescription,
 *   complete: (request: CompleteRequest) => Promise<{ text: string }> }} ModelAdapter
 */

/** One item of the bounded context, with the stable id a model may cite.
 * @typedef {{ id: string, kind: 'cell' | 'dependency' | 'log' | 'finding' | 'question',
 *   text: string }} ContextItem
 */

/** The bounded context. `bytes` is measured, `dropped` names what did not fit, and `ids` is
 * the exact set of references a recommendation may be grounded in.
 * @typedef {{ text: string, ids: string[], items: ContextItem[], bytes: number,
 *   cap: number, dropped: string[] }} AdvisorContext
 */

/** What validation RECORDED about one model answer. Counts and lists, never the raw text.
 * @typedef {{ parsed: boolean, accepted: number, rejected: number, downgraded: number,
 *   refsRemoved: string[], notes: string[] }} ValidationRecord
 */

/** The result of validating one model answer.
 * @typedef {{ recommendations: Rec[], validation: ValidationRecord }} Validated
 */

/** The limits a session is held to. All of them are the composition's to set.
 * @typedef {{ maxCallsPerSession: number, minIntervalMs: number, timeoutMs: number,
 *   maxQuestionChars: number, maxContextBytes: number, logEntries: number,
 *   maxOutputChars: number }} Limits
 */

/** The part of the `observer.state` model the advisor consumes. A sibling contract: the
 * advisor imports nothing from the dashboard, it describes the shape it is handed.
 * @typedef {{ entries: ReadonlyArray<{ id: string, name: string, status: string,
 *     nextStep: string | null, dependencies: string[],
 *     cell: Record<string, unknown> | null }>,
 *   logEntries: ReadonlyArray<Record<string, unknown>> }} AdvisorModel
 */

/** The part of an `observer.audit` answer the advisor consumes: ids and verdicts, never the
 * evidence lines. A finding's evidence is the auditor's to publish, not the model's to read.
 * @typedef {{ ran?: boolean,
 *   findings?: ReadonlyArray<{ id?: unknown, rule?: unknown, status?: unknown,
 *     scope?: unknown }> }} AdvisorFindings
 */

export {};
