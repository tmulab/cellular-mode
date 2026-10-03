// fields.mjs — PURE. The words this application is willing to say about a value, and
// about the absence of one. No DOM, no payload shapes: just the vocabulary.
//
// A `null` from the contract means THE PROTOCOL DID NOT RECORD IT, and that is rendered
// as the literal words — never as an empty cell, a dash, or a plausible guess. One
// absence is different, and it is the reason this module exists separately: the next
// step of a COMPLETED cell is empty on purpose, so it is a recorded fact and must not
// borrow the sentence reserved for a gap in the record.

/** The one phrasing for "the vault does not have this". */
export const NOT_RECORDED = 'not recorded';

/** The one phrasing for "the protocol recorded that there is none": a completed cell has
 * no next step, and `cellmode complete` writes exactly that. */
export const NONE_COMPLETED = 'None — cell completed';

/** @typedef {{ text: string, recorded: boolean }} Field */

/** PURE. A nullable contract value as a field. Empty strings count as absent: a field
 * the writer left blank is not a fact either.
 * @param {unknown} value @returns {Field} */
export function field(value) {
  if (value === null || value === undefined) return { text: NOT_RECORDED, recorded: false };
  const text = typeof value === 'string' ? value.trim() : String(value);
  if (text === '') return { text: NOT_RECORDED, recorded: false };
  return { text, recorded: true };
}

/** PURE. A list as a field: an empty list is recorded as the explicit absence of edges.
 * @param {unknown} value @param {string} [emptyText] @returns {Field} */
export function listField(value, emptyText = 'none declared') {
  if (!Array.isArray(value)) return field(null);
  if (value.length === 0) return { text: emptyText, recorded: true };
  return { text: value.map((item) => String(item)).join(', '), recorded: true };
}

/** PURE. The next step, read together with the `nextStepState` the contract publishes
 * beside it. Only that state can tell an intentional absence from a missing one: both
 * arrive as `nextStep: null`, because a sentinel string would be data pretending to be a
 * value. A payload without the state (an older host) is read exactly as before —
 * absent, never promoted to a completion.
 * @param {Record<string, unknown>} record @returns {Field} */
export function nextStepField(record) {
  const source = record ?? {};
  if (source['nextStepState'] === 'none') return { text: NONE_COMPLETED, recorded: true };
  return field(source['nextStep']);
}
