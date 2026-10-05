// first-cell-preview.mjs — the proposal as something a human can read before deciding. PURE.
//
// It renders the cell through cellmode's OWN `renderCellFile`, never a second formatter: the
// point of a preview is that what the human approved is byte-identical to what lands in
// `vault/state/cells/<slug>.md`, and a prettier preview would be a different document.
//
// THE HEADER IS PART OF THE SAFETY. A cell file on disk means "this cell exists"; this text
// means "it does not, yet". So the first line says so, before any field, and the preview also
// lists what the proposal could not settle — a human reading only the cell would see a tidy
// boundary and no sign of the four questions it rests on.
//
// NO SECOND SANITIZER. Every string inside a proposal was made inert at the one boundary that
// quotes contract text (sanitize.mjs, used by first-cell-parts.mjs), so this module escapes
// nothing: a second pass would double every backslash and show the human an escape sequence
// they never typed. first-cell.test.mjs asserts the output of THIS function, with hostile
// fixture text, carries no fence and no heading that came from the contract.
import { renderCellFile } from '../cellmode/cell-file.mjs';

/** @typedef {import('./first-cell.mjs').FirstCellProposal} FirstCellProposal */

export const PROPOSAL_HEADING = '# PROPOSED — not approved, not active';

/** @type {(title: string, items: ReadonlyArray<string>, empty?: string) => string[]} */
function section(title, items, empty) {
  const lines = items.filter((item) => String(item ?? '').trim() !== '');
  if (lines.length === 0 && empty === undefined) return [];
  return [`## ${title}`, ...(lines.length === 0 ? [empty ?? ''] : lines.map((i) => `- ${i}`)), ''];
}

/**
 * PURE and TOTAL. The proposal as markdown for human review: the refusal header first, then
 * why this kind of cell, what it cannot settle, which approvals it needs, and last the cell
 * exactly as cellmode would write it. Deterministic — no clock, no counter, no filesystem.
 * @param {FirstCellProposal} proposal @returns {string}
 */
export function renderProposal(proposal) {
  const kind = String(proposal?.kind ?? 'unknown');
  return [
    PROPOSAL_HEADING,
    '',
    'Nothing has been created. Accepting this proposal creates a 📋 PLANNED cell only;',
    'opening it is a separate, human action (`cellmode open`).',
    '',
    `**Kind:** ${kind} · **Cell:** ${String(proposal?.name ?? '')} · `
      + `**Slug:** ${String(proposal?.slug ?? '')}`,
    '',
    ...section('Why this cell', proposal?.reasons ?? []),
    ...section('Not settled by this proposal', proposal?.blockers ?? [], 'nothing — the contract answers every required field'),
    ...section('Approvals required', proposal?.approvalsRequired ?? []),
    '## The proposed cell',
    '',
    renderCellFile(proposal?.cell),
  ].join('\n');
}
