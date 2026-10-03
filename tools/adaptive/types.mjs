// The type vocabulary of Cellular Adaptive: typedefs only, no runtime code.
//
// Five shapes carry the whole module. A MODE DEFINITION is a registry row. A SESSION
// STATE is the one temporary thing ever written to disk — a mode the human declared, with
// the window in which that declaration applies. PREFERENCES are the persistent half, and
// they deliberately cannot hold a mode: a declaration that can be persisted stops being
// temporary. An EFFECTIVE MODE is what a reader computes from the two plus the clock, and
// its STANDING says which of the four situations it is in, so that "expired" is never
// rendered as "active" and "unreadable" is never rendered as "none".
//
// Nothing imports this at runtime: `import('./types.mjs').SessionState` is read by the
// type checker and never by the module loader, so the module stays dependency-free.

/** The four modes. `ready` is the default and is never stored.
 * @typedef {'ready' | 'tired' | 'focus' | 'explore'} ModeId
 * @typedef {'tired' | 'focus' | 'explore'} TemporaryModeId
 */

/** One registry row. `policyFile` is a repository-relative path; `temporary` is false for
 * `ready` alone, because the default is a state and not a declaration.
 * @typedef {{ id: ModeId, aliases: ReadonlyArray<string>, policyFile: string,
 *   temporary: boolean }} ModeDefinition
 */

/** An adaptation boundary, as data: something no mode changes.
 * @typedef {{ id: string, statement: string }} Invariant
 */

/** A dimension a mode MAY change — presentation and granularity only.
 * @typedef {{ id: string, dimension: string, note: string }} AdaptableDimension
 */

/** What `.cellular/adaptive/session.json` holds, schema 1. `command` is the text the
 * human typed, kept verbatim so the record is auditable; `source` is stamped by whoever
 * wrote the file, never by whoever reported the declaration.
 * @typedef {{ schema: 1, mode: TemporaryModeId, declaredBy: 'user',
 *   source: 'claude-hook' | 'cli' | 'skill', command: string, activatedAt: string,
 *   expiresAt: string, scope: 'session' }} SessionState
 */

/** What `.cellular/adaptive/preferences.json` holds, schema 1. There is no `mode` field
 * and there never will be one: see `FORBIDDEN_PREFERENCE_KEYS` in `schema.mjs`.
 * @typedef {{ schema: 1, enabled: boolean, ttlHours: number,
 *   communication?: 'concise' | 'default' | 'detailed' }} Preferences
 */

/** Why the effective mode is what it is. `none` means nothing was declared; `expired`
 * means a declaration was found and its window has closed; `invalid` means a declaration
 * was found and could not be read as one; `disabled` means the module was turned off and
 * nothing is injected. The five are distinct on purpose: `invalid` rendered as `none`
 * would turn a broken file into "the human declared nothing", which is a different claim.
 * (`invalid` was added in cell 2, when there was a reader that could meet one.)
 * @typedef {'active' | 'expired' | 'invalid' | 'none' | 'disabled'} Standing
 */

/** The read-only answer every consumer gets — the CLI, the context builder and the
 * optional observer plugin. `notice` carries the one line a human must see (an expired or
 * unreadable declaration), and is `null` when there is nothing to say. `source` is the
 * provenance of the declaration, carried through so that a block an agent receives can name
 * which door the mode came in by (added in cell 3, for the context header).
 * @typedef {{ enabled: boolean, mode: ModeId, standing: Standing,
 *   declaredBy: 'user' | null, source: SessionState['source'] | null,
 *   activatedAt: string | null, expiresAt: string | null,
 *   notice: string | null }} EffectiveMode
 */

/** One structured validation failure. `path` is the offending key, or `''` for the value
 * as a whole.
 * @typedef {{ path: string, message: string }} ValidationError
 */

/** The total answer of a validator: no throws, no partial values.
 * @template T
 * @typedef {{ ok: true, value: T } | { ok: false, errors: ValidationError[] }} ValidationResult
 */

export {};
