// commands-approve.mjs — the deciding half of the Builder's CLI: decide, approve, cell,
// prompt, adapters. Split from commands.mjs so each hand-written file stays under 200 lines.
//
// THE TWO SENTENCES THIS FILE EXISTS TO PRINT. Approving a contract is not permission to commit
// it, and planning a cell is not opening one. Both are human decisions the Builder must not
// make or imply, so both are stated in the output every time rather than left to a document
// somebody may not have read: `APPROVAL_NOTICE` and `PLANNED_NOTICE`.
//
// NOTHING HERE DECIDES. `approveContract`, `decide` and `acceptFirstCell` own the refusals;
// these functions only choose which option to read and which line to print. `--confirm` is
// never defaulted and never inferred: without it the underlying module raises
// NEEDS_CONFIRMATION, which the exit table turns into 5.
import { assertAllowed, assertNoPositional, requireOption } from '../cellmode/args.mjs';
import { acceptFirstCell } from './accept.mjs';
import { listAdapters } from './adapters.mjs';
import { approveContract } from './approve.mjs';
import { EXIT, flag, instant, requireDraft, resolveMode } from './cli-shared.mjs';
import { DRAFT_REL } from './commands.mjs';
import { conflicts } from './conflicts.mjs';
import { decide, nextDecisionId, proposeDecision } from './decisions.mjs';
import { BuilderError, CODES } from './errors.mjs';
import { proposeFirstCell } from './first-cell.mjs';
import { renderProposal } from './first-cell-preview.mjs';
import { renderPrompt } from './prompt.mjs';
import { describeFindings, publicationCheck } from './publication.mjs';
import { readiness } from './readiness.mjs';
import { CONTRACT_REL, readContract, readDraft, writeContract, writeDraft } from './store.mjs';

/** @typedef {import('./cli-shared.mjs').BuilderCommandResult} BuilderCommandResult */
/** @typedef {import('../cellmode/types.mjs').ParsedArgs} ParsedArgs */
/** @typedef {import('./types.mjs').Decision} Decision */

export const APPROVAL_NOTICE = `Approval does not authorize committing ${CONTRACT_REL};`
  + ' that is a separate human decision.';

/** @param {string} name @returns {string} */
export const PLANNED_NOTICE = (name) => 'Planned, not active. To start it: '
  + `node tools/cellmode/cli.mjs open "${name}" (or /cell).`;

/** @type {(contract: unknown) => Decision[]} */
const decisionsOf = (contract) => {
  const list = /** @type {Record<string, unknown>} */ (contract).decisions;
  return Array.isArray(list) ? list : [];
};

/** @type {(root: string, options: Record<string, unknown>, env: NodeJS.ProcessEnv)
 *   => BuilderCommandResult} */
function proposeOne(root, options, env) {
  const draft = requireDraft(root);
  const id = nextDecisionId(draft.contract);
  const contract = proposeDecision(draft.contract, {
    question: requireOption(options, 'question', 'decide propose'),
    proposal: requireOption(options, 'proposal', 'decide propose'),
    field: options.field,
  }, instant(env));
  writeDraft(root, { ...draft, contract });
  return {
    lines: [`recorded decision ${id} as pending — nothing is approved`,
      `approve it: decide ${id} approve --confirm · reject it: decide ${id} reject --confirm`],
  };
}

/** @type {(root: string, options: Record<string, unknown>, env: NodeJS.ProcessEnv,
 *   id: string, verdict: string) => BuilderCommandResult} */
function settleOne(root, options, env, id, verdict) {
  if (verdict !== 'approve' && verdict !== 'reject') {
    throw new BuilderError(CODES.BAD_ENTRY, 'decide <id> approve|reject --confirm, or decide propose --question Q --proposal P');
  }
  if (!flag(options, 'confirm')) {
    throw new BuilderError(
      CODES.NEEDS_CONFIRMATION,
      `settling decision ${id} is a human decision — re-run it with --confirm`,
    );
  }
  const draft = requireDraft(root);
  const record = decisionsOf(draft.contract).find((item) => item?.id === id);
  const promotedFrom = record === undefined
    ? undefined
    : draft.proposals.find((p) => p.field === record.field || p.entry.value === record.proposal);
  const settled = /** @type {'approved' | 'rejected'} */ (verdict === 'approve' ? 'approved' : 'rejected');
  const contract = decide(draft.contract, id, settled, instant(env), promotedFrom);
  writeDraft(root, {
    ...draft,
    contract,
    proposals: draft.proposals.filter((p) => p !== promotedFrom),
  });
  return { lines: [`decision ${id} is ${settled} — recorded in ${DRAFT_REL}`] };
}

/** @param {string} root @param {ParsedArgs} args @param {NodeJS.ProcessEnv} [env]
 * @returns {BuilderCommandResult} */
