// The type vocabulary of the Cellular Mode CLI: typedefs only, no runtime code.
//
// Three shapes carry the whole protocol, and every module here reads or writes one of
// them: a CELL (the complete state of one unit of work), an INDEX ROW (its line in the
// dashboard projection) and a LOG ENTRY (one closure, append-only). Writing them once
// is what keeps the parsers, the renderers and the integrity guard talking about the
// same thing instead of three similar things.
//
// Nothing imports this at runtime: `import('./types.mjs').Cell` is read by the type
// checker and never by the module loader, so the CLI stays dependency-free.

/** One cell, every field a string — the file format has no other kind of value.
 * @typedef {{ name: string, id: string, area: string, opened: string, status: string,
 *   objective: string, boundaryIn: string, boundaryOut: string, inputs: string,
 *   outputs: string, allowed: string, prohibited: string, dependencies: string,
 *   doneCriterion: string, lastFact: string, build: string, decisions: string,
 *   openIssues: string, minimalContext: string, nextStep: string }} Cell
 */

/** One row of INDEX.md. `slug` is `null` for a hand-written row with no link.
 * @typedef {{ name: string, slug: string | null, area: string, status: string,
 *   lastVisit: string, nextStep: string }} IndexRow
 */

/** One entry of log.md, after parsing. Absent fields read as the empty string.
 * @typedef {{ timestamp: string, date: string, cell: string, status: string,
 *   facts: string, decisions: string, build: string, next: string, note: string }} LogEntry
 */

/** A log entry about to be written: only the stamp and the status are certain.
 * @typedef {{ timestamp: string, status: string, cell?: unknown, facts?: unknown,
 *   decisions?: unknown, build?: unknown, next?: unknown, note?: unknown }} LogDraft
 */

/** What `findCell` answers. Discriminated on `kind`, so a caller that checked
 * `'none'` and `'ambiguous'` may read `row` without another guard.
 * @typedef {{ kind: 'exact', row: IndexRow, candidates?: undefined }
 *   | { kind: 'fuzzy', row: IndexRow, candidates?: undefined }
 *   | { kind: 'ambiguous', candidates: IndexRow[], row?: undefined }
 *   | { kind: 'none', candidates: IndexRow[], row?: undefined }} Lookup
 */

/** One integrity finding: a code from `check.mjs` CODES plus a sentence.
 * @typedef {{ code: string, message: string }} Finding
 */

/** What CURRENT-CELL.md claims, when it claims anything.
 * @typedef {{ name: string, id: string, cell: Cell }} CurrentCell
 */

/** Every path the CLI touches, and the whole state it reads in one go.
 * @typedef {ReturnType<typeof import('./paths.mjs').statePaths>} StatePaths
 * @typedef {ReturnType<typeof import('./state.mjs').readState>} State
 */

/** A parsed command line, and what a command hands back to `main`.
 * @typedef {{ positional: string[], options: Record<string, string | boolean> }} ParsedArgs
 * @typedef {{ lines?: string[], code?: number }} CommandResult
 * @typedef {(root: string, parsed: ParsedArgs,
 *   env?: NodeJS.ProcessEnv) => CommandResult | undefined} CommandFn
 */

export {};
