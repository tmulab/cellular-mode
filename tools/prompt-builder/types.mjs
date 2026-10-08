// types.mjs — the type vocabulary of the Cellular Prompt Builder. Typedefs only, no
// runtime code, so importing it costs the module loader nothing (the same arrangement as
// tools/cellmode/types.mjs).
//
// Two shapes carry the whole discovery half of the Builder: an ENTRY (one project
// statement plus how we know it) and a DRAFT (the discovery session, stored under
// vault/builder/). Every module here reads or writes one of them.
//
// WHERE A RECOMMENDATION LIVES (decided in Stage 6, Cell 2; see `Proposal`).
// When the human answers "I don't know" and the question bank carries a deterministic
// recommendation, the recommendation is NOT written over the field: the field stays
// UNKNOWN, and the recommendation is recorded as a PROPOSED entry. Two cases:
//   * list fields — appended to the list named by the question (`technologies` answers go
//     to `technologies.proposed`, never to `technologies.approved`);
//   * single-Entry fields (objective, involvement, environment, …) — the entry keeps its
//     UNKNOWN value and the proposal is recorded at DRAFT level, in `draft.proposals`.
// The draft is the private scratchpad; the contract is the record. Putting an involvement
// recommendation into `technologies.proposed` would make the contract say something about
// technology that nobody said, so the draft holds it until a human decision promotes it
// (Cell 3/4), which is also why `Proposal` keeps the question id it came from.

/** How a statement is known. The five labels of the constitution, nothing more.
 * @typedef {'DECLARED' | 'VERIFIED' | 'INFERRED' | 'PROPOSED' | 'UNKNOWN'} Status */

/** One project statement. `basis` is required unless the status is DECLARED (the human
 * said it, and that is the whole basis); UNKNOWN always carries `value: ''`.
 * @typedef {{ value: string, status: Status, basis?: string }} Entry */

/** A recorded question whose answer would change the next step. Derived, never hand-edited.
 * @typedef {{ id: string, question: string, field: string }} OpenQuestion */

/** A proposal put to the human. Only `status: 'approved'` promotes a PROPOSED entry, and
 * the promoted entry then carries `basis: "decision:<id>"`. `field` is optional provenance:
 * the dot path the proposal was about, recorded so a later approval knows what it promotes
 * instead of guessing from the proposal text (see decisions.mjs).
 * @typedef {{ id: string, question: string, proposal: string,
 *   status: 'pending' | 'approved' | 'rejected', at: string | null,
 *   field?: string }} Decision */

/** One schema complaint: where it is, and what is wrong. Never the offending value.
 * @typedef {{ path: string, message: string }} ValidationError */

/** @typedef {{ ok: boolean, errors: ValidationError[] }} ValidationResult */

/** What stops a contract from being approved. @typedef {{ field: string, reason: string }} Blocker */

/** @typedef {{ ready: boolean, blockers: Blocker[], openQuestions: OpenQuestion[] }} Readiness */

/** A contradiction inside the contract, surfaced for the human and never auto-resolved.
 * @typedef {{ kind: string, severity: 'blocking' | 'review', fields: string[],
 *   message: string }} Conflict */

/** One publication finding: where a forbidden shape is, and which shape. Never the value.
 * @typedef {{ path: string, kind: string }} PublicationFinding */

/** @typedef {{ ok: boolean, findings: PublicationFinding[] }} PublicationResult */

/** Which discovery path the session is on.
 * @typedef {'new' | 'existing' | 'resume'} ProjectPath */

/** The project contract, schema `cellular-mode/project-contract`, version 1. The key set is
 * closed: anything a project needs to add goes under `extensions` with an `x-` name.
 * @typedef {{
 *   schema: 'cellular-mode/project-contract',
 *   version: 1,
 *   path: ProjectPath,
 *   identity: { name: Entry, slug: string },
 *   objective: Entry, users: Entry, problem: Entry, smallestVersion: Entry,
 *   scope: { in: Entry[], out: Entry[] },
 *   requirements: { functional: Entry[], nonfunctional: Entry[] },
 *   integrations: Entry[],
 *   technologies: { approved: Entry[], proposed: Entry[] },
 *   security: { sensitiveData: Entry, constraints: Entry[] },
 *   environment: Entry, involvement: Entry,
 *   deployment: Entry[], risks: Entry[],
 *   openQuestions: OpenQuestion[],
 *   decisions: Decision[],
 *   acceptance: Entry[],
 *   approval: { approved: boolean, at: string | null },
 *   extensions: Record<string, unknown>,
 * }} ProjectContract */

/** A deterministic recommendation for an unanswered question: what to do, what it assumes
 * and what it costs. Written by hand in the question bank, never generated.
 * @typedef {{ value: string, assumptions: string, tradeoffs: string }} Recommendation */

/** One question of the bank. `field` is a dot path into the contract (`scope.in`,
 * `security.sensitiveData`); `paths` says which discovery paths ask it; lower `priority`
 * is asked first. `acceptsNone` marks the one kind of question an explicit "none" answers
 * truthfully (the exclusions question): the answer is recorded as "asked, and the human
 * declared nothing" — the field stays empty, because a list of exclusions nobody stated is
 * not a list with "none" in it.
 * @typedef {{ id: string, field: string, prompt: string, help: string,
 *   paths: ReadonlyArray<ProjectPath>, priority: number,
 *   unknownRecommendation?: Recommendation, acceptsNone?: boolean }} Question */

/** A question as it is handed to the interface. In `tired` mode `help` is absent.
 * @typedef {{ id: string, field: string, prompt: string, help?: string }} AskedQuestion */

/** A recommendation recorded against a single-Entry field. See the note at the top.
 * @typedef {{ questionId: string, field: string, entry: Entry }} Proposal */

/** The discovery session, stored at `vault/builder/draft.json`.
 * @typedef {{ schema: 'cellular-mode/builder-draft', version: 1, contract: ProjectContract,
 *   asked: string[], skipped: string[], proposals: Proposal[] }} Draft */

/** One read-only inspection finding: a contract field and the VERIFIED entry for it.
 * @typedef {{ field: string, entry: Entry }} Finding */

/** What `inspectProject` reports beside the findings.
 * @typedef {{ hasCellularState: boolean, manifests: string[], languages: string[],
 *   instructionFiles: string[] }} InspectionSummary */

/** @typedef {{ findings: Finding[], summary: InspectionSummary }} Inspection */

/** What `readCellState` reports about an existing `vault/state/`.
 * @typedef {{ exists: boolean, active: string | null, paused: string[] }} CellState */

/** Where `startSession` routes. `draft` is absent whenever the Builder must not create one.
 * @typedef {{ action: 'new-draft' | 'continue-draft' | 'defer-to-cell' | 'confirm-needed'
 *   | 'nothing-to-resume', message: string, draft?: Draft }} SessionResult */

export {};
