// modes.mjs — the mode registry of Cellular Adaptive, and the two lists that bound it. PURE.
//
// Everything here is DATA a reviewer can read without reading an algorithm: four modes,
// their command vocabulary, the file that explains each one, and — most importantly — the
// two lists that say what adaptation may and may not touch. INVARIANTS is the half that no
// mode changes; ADAPTABLE is the half that a mode may. Keeping both as frozen data is what
// makes "no mode weakens a gate" a testable claim instead of a promise in a document.
//
// There is exactly ONE function in this file, and it maps a string the human typed to a
// mode id. That is deliberate: a second function here would be the place where somebody
// eventually guesses a mode from behaviour, and this module exists to make that impossible
// to add quietly. A mode exists because the human declared it, or it does not exist.

/** @typedef {import('./types.mjs').AdaptableDimension} AdaptableDimension */
/** @typedef {import('./types.mjs').Invariant} Invariant */
/** @typedef {import('./types.mjs').ModeDefinition} ModeDefinition */
/** @typedef {import('./types.mjs').ModeId} ModeId */

/** Where the on-demand policy texts live, repository-relative. */
export const POLICY_DIR = 'adaptive/policies';

/** The file injected with EVERY active mode: the boundaries no mode may cross. */
export const BOUNDARIES_POLICY = `${POLICY_DIR}/boundaries.md`;

/** The default. Declaring it stores nothing — it deletes the session file instead. */
export const DEFAULT_MODE = 'ready';

/** @type {(id: ModeId, aliases: string[], temporary: boolean) => ModeDefinition} */
const define = (id, aliases, temporary) => Object.freeze({
  id,
  aliases: Object.freeze(aliases),
  policyFile: `${POLICY_DIR}/${id}.md`,
  temporary,
});

/**
 * The registry. `aliases` holds the alternative spellings only — the canonical id is
 * always accepted and is not repeated there. Portuguese aliases are part of the contract,
 * not a convenience: the person declaring a mode does it in the language they are thinking
 * in, and the system never needs to know what the word means to honour the declaration.
 * @type {ReadonlyArray<ModeDefinition>}
 */
export const MODES = Object.freeze([
  define('ready', ['modoestoubem', 'estoubem'], false),
  define('tired', ['modocansado', 'cansado'], true),
  define('focus', ['modofoco', 'foco'], true),
  define('explore', ['modoexplorar', 'explorar'], true),
]);

/** @type {ReadonlyArray<ModeId>} */
export const MODE_IDS = Object.freeze(MODES.map((m) => m.id));

/** @type {(id: string, statement: string) => Invariant} */
const invariant = (id, statement) => Object.freeze({ id, statement });

/**
 * What adaptation never changes. This list is the module's reason to exist: a declared
 * mode is a statement about FORM, and a statement about form cannot reach the floor the
 * work stands on. Declaring a mode is not an authorization, so none of these can be
 * reached by declaring anything.
 * @type {ReadonlyArray<Invariant>}
 */
export const INVARIANTS = Object.freeze([
  invariant('INV-01', 'The quality gates run and are reported with real counts: typecheck, build, tests.'),
  invariant('INV-02', 'Security findings are reported in full, immediately, under every mode.'),
  invariant('INV-03', 'Batch, destructive and protected-resource operations still wait for explicit human approval.'),
  invariant('INV-04', 'Acceptance criteria and tests come first, are proved red, and are never skipped or weakened.'),
  invariant('INV-05', 'Evidence and epistemic labels stay mandatory: VERIFIED, INFERRED, PROPOSED, UNKNOWN; unrun is UNKNOWN.'),
  invariant('INV-06', 'Least privilege holds: no mode widens a permission, a port or a plugin capability.'),
  invariant('INV-07', 'Cell integrity holds: one active cell, every closure recorded, the log appended and never rewritten.'),
  invariant('INV-08', 'Failures and uncertainty are reported; no mode buys silence about a problem.'),
  invariant('INV-09', 'A declaration is not an authorization, and no mode grants one.'),
  invariant('INV-10', 'The system never infers, classifies or diagnoses a human state: a mode exists only because the human declared it.'),
]);

/** @type {(id: string, dimension: string, note: string) => AdaptableDimension} */
const adaptable = (id, dimension, note) => Object.freeze({ id, dimension, note });

/**
 * What a declared mode MAY change. Every entry is presentation or granularity: how much
 * is said, how many open questions arrive at once, how large one step is, what a reader
 * sees first. Nothing on this list changes which items exist, only their form and order.
 * @type {ReadonlyArray<AdaptableDimension>}
 */
export const ADAPTABLE = Object.freeze([
  adaptable('ADA-01', 'communication detail', 'how much is said per exchange, and how much of it is recap.'),
  adaptable('ADA-02', 'decision presentation', 'how many open questions arrive at once, and how alternatives are framed.'),
  adaptable('ADA-03', 'task granularity', 'the size of one step before reporting back.'),
  adaptable('ADA-04', 'scope breadth', 'how far beyond the active cell a suggestion may reach before it is parked.'),
  adaptable('ADA-05', 'notification volume', 'whether a non-urgent remark interrupts now or waits for the step report.'),
  adaptable('ADA-06', 'exploration versus execution', 'whether a turn is expected to produce options or to produce code.'),
  adaptable('ADA-07', 'ordering of what is shown', 'which items a reader meets first; never which items exist.'),
]);

/**
 * PURE. Maps what the human typed to a mode id, or `null`.
 *
 * Accepts the canonical id and the registry aliases, with or without one leading slash,
 * in any case, with surrounding whitespace: `/tired`, `tired`, `/modocansado`, `cansado`.
 * Everything else is `null` — the match is exact, never a prefix, so `tire` and
 * `tired now` are not declarations. Non-strings are answered, not thrown at.
 * @param {unknown} input
 * @returns {ModeId | null}
 */
export function resolveMode(input) {
  if (typeof input !== 'string') return null;
  const token = input.trim().toLowerCase().replace(/^\//, '');
  if (token === '') return null;
  for (const mode of MODES) {
    if (token === mode.id || mode.aliases.includes(token)) return mode.id;
  }
  return null;
}
