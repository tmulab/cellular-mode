// render-report.mjs — the Adoption Compatibility Report as text, and as JSON.
//
// PURE: a report in, a string out. Every string in the report has already been sanitized by
// `report.mjs`; this file adds structure and nothing else, so there is exactly one place where an
// untrusted name could have become a line of output, and it is not here.
//
// THE LABEL IS PRINTED ON EVERY SECTION HEADING, not in a legend at the bottom. A reader who skims
// must not be able to mistake an INFERRED command for a VERIFIED one, and a legend they did not
// reach is a label they never saw.
import { capList, plural } from './display.mjs';

/** @typedef {import('./report.mjs').AdoptionReport} AdoptionReport */
/** @typedef {import('./report.mjs').ReportLine} ReportLine */

/** How many lines a section prints before it names the remainder. Analysis is a document a human
 * reads: a hundred inferred conventions is a wall, and the count is the useful part. */
export const SECTION_CAP = 24;

/** @param {ReadonlyArray<ReportLine>} items @param {number} cap @returns {string[]} */
function section(items, cap) {
  if (items.length === 0) return ['  (none)'];
  const { shown, hidden } = capList(items, cap);
  const out = shown.map((entry) => (entry.evidence === null
    ? `  - ${entry.text}`
    : `  - ${entry.text}   [${entry.evidence}]`));
  if (hidden > 0) out.push(`  … and ${plural(hidden, 'more line')}`);
  return out;
}

/**
 * PURE. The report as text. `cap` is display only: conflicts, unknowns and approvals are NEVER
 * capped, because those are the lines a human decides on. `approvals: false` omits the approval
 * list, and is used on the INSTALL path only, where the plan carries the one complete list (H5):
 * two lists in one dry run was trial finding B-04, and the fix is one list, not a shorter second.
 * @param {AdoptionReport} report
 * @param {{ cap?: number | undefined, approvals?: boolean | undefined }} [options]
 * @returns {string}
 */
export function renderReport(report, options = {}) {
  const cap = options.cap ?? SECTION_CAP;
  /** @type {string[]} */
  const out = [
    `Adoption Compatibility Report — ${report.target}`,
    '',
    'This is analysis only. Nothing was written, nothing was executed.',
    '',
    `Detected facts — VERIFIED (${report.detected.length}):`,
    ...section(report.detected, cap),
    '',
    `Inferred conventions — INFERRED, with the basis (${report.inferred.length}):`,
    ...section(report.inferred, cap),
    '',
    `Proposed integrations — PROPOSED, none of this has happened (${report.proposed.length}):`,
    ...section(report.proposed, cap),
    '',
    `Conflicts (${report.conflicts.length}):`,
  ];
  out.push(...(report.conflicts.length === 0
    ? ['  (none)']
    : report.conflicts.map((entry) => `  - [${entry.kind}] ${entry.detail}`)));
  out.push('', `Unknowns — UNKNOWN (${report.unknowns.length}):`);
  out.push(...report.unknowns.map((text) => `  - ${text}`));
  if (options.approvals !== false) {
    out.push('', `Approvals required (${report.approvals.length}):`);
    out.push(...report.approvals.map((entry) => `  - ${entry.id}: ${entry.what}`));
  }
  out.push('', `Suggested profile: ${report.profileSuggestion}`);
  out.push(`Next: existing <target> --profile ${report.profileSuggestion} --dry-run`);
  return out.join('\n');
}

/** PURE. The report as a JSON document, pretty-printed with a trailing newline — the form a human
 * redirects to a file and a tool parses. The report record is already closed and sanitized, so
 * this is a serialisation and not a second contract. @param {AdoptionReport} report
 * @returns {string} */
export function reportJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
