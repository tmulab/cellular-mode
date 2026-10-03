// The type vocabulary of `observer.state`: typedefs only, no runtime code.
//
// These shapes ARE the contract an independent frontend is built against, so they are
// written once here and referenced by the model, the views and the layout. Nothing
// imports this at runtime: `import('./types.mjs').Model` is read by the type checker
// and never by the module loader.

/** @typedef {import('../../../tools/cellmode/types.mjs').Cell} Cell */
/** @typedef {import('../../../tools/cellmode/types.mjs').LogEntry} LogEntry */
/** @typedef {import('../../../tools/cellmode/types.mjs').Finding} Finding */

/** One thing the observer noticed and refuses to hide. `cell` is present only when
 * the warning is about one cell.
 * @typedef {{ code: string, message: string, cell?: string }} Warning
 */

/** Why a next step is absent, when it is. `'none'` is the protocol's INTENTIONAL
 * emptiness (a completed cell has no next step); `'not-recorded'` is a gap in the
 * record. `nextStep` is `null` for both.
 * @typedef {'recorded' | 'none' | 'not-recorded'} NextStepState
 */

/** One cell, as the model holds it: the INDEX row and the cell file, reconciled.
 * `cell` is `null` when there is no readable `cells/<id>.md`.
 * @typedef {{ id: string, name: string, area: string | null, status: string,
 *   statusSymbol: string, lastVisit: string | null, nextStep: string | null,
 *   nextStepState: NextStepState, dependencies: string[], cell: Cell | null }} Entry
 */

/** The whole vault, read once.
 * @typedef {{ entries: Entry[], byId: Map<string, Entry>, logEntries: LogEntry[],
 *   missing: string[], warnings: Warning[],
 *   integrity: { ok: boolean, findings: Finding[] } }} Model
 */

/** One recorded closure, as the API publishes it. `kind` is derived from the logged
 * status: the protocol logs pause and completion and nothing else. `status` is the
 * WORD (one vocabulary with CellSummary and GraphNode), `null` for a symbol the
 * protocol does not define; `statusSymbol` is always what the log actually said.
 * @typedef {{ at: string, cell: string, kind: 'pause' | 'complete' | 'reconstructed',
 *   status: string | null, statusSymbol: string, facts: string | null,
 *   decisions: string | null, build: string | null, nextStep: string | null,
 *   nextStepState: NextStepState }} TimelineEvent
 */

/** One node of the graph, with its position already computed — server-side, always.
 * `column` is the INTEGER INDEX into `layout.columns`, not the status itself: the
 * status is already there as a word, and an index is what a viewer lays out with.
 * @typedef {{ id: string, name: string, status: string, column: number, layer: number,
 *   x: number, y: number, z: number }} GraphNode
 */

/** A declared dependency, resolved (`edges`) or not (`dangling`).
 * @typedef {{ from: string, to: string }} GraphEdge
 */

export {};
