// first-cell.mjs — "what is the FIRST cell of this project?", as one pure function.
//
// PURE and TOTAL: no clock, no filesystem, no process. It returns a VALUE — a proposal — and
// nothing about a cell changes because it was called. Creating the 📋 planned cell is
// accept.mjs's job and activating it is the human's (`cellmode open`): prepare → approve →
// activate, three separate steps, as prompt-builder/CONTRACTS.md names them.
//
// THREE KINDS, AND THE ORDER THEY ARE ASKED IN. A first cell can only be as honest as the
// contract behind it, so the proposal changes shape rather than guessing:
//   1. discovery — the contract contradicts itself, or nobody has said what the project is
//      FOR. Nothing can be bounded from that, so the cell's work is answering questions.
//   2. architecture — the purpose is stated but no stack is decided: `technologies.approved`
//      holds nothing stated, or only the DEFERRAL, or a decision is pending. It yields decisions.
//   3. implementation — purpose, scope and stack all stated. The cell is bounded to the
//      smallest useful version and nothing else.
// The undecided stack is asked BEFORE a missing `scope.in`: a project whose objective is clear
// and whose stack is open needs the stack decision first.
//
// ONE CELL, NEVER TWO. "One ACTIVE cell at a time" is the human's to manage, and a tool that
// proposes a backlog has already decided the order of work for them.
import { makeCell } from '../cellmode/cell-file.mjs';
import { slugify } from '../cellmode/slug.mjs';
import { blockingConflicts, holdsSensitiveData } from './conflicts.mjs';
import { readiness } from './readiness.mjs';
import { inertText, joinInert } from './sanitize.mjs';
import {
  ALLOWED, PROHIBITED, VERIFICATION, exclusions, factAt, openIssueLine, projectLabel,
  statedValues, undecidedStack,
} from './first-cell-parts.mjs';

/** @typedef {import('../cellmode/types.mjs').Cell} Cell */
/** @typedef {import('./types.mjs').Blocker} Blocker */
/** @typedef {import('./types.mjs').Proposal} Proposal */
/** @typedef {'implementation' | 'discovery' | 'architecture'} FirstCellKind */
/** @typedef {{ kind: FirstCellKind, name: string, slug: string, cell: Cell,
 *   reasons: string[], blockers: string[], approvalsRequired: string[] }} FirstCellProposal */

/** The approvals every proposal carries, in the order the method asks for them. */
const BASE_APPROVALS = Object.freeze([
  'human confirmation (--accept --confirm) before the planned cell is created',
  'human activation: only the human runs `cellmode open` — the Builder never activates a cell',
  'human approval before this cell may be marked ✔ done',
]);

export const SENSITIVE_APPROVAL = 'human review of data handling before any real data is used';

/** @type {(contract: unknown) => boolean} */
function hasPendingDecision(contract) {
  const decisions = contract !== null && typeof contract === 'object'
    ? /** @type {Record<string, unknown>} */ (contract).decisions
    : undefined;
  if (!Array.isArray(decisions)) return false;
  return decisions.some((item) => item !== null && typeof item === 'object'
    && /** @type {Record<string, unknown>} */ (item).status === 'pending');
}

/** @type {(blockers: ReadonlyArray<Blocker>, prefix: string) => Blocker[]} */
const about = (blockers, prefix) => blockers.filter((b) => b.field.startsWith(prefix));

/** PURE. Which kind of first cell this contract can carry, and why.
 * @param {unknown} contract @param {ReadonlyArray<Blocker>} blockers
 * @returns {{ kind: FirstCellKind, reasons: string[] }} */
export function classifyFirstCell(contract, blockers) {
  const blocking = blockingConflicts(contract);
  if (blocking.length > 0) {
    return {
      kind: 'discovery',
      reasons: blocking.map((c) => `the contract contradicts itself: ${inertText(c.message)}`),
    };
  }
  const purpose = about(blockers, 'objective');
  if (purpose.length > 0) {
    return { kind: 'discovery', reasons: purpose.map((b) => `${b.field}: ${inertText(b.reason)}`) };
  }
  const open = undecidedStack(contract);
  if (open !== null) return { kind: 'architecture', reasons: [open] };
  if (hasPendingDecision(contract)) {
    return { kind: 'architecture', reasons: ['a decision is still pending — the stack is not settled'] };
  }
  const scope = about(blockers, 'scope');
  if (scope.length > 0) {
    return { kind: 'discovery', reasons: scope.map((b) => `${b.field}: ${inertText(b.reason)}`) };
  }
  return {
    kind: 'implementation',
    reasons: ['objective, scope and stack are all stated — the first cell can build something'],
  };
}

