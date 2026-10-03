// The type vocabulary of `observer.audit`: typedefs only, no runtime code.
//
// Note what is NOT here: an import of `observer-state`'s types. A sibling plugin arrives
// through `inject`, never through an import, so what the auditor depends on is the SHAPE
// of the model it is handed — declared below, structurally. If the dashboard ever changes
// that shape, this file is the contract the change is measured against, and the type
// checker reports the mismatch instead of a report being quietly wrong.
//
// Nothing imports this at runtime: `import('./types.mjs').Finding` is read by the type
// checker and never by the module loader.

/** The five verdicts. `UNAVAILABLE` is not a kind of PASS and is never counted as one.
 * @typedef {'PASS' | 'FAIL' | 'WARNING' | 'UNAVAILABLE' | 'NOT_APPLICABLE'} Status
 */

/**
 * One judgement. `evidence` holds repository-relative ADDRESSES and measured values —
 * never raw file text, never an absolute path, never a matched secret. `action` is a
 * sentence for a human; the auditor states it and never performs it.
 * @typedef {{ id: string, scope: string, rule: string, status: Status,
 *   evidence: string[], explanation: string, action?: string }} Finding
 */

/** A finding before ids are assigned: the checks produce these, `assignIds` closes them.
 * @typedef {Omit<Finding, 'id'>} Draft
 */

/** One count per status. Totals always equal the number of findings.
 * @typedef {Record<Status, number>} Summary
 */

/** The whole answer of `run-audit`.
 * @typedef {{ at: string, findings: Finding[], summary: Summary }} AuditResult
 */

/** One cell file, as the sibling parsed it. Only the fields this auditor reads.
 * @typedef {{ objective: string, boundaryIn: string, boundaryOut: string,
 *   doneCriterion: string, nextStep: string }} AuditCellFile
 */

/** One cell, as the sibling's model holds it.
 * @typedef {{ id: string, name: string, status: string, nextStep: string | null,
 *   dependencies: string[], cell: AuditCellFile | null }} AuditEntry
 */

/** One log entry. This one IS imported, from the protocol's own vocabulary rather than from
 * the sibling: `log.md` is a Cellular Mode file and `tools/cellmode/types.mjs` is where its
 * shape is declared, so using it keeps the auditor honest about the format it reads and lets
 * it pass entries straight to the pure `lastEntryFor` instead of re-finding them.
 * @typedef {import('../../../tools/cellmode/types.mjs').LogEntry} AuditLogEntry
 */

/** The part of the `observer.state` model the auditor consumes. A sibling contract.
 * @typedef {{ entries: ReadonlyArray<AuditEntry>,
 *   logEntries: ReadonlyArray<AuditLogEntry>,
 *   integrity: { ok: boolean, findings: ReadonlyArray<{ code: string, message: string }> }
 * }} AuditModel
 */

/** One file, as the repository read port lists it. No absolute path, ever.
 * @typedef {{ path: string, size: number, modifiedMs: number }} RepoFile
 */

/** Everything one audit judges, gathered by the plugin and judged by pure functions.
 * @typedef {{ at: string, model: AuditModel,
 *   files: ReadonlyArray<import('../../../tools/gates/types.mjs').FileTuple>,
 *   listed: ReadonlyArray<RepoFile>, skipped: ReadonlyArray<string>,
 *   pkg: Record<string, unknown> | null,
 *   policies: { sizeExceptions: unknown, secretsAllowlist: unknown,
 *     allowedDependencies: unknown, unreadable: ReadonlyArray<string> },
 *   evidence: import('../../../tools/gates/evidence.mjs').Evidence | null,
 *   head: string | null }} AuditInput
 */

export {};
