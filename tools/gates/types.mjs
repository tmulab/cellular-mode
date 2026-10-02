// The shared type vocabulary of the gates: typedefs only, no runtime code.
//
// Every gate next door is a pure function over `[{ path, text }]` tuples plus a parsed
// policy object, and every one of them returns FINDINGS. Writing those two shapes once
// is what makes "a gate is a pure rule" a checked statement rather than a convention,
// and it keeps each gate short enough to read in one sitting.
//
// Nothing imports this at runtime: `import('./types.mjs').Finding` is read by the type
// checker and never by the module loader.

/** One file as every gate sees it: a repository-relative POSIX path and its text.
 * @typedef {{ path: string, text: string }} FileTuple
 */

/** A file the size gate may be asked about by line count instead of by text.
 * @typedef {{ path: string, text?: string, lines?: number }} SizedFile
 */

/**
 * One finding: an ADDRESS plus a reason, never a count and never "mostly fine".
 * `line`, `lines` and `limit` are present only where the rule measures them.
 * @typedef {{ rule: string, path: string, detail: string,
 *   line?: number, lines?: number, limit?: number }} Finding
 */

/** The result of one leg of Trilateral Verification.
 * @typedef {{ status: 'pass' | 'fail' | 'warn', text: string, detail?: string }} LegResult
 */

export {};
