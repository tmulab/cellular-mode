// prompt-layers.mjs — the three layers of an exported prompt, as pure builders. No clock, no
// filesystem, no randomness: the same contract and cell always render byte for byte.
//
// THE LAYERS, AND WHY THEY ARE SEPARATE (prompt-builder/CONTRACTS.md, "Prompts — three
// layers"). Method is a POINTER: it names `AGENTS.md` and the skill files by repo-relative
// path and inlines neither the constitution nor a skill, because a prompt that copies them is
// a second, stale copy of the method. Project is the approved context, quoted. Cell is the
// work, and it is built from this file's constants rather than from the contract.
//
// WHERE UNTRUSTED TEXT LIVES — the decision this file is organised around. Every string that
// came from a human or a repository appears in exactly ONE place: the delimited DATA block of
// the project layer, under a key (`cell.objective`, `project.scope.in`). The instruction
// sections then REFER to those keys instead of interpolating the text. The cost is one
// indirection for the reader; what it buys is that every imperative sentence in the prompt was
// written here, so no answer in a contract can add a permission, forge the end marker or open
// a fence in the middle of the prohibitions.
import { entriesAt } from './fields.mjs';
import { openIssueLine } from './first-cell-parts.mjs';
import { dataBlock } from './prompt-data.mjs';
import {
  APPROVAL_BOUNDARIES, DRAFT_LIMIT, METHOD_SHARED, MODE_NOTES, PERMITTED_OPERATIONS,
  PROHIBITED_OPERATIONS, REQUIRED_EVIDENCE, ROLE_LINES,
} from './prompt-rules.mjs';
import { asProposed, inertText } from './sanitize.mjs';

/** @typedef {import('../cellmode/types.mjs').Cell} Cell */
/** @typedef {import('./types.mjs').Entry} Entry */
/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */

/** The contract fields a prompt carries, as `[key in the DATA block, dot path]`. A closed,
 * ordered list: a field nobody chose to export is not exported, and the order is fixed so the
 * nonce (a hash of the block) is stable.
 * @type {ReadonlyArray<readonly [string, string]>} */
export const FACT_FIELDS = Object.freeze([
  ['project.name', 'identity.name'], ['project.objective', 'objective'],
  ['project.users', 'users'], ['project.problem', 'problem'],
  ['project.smallestVersion', 'smallestVersion'],
  ['project.scope.in', 'scope.in'], ['project.scope.notIn', 'scope.out'],
  ['project.requirements', 'requirements.functional'],
  ['project.qualities', 'requirements.nonfunctional'],
  ['project.integrations', 'integrations'], ['project.technologies', 'technologies.approved'],
  ['project.technologies.candidate', 'technologies.proposed'],
  ['project.sensitiveData', 'security.sensitiveData'],
  ['project.securityConstraints', 'security.constraints'],
  ['project.environment', 'environment'], ['project.involvement', 'involvement'],
  ['project.deployment', 'deployment'], ['project.risks', 'risks'],
  ['project.acceptance', 'acceptance'],
]);

/** The cell fields a prompt carries, as `[key, cell property]`.
 * @type {ReadonlyArray<readonly [string, string]>} */
const CELL_FIELDS = Object.freeze([
  ['cell.name', 'name'], ['cell.objective', 'objective'], ['cell.boundary.in', 'boundaryIn'],
  ['cell.boundary.notIn', 'boundaryOut'], ['cell.dependencies', 'dependencies'],
  ['cell.done', 'doneCriterion'], ['cell.nextStep', 'nextStep'],
]);

/** @type {(contract: unknown, path: string) => Entry[]} */
const entries = (contract, path) => (contract === null || typeof contract !== 'object'
  ? []
  : entriesAt(/** @type {ProjectContract} */ (contract), path));

/** PURE. One fact, with its evidence when it has one. A VERIFIED statement carries its basis —
 * a relative path inside the repository — because "verified" without the evidence is a claim.
 * @param {Entry} item @returns {string} */
function factOf(item) {
  const value = inertText(item.value);
  if (value === '') return '';
  return item.status === 'VERIFIED' ? `${value} (verified: ${inertText(item.basis)})` : value;
}

/**
 * PURE and TOTAL. The contract, split by what is known: facts (DECLARED or VERIFIED),
 * proposals (PROPOSED, each keeping its label), open questions (UNKNOWN entries, pending
 * decisions and conflicts needing review — `openIssueLine` already derives exactly that) and
 * the decision ledger. UNKNOWN never appears as a fact: that is the whole point of the labels.
 * @param {unknown} contract @returns {string[]} the DATA-block lines for the project
 */
