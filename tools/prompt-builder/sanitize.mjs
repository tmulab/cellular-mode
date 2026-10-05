// sanitize.mjs — "render this text as TEXT", for every place the Builder quotes a human's
// own words back into a markdown document. PURE and TOTAL.
//
// The contract stores ordinary-language answers; a cell file and a prompt are markdown. So
// every value travelling from the first to the second crosses a boundary where a string can
// stop being a string: a line that begins with `#` becomes a heading, three backticks open or
// close a fenced block, a pipe splits a table cell. `inertText` is that boundary, in one
// place, so a later module cannot forget it.
//
// WHAT IT DOES NOT DO: it does not decide whether the text is safe to record. That question
// belongs to sensitive.mjs (credentials, machine paths, contact details) and is asked when the
// answer is TYPED. This module only guarantees that whatever was recorded is rendered as
// content rather than as structure.
//
// The control-character strip is NOT a second implementation: it is `sanitizeValue` from
// contract-shape.mjs, the same function the entry constructor uses, so the two cannot drift.
import { sanitizeValue } from './contract-shape.mjs';

/** The marker every unproven value carries when it is shown as if it were one. */
export const PROPOSED_LABEL = 'PROPOSED:';

/** Characters that start a markdown block when they start a line, and the ordered-list form
 * (`1.`, `2)`) — which is why a bare leading digit is left alone: "3 reports a week" is not a
 * list, and escaping it would make the human's own sentence look mangled. */
const BLOCK_START = /^(?:[#>\-+*=`~[|]|\d+[.)])/;

/**
 * PURE and TOTAL. `text` rendered inert: control characters gone (via `sanitizeValue`), all
 * whitespace collapsed to single spaces so no second line exists to be a heading, every
 * backtick and pipe escaped so no fence opens and no table cell splits, and a leading
 * block-start character escaped so the value cannot become structure.
 *
 * Backslash escaping only — no zero-width or look-alike characters are inserted, so the text
 * a human reads back is the text they typed.
 * @param {unknown} text @returns {string}
 */
export function inertText(text) {
  const flat = sanitizeValue(text).replace(/\s+/g, ' ').trim();
  if (flat === '') return '';
  const escaped = flat
    .replaceAll('\\', '\\\\')
    .replaceAll('`', '\\`')
    .replaceAll('|', '\\|');
  return BLOCK_START.test(escaped) ? `\\${escaped}` : escaped;
}

/**
 * PURE and TOTAL. Several pieces on one line, empty ones dropped.
 *
 * INERT ONCE, NEVER TWICE. This function escapes NOTHING: everything it joins has already
 * crossed the boundary above (`inertText`, `asProposed`, `statedValues`). Escaping again would
 * turn `\`` into `\\\``, and the human would be shown escape sequences they never typed — a
 * second sanitizer is not twice as safe, it is wrong. The callers' contract is therefore:
 * contract text becomes inert exactly where it is read out of the contract, and every
 * assembly step after that is plain string work.
 * @param {ReadonlyArray<string>} parts @param {string} [separator] @returns {string}
 */
export function joinInert(parts, separator = '; ') {
  return (Array.isArray(parts) ? parts : [])
    .map((part) => String(part ?? '').trim())
    .filter((part) => part !== '')
    .join(separator);
}

/** PURE. A value shown with its epistemic label, because it is not a fact.
 * @param {unknown} text @returns {string} */
export function asProposed(text) {
  const inert = inertText(text);
  return inert === '' ? '' : `${PROPOSED_LABEL} ${inert}`;
}