export function cmdDecide(root, { positional, options }, env = process.env) {
  assertAllowed(options, ['root', 'mode', 'question', 'proposal', 'field', 'confirm'], 'decide');
  resolveMode(options);
  if (positional[0] === 'propose' && positional.length === 1) {
    return proposeOne(root, options, env);
  }
  if (positional.length !== 2) {
    throw new BuilderError(CODES.BAD_ENTRY, 'decide propose --question Q --proposal P [--field F]'
      + ' · decide <id> approve|reject --confirm');
  }
  return settleOne(root, options, env, String(positional[0]), String(positional[1]));
}

/** @param {string} root @param {ParsedArgs} args @param {NodeJS.ProcessEnv} [env]
 * @returns {BuilderCommandResult} */
export function cmdApprove(root, { positional, options }, env = process.env) {
  assertAllowed(options, ['root', 'mode', 'confirm'], 'approve');
  assertNoPositional(positional, 'approve');
  resolveMode(options);
  const draft = requireDraft(root);
  const state = readiness(draft.contract);
  const found = conflicts(draft.contract);
  const publication = publicationCheck(draft.contract);
  const lines = [
    `Readiness: ${state.ready ? 'ready' : `${state.blockers.length} blocker(s)`}`,
    ...state.blockers.map((b) => `  - ${b.field}: ${b.reason}`),
    `Conflicts: ${found.length}`,
    ...found.map((c) => `  - [${c.severity}] ${c.message}`),
    `Publication check: ${publication.ok ? 'passed' : `${publication.findings.length} finding(s)`}`,
    ...describeFindings(publication.findings).map((line) => `  - ${line}`),
  ];
  if (!flag(options, 'confirm')) {
    lines.push('Approving the contract is a human decision — re-run it with --confirm.'
      + ' Nothing was written.');
    return { lines, code: EXIT.NEEDS_CONFIRMATION };
  }
  const approved = approveContract(draft.contract, { confirm: true, now: instant(env) });
  writeContract(root, approved);
  writeDraft(root, { ...draft, contract: approved });
  lines.push(`Approved · wrote ${CONTRACT_REL}`, APPROVAL_NOTICE);
  return { lines };
}

/** The contract a proposal or an export is built from: the approved one on disk when it is
 * there, otherwise the draft's. @type {(root: string) => { contract: unknown, stored: unknown,
 *   proposals: ReadonlyArray<import('./types.mjs').Proposal> }} */
function subject(root) {
  const draft = readDraft(root);
  const stored = readContract(root);
  const contract = stored ?? draft?.contract ?? null;
  if (contract === null) {
    throw new BuilderError(CODES.BAD_ENTRY, 'there is no contract and no discovery draft yet —'
      + ' run `start new` or `start existing` first');
  }
  return { contract, stored, proposals: draft?.proposals ?? [] };
}

/** @param {string} root @param {ParsedArgs} args @param {NodeJS.ProcessEnv} [env]
 * @returns {BuilderCommandResult} */
export function cmdCell(root, { positional, options }, env = process.env) {
  assertAllowed(options, ['root', 'mode', 'accept', 'confirm'], 'cell');
  assertNoPositional(positional, 'cell');
  resolveMode(options);
  const { contract, stored, proposals } = subject(root);
  const proposal = proposeFirstCell(contract, { draftProposals: proposals });
  if (!flag(options, 'accept')) {
    return {
      lines: [renderProposal(proposal),
        'Nothing was written. Accept it with: cell --accept --confirm'],
    };
  }
  const created = acceptFirstCell(root, proposal, {
    confirm: flag(options, 'confirm'), contract: stored, env,
  });
  return {
    lines: [...created.lines, `Planned 📋 ${created.file} (${created.kind} cell)`,
      PLANNED_NOTICE(proposal.name)],
  };
}

/** @param {string} root @param {ParsedArgs} args @returns {BuilderCommandResult} */
export function cmdPrompt(root, { positional, options }) {
  assertAllowed(options, ['root', 'mode', 'adapter', 'draft'], 'prompt');
  assertNoPositional(positional, 'prompt');
  const mode = resolveMode(options);
  const { contract, proposals } = subject(root);
  const proposal = proposeFirstCell(contract, { draftProposals: proposals });
  const rendered = renderPrompt(
    contract,
    proposal.cell,
    options.adapter === undefined ? 'neutral' : String(options.adapter),
    { mode, draft: flag(options, 'draft') },
  );
  return {
    lines: [rendered.text.trimEnd()],
    notes: rendered.warnings.map((warning) => `warning: ${warning}`),
  };
}

/** @param {string} root @param {ParsedArgs} args @returns {BuilderCommandResult} */
export function cmdAdapters(root, { positional, options }) {
  assertAllowed(options, ['root', 'mode'], 'adapters');
  assertNoPositional(positional, 'adapters');
  resolveMode(options);
  return {
    lines: listAdapters().map((a) => `${a.id} · ${a.support} · ${a.label}`),
  };
}