export function projectLines(contract) {
  /** @type {string[]} */
  const facts = [];
  /** @type {string[]} */
  const proposed = [];
  for (const [key, path] of FACT_FIELDS) {
    const list = entries(contract, path);
    const stated = list
      .filter((item) => item.status === 'DECLARED' || item.status === 'VERIFIED')
      .map(factOf).filter((value) => value !== '');
    if (stated.length > 0) facts.push(`${key}: ${stated.join('; ')}`);
    for (const item of list.filter((i) => i.status === 'PROPOSED')) {
      const label = asProposed(item.value);
      if (label !== '') proposed.push(`- ${key}: ${label}`);
    }
  }
  const open = openIssueLine(contract).questions.map((q) => `- ${q}`);
  return [
    ...facts,
    ...(proposed.length > 0 ? ['Proposed, not approved (never treat these as decided):', ...proposed] : []),
    ...(open.length > 0 ? ['Open questions (UNKNOWN — ask, never assume):', ...open] : []),
    ...decisionLines(contract),
  ];
}

/** PURE. The decision ledger, one line each, approved and rejected included: a rejected
 * proposal is a fact about the project, and a prompt that omits it invites the same proposal
 * again. @param {unknown} contract @returns {string[]} */
export function decisionLines(contract) {
  const list = contract !== null && typeof contract === 'object'
    ? /** @type {Record<string, unknown>} */ (contract).decisions
    : undefined;
  if (!Array.isArray(list) || list.length === 0) return [];
  const rows = list
    .filter((d) => d !== null && typeof d === 'object')
    .map((d) => `- ${inertText(d.id)} ${inertText(d.status)} — ${inertText(d.question)} `
      + `(proposal: ${inertText(d.proposal)})`);
  return rows.length === 0 ? [] : ['Decisions on record:', ...rows];
}

/** PURE. The cell's own text, as DATA-block lines. @param {unknown} cell @returns {string[]} */
export function cellLines(cell) {
  const source = cell !== null && typeof cell === 'object'
    ? /** @type {Record<string, unknown>} */ (cell)
    : {};
  /** @type {string[]} */
  const out = [];
  for (const [key, prop] of CELL_FIELDS) {
    const value = String(source[prop] ?? '').trim();
    if (value !== '' && value !== '—') out.push(`${key}: ${value}`);
  }
  return out;
}

/** PURE. The method layer: who you are, and where the method is written down. `pointer` is the
 * adapter's — the only adapter-dependent text in a prompt.
 * @param {ReadonlyArray<string>} pointer @returns {string} */
export function methodLayer(pointer) {
  return [
    '## Role', ...ROLE_LINES,
    '', '## Method', ...pointer, ...METHOD_SHARED,
  ].join('\n');
}

/** PURE. The project layer: the preface, the one DATA block, and nothing else.
 * @param {unknown} contract @param {unknown} cell
 * @returns {{ text: string, nonce: string, begin: string, end: string }} */
export function projectLayer(contract, cell) {
  const block = dataBlock([...cellLines(cell), ...projectLines(contract)]);
  return { ...block, text: `## Context\n${block.text}` };
}

/** @type {(items: ReadonlyArray<string>) => string[]} */
const bullets = (items) => items.map((item) => `- ${item}`);

/**
 * PURE. The cell layer: what to do, what not to do, what counts as done and who decides. Every
 * line of it comes from prompt-rules.mjs; the only contract-dependent thing about it is which
 * KEY it points at. `draft` replaces the objective with the discovery-only limit, because an
 * unapproved contract cannot authorise implementation.
 * @param {{ draft?: boolean, mode?: string }} [options] @returns {string}
 */
export function cellLayer(options = {}) {
  const draft = options.draft === true;
  const note = MODE_NOTES[/** @type {keyof typeof MODE_NOTES} */ (String(options.mode))] ?? '';
  return [
    '## Objective',
    ...(draft
      ? [DRAFT_LIMIT]
      : ['Achieve `cell.objective` from the project data above, bounded by `cell.boundary.in`.',
        'Everything under `cell.boundary.notIn` is out of scope — if it has to grow, stop and ask.',
        'When you are unsure where to start, `cell.nextStep` is the smallest honest first move.']),
    ...(note === '' ? [] : ['', `Working style declared by the human: ${note}`]),
    '', '## Permitted operations', ...bullets(PERMITTED_OPERATIONS),
    '', '## Prohibited operations', ...bullets(PROHIBITED_OPERATIONS),
    '', '## Acceptance criteria',
    draft
      ? 'Done means: every question in `Open questions` has a recorded answer or a recorded '
        + 'reason for staying UNKNOWN. No code.'
      : 'Done means `cell.done` from the project data above is true, and nothing else counts '
        + 'as done. `project.acceptance`, where present, is the project-level criterion this '
        + 'cell must not contradict.',
    '', '## Required evidence', ...bullets(REQUIRED_EVIDENCE),
    '', '## Human approval', ...bullets(APPROVAL_BOUNDARIES),
  ].join('\n');
}