/** @type {(contract: unknown, blockers: ReadonlyArray<Blocker>) => string[]} */
function discoveryItems(contract, blockers) {
  const fromConflicts = blockingConflicts(contract).map((c) => inertText(c.message));
  const fromBlockers = [...about(blockers, 'objective'), ...about(blockers, 'scope')]
    .map((b) => `${b.field}: ${inertText(b.reason)}`);
  const items = [...fromConflicts, ...fromBlockers, ...openIssueLine(contract).questions];
  return items.filter((item, i) => item !== '' && items.indexOf(item) === i).slice(0, 3);
}

/** @type {(contract: unknown, blockers: ReadonlyArray<Blocker>) => Record<string, string>} */
function discoveryCell(contract, blockers) {
  const items = discoveryItems(contract, blockers);
  const first = items[0] ?? 'what this project is for';
  return {
    objective: 'Resolve the open questions that stop a first implementation cell from being bounded',
    boundaryIn: joinInert(items.length > 0 ? items : [first]),
    boundaryOut: 'any implementation; any feature code; any change outside the project contract',
    outputs: 'one recorded answer per question in the boundary, each with its epistemic label',
    doneCriterion: 'every question listed in the boundary has a recorded answer, or is recorded '
      + `as still UNKNOWN with the reason — evidence: ${VERIFICATION}`,
    nextStep: `Answer the first question in the boundary: ${first}`,
  };
}

/** @type {(contract: unknown) => Record<string, string>} */
function architectureCell(contract) {
  const candidates = factAt(contract, 'technologies.proposed');
  const consider = candidates === '' ? [] : [`consider the recorded candidate — ${candidates}`];
  return {
    objective: `Decide the stack and the project structure for ${projectLabel(contract)}, `
      + 'and record each decision',
    boundaryIn: joinInert([
      'choose the language and runtime',
      'choose the project structure',
      'record one decision per choice, with its assumptions and its trade-offs',
      ...consider,
    ]),
    boundaryOut: 'feature code; any implementation of the smallest version; any deployment',
    outputs: 'one decision record per choice, in the project contract',
    doneCriterion: 'a decision is recorded for the language and runtime and for the project '
      + `structure, each with a basis — evidence: ${VERIFICATION}`,
    nextStep: 'Write down two or three stack options and what each one costs',
  };
}

/** @type {(contract: unknown, proposals: ReadonlyArray<Proposal>) => Record<string, string>} */
function implementationCell(contract, proposals) {
  const scope = statedValues(contract, 'scope.in', 3);
  const smallest = factAt(contract, 'smallestVersion', proposals);
  const objective = smallest !== '' ? smallest : (scope[0] ?? factAt(contract, 'objective', proposals));
  const boundaryIn = scope.length > 0 ? joinInert(scope) : objective;
  const criterion = factAt(contract, 'acceptance', proposals);
  const done = criterion === '' ? 'the boundary above works end to end' : criterion;
  return {
    objective,
    boundaryIn,
    boundaryOut: exclusions(contract),
    outputs: 'working code for the boundary above, with its tests',
    doneCriterion: `${done} — evidence: ${VERIFICATION}`,
    nextStep: `Write the first failing test for: ${scope[0] ?? objective}`,
  };
}

/**
 * PURE and TOTAL. The one first cell this contract can carry, as a cellmode-shaped cell plus
 * the reasoning a human needs to accept or refuse it. Deterministic: the same contract always
 * produces the same proposal, byte for byte, because nothing here reads a clock.
 * @param {unknown} contract
 * @param {{ draftProposals?: ReadonlyArray<Proposal> }} [options]
 * @returns {FirstCellProposal}
 */
export function proposeFirstCell(contract, options = {}) {
  const proposals = Array.isArray(options?.draftProposals) ? options.draftProposals : [];
  const state = readiness(contract);
  const { kind, reasons } = classifyFirstCell(contract, state.blockers);
  const label = projectLabel(contract);
  const name = `${label} — first cell (${kind})`;
  const slug = slugify(name);
  /** @type {Record<string, string>} */
  const shape = kind === 'implementation'
    ? implementationCell(contract, proposals)
    : (kind === 'discovery' ? discoveryCell(contract, state.blockers) : architectureCell(contract));
  const cell = makeCell({
    ...shape,
    name,
    id: slug,
    area: label,
    status: '📋',
    inputs: 'the approved project contract (vault/project-contract.json)',
    allowed: ALLOWED,
    prohibited: PROHIBITED,
    dependencies: joinInert(statedValues(contract, 'integrations')),
    openIssues: openIssueLine(contract).line,
    minimalContext: joinInert([
      `first cell of ${label}`,
      `objective: ${factAt(contract, 'objective', proposals) || 'UNKNOWN'}`,
      `for: ${factAt(contract, 'users', proposals) || 'UNKNOWN'}`,
    ], ' · '),
  });
  return {
    kind,
    name,
    slug,
    cell,
    reasons,
    blockers: state.blockers.map((b) => `${b.field}: ${inertText(b.reason)}`),
    approvalsRequired: holdsSensitiveData(contract)
      ? [...BASE_APPROVALS, SENSITIVE_APPROVAL]
      : [...BASE_APPROVALS],
  };
}
