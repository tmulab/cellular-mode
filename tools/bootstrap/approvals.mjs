// approvals.mjs — the closed list of things a human can approve, as IDS rather than as prose.
//
// `plan.mjs` already states each approval in a sentence a human reads. A sentence is the wrong
// thing for `--approve` to match on: reword it and every scripted install silently stops
// approving what it used to. So each approval also carries an `id` from the list below, and
// `apply.mjs` consults the id and nothing else.
//
// FAIL CLOSED, twice. An id the human does not pass is not approved, so the action is recorded as
// `proposed` and skipped — never silently done. An id the human passes that is NOT in this list
// is a USAGE refusal rather than a no-op, because a typo in `--approve` would otherwise read as
// consent withheld and look exactly like consent given to nothing.
import { CODES, refuse } from './errors.mjs';
import { GITIGNORE } from './plan-constants.mjs';

/** @typedef {{ id: string, what: string }} ApprovalId */

/** Every approval id, with the one consequential step it unlocks. Ordered as a human meets them. */
export const APPROVAL_IDS = Object.freeze([
  Object.freeze({ id: 'agents-block', what: 'append a managed block to an existing AGENTS.md or CLAUDE.md' }),
  Object.freeze({ id: 'gitignore-block', what: `append a managed block to an existing ${GITIGNORE}` }),
  Object.freeze({ id: 'hooks', what: 'activate the git hooks by setting core.hooksPath' }),
  Object.freeze({ id: 'first-cell', what: 'create the first cell, planned and never activated' }),
  Object.freeze({ id: 'ci-workflow', what: 'write the proposed additive CI workflow file' }),
  // The only approval in this list that causes a program to RUN. It is last on purpose: everything
  // above it writes a file, and a file can be read before it is believed. Executing a command this
  // tool merely INFERRED from somebody's manifest is a different kind of act, and it also needs
  // --confirm, so neither flag alone can do it.
  Object.freeze({ id: 'baseline-checks', what: 'run the discovered checks once, to record their pre-existing results in the adoption baseline' }),
]);

/** @type {ReadonlyArray<string>} */
export const APPROVAL_NAMES = Object.freeze(APPROVAL_IDS.map((entry) => entry.id));

/** PURE. The approval id that governs appending a block to one managed file. `.gitignore` has its
 * own id because approving a change to the instruction file an agent obeys and approving an
 * ignore rule are not the same decision.
 * @param {string} path @returns {string} */
export function blockApprovalFor(path) {
  return path === GITIGNORE || path.endsWith(`/${GITIGNORE}`) ? 'gitignore-block' : 'agents-block';
}

/**
 * The approved set, or a USAGE refusal naming the unknown ids. `value` is whatever the CLI read
 * from `--approve`: a comma-separated string, a list, or nothing at all.
 * @param {unknown} value @returns {ReadonlySet<string>}
 */
export function parseApprovals(value) {
  if (value === undefined || value === null || value === true) return new Set();
  const parts = (Array.isArray(value) ? value : String(value).split(','))
    .map((part) => String(part).trim())
    .filter((part) => part !== '');
  const unknown = parts.filter((part) => !APPROVAL_NAMES.includes(part));
  if (unknown.length > 0) {
    throw refuse(CODES.USAGE,
      `--approve does not know ${unknown.join(', ')}; the ids are ${APPROVAL_NAMES.join(', ')}`,
      { unknown, known: APPROVAL_NAMES });
  }
  return new Set(parts);
}

/** PURE. The `--approve` reference, one line per id, for the usage text and the plan's footer.
 * @returns {ReadonlyArray<string>} */
export function approvalLines() {
  return Object.freeze(APPROVAL_IDS.map((entry) => `  ${entry.id.padEnd(16)}${entry.what}`));
}
