// approve.mjs — the one place a contract becomes approved. PURE: no clock (the caller passes
// `now`), no filesystem, no process, no network. The import list below is the whole proof: it
// contains only sibling modules of this directory.
//
// APPROVAL IS NOT PUBLICATION, AND NOT ACTIVATION. prompt-builder/CONTRACTS.md is explicit
// (human requirement, 2026-10-04): approving a contract never authorises committing it, and
// the Builder never runs git. It also never opens, plans or activates a cell — cells are
// created and moved only by the cellmode transitions, through `vault/state/`. So this module
// imports nothing that can start a process, nothing that can touch a disk, and nothing from
// outside this directory at all; it returns a VALUE, a new contract. Writing it down is
// store.mjs's job, committing it is the human's, and neither happens because this function
// returned. approve.test.mjs asserts that import list mechanically — and also that this very
// header names no such module, because a comment is not a boundary.
//
// THREE REFUSALS, IN THIS ORDER, each with its own code so a CLI can map it to an exit status:
//   1. NEEDS_CONFIRMATION — `confirm` was not literally `true`. Asked first, before any work:
//      a human who has not confirmed should not be told what else is wrong, because a list of
//      remaining problems reads as an invitation to pass `--confirm` and clear them.
//   2. NOT_READY — readiness.mjs refuses (schema errors, a missing required field, a blocking
//      conflict). `details.blockers` carries the list.
//   3. PUBLICATION_CHECK — publication.mjs found a credential shape, a machine path, an
//      address or a telephone number. `details.findings` carries path and kind, never values.
//
// WHAT APPROVAL DOES NOT CHANGE: no entry's status, no entry's value, no decision. The only
// edits are `approval` and the DERIVED `openQuestions`. An approved contract whose objective is
// a PROPOSED recommendation stays PROPOSED — approval is a statement about the document, not a
// promotion of everything inside it. Promotion has exactly one route: decisions.mjs.
import { BuilderError, CODES } from './errors.mjs';
import { publicationCheck } from './publication.mjs';
import { deriveOpenQuestions, readiness } from './readiness.mjs';
import { ISO_8601 } from './validate-parts.mjs';

/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */

/**
 * PURE. The approved contract, or a typed refusal. Returns a NEW object; the input is not
 * mutated, and may safely be frozen.
 * @param {ProjectContract} contract
 * @param {{ confirm?: unknown, now?: unknown }} options
 * @returns {ProjectContract}
 */
export function approveContract(contract, options) {
  if (options?.confirm !== true) {
    throw new BuilderError(
      CODES.NEEDS_CONFIRMATION,
      'approving a contract is a human decision — re-run it with --confirm',
    );
  }
  const now = String(options.now ?? '');
  if (!ISO_8601.test(now)) {
    throw new BuilderError(CODES.BAD_ENTRY, 'an approval records an ISO-8601 instant');
  }
  const state = readiness(contract);
  if (!state.ready) {
    throw new BuilderError(
      CODES.NOT_READY,
      `the contract is not ready to approve: ${state.blockers.length} blocker(s)`,
      { blockers: state.blockers },
    );
  }
  const publication = publicationCheck(contract);
  if (!publication.ok) {
    throw new BuilderError(
      CODES.PUBLICATION_CHECK,
      `the contract is not fit to publish: ${publication.findings.length} finding(s)`,
      { findings: publication.findings },
    );
  }
  return {
    ...structuredClone(contract),
    openQuestions: deriveOpenQuestions(contract),
    approval: { approved: true, at: now },
  };
}

/** PURE. Is this contract already approved? Asked in one place so no caller has to decide what
 * a `true` with no instant means (validate.mjs refuses that combination outright).
 * @param {unknown} contract @returns {boolean} */
export function isApproved(contract) {
  if (contract === null || typeof contract !== 'object') return false;
  const approval = /** @type {Record<string, unknown>} */ (contract).approval;
  if (approval === null || typeof approval !== 'object') return false;
  const { approved, at } = /** @type {Record<string, unknown>} */ (approval);
  return approved === true && typeof at === 'string' && ISO_8601.test(at);
}
