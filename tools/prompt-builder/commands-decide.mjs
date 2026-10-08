// commands-decide.mjs — the `decide` command, in three forms: propose one by hand, settle a
// recorded one, and settle the Builder's OWN recommendation without retyping it. Split out of
// commands-approve.mjs so each hand-written file stays under 200 lines.
//
// `accept-proposal` IS A COMPOSITION, NOT A NEW RULE. It does exactly what a human did by hand
// in the adoption trial — `decide propose --question … --proposal …` followed by
// `decide <id> approve --confirm` — and the only thing it removes is the retyping of the
// Builder's own proposal string, which is where a human silently edits a recommendation and
// then approves something the tool never said. The promotion itself still goes through
// `proposeDecision` + `decide`: one route from PROPOSED to settled, and the decision record is
// written either way, so the contract's history is identical to the hand-typed one.
//
// `--confirm` IS NEVER DEFAULTED AND NEVER INFERRED. Without it the refusal is
// NEEDS_CONFIRMATION, which the exit table turns into 5, and nothing is written.
import { assertAllowed, requireOption } from '../cellmode/args.mjs';
import { flag, instant, requireDraft, resolveMode } from './cli-shared.mjs';
import { DRAFT_REL } from './commands.mjs';
import { decide, nextDecisionId, proposeDecision } from './decisions.mjs';
import { BuilderError, CODES } from './errors.mjs';
import { proposalFor } from './proposals.mjs';
import { questionById } from './questions.mjs';
import { writeDraft } from './store.mjs';

/** @typedef {import('./cli-shared.mjs').BuilderCommandResult} BuilderCommandResult */
/** @typedef {import('../cellmode/types.mjs').ParsedArgs} ParsedArgs */
/** @typedef {import('./types.mjs').Decision} Decision */
/** @typedef {import('./types.mjs').Draft} Draft */

export const USAGE_LINE = 'decide propose --question Q --proposal P [--field F]'
  + ' · decide <id> approve|reject --confirm'
  + ' · decide accept-proposal|reject-proposal <questionId> --confirm';

/** @type {(contract: unknown) => Decision[]} */
const decisionsOf = (contract) => {
  const list = /** @type {Record<string, unknown>} */ (contract).decisions;
  return Array.isArray(list) ? list : [];
};

/** The refusal every verdict shares. @type {(what: string) => never} */
function needsConfirmation(what) {
  throw new BuilderError(
    CODES.NEEDS_CONFIRMATION,
    `${what} is a human decision — re-run it with --confirm`,
  );
}

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
    throw new BuilderError(CODES.BAD_ENTRY, USAGE_LINE);
  }
  if (!flag(options, 'confirm')) needsConfirmation(`settling decision ${id}`);
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

/** The Builder's own recommendation for one question, recorded as a decision and settled in
 * the same step. Nothing is retyped and nothing is inferred: the proposal text is the entry's
 * own value, and the decision carries the question bank's wording.
 * @type {(root: string, options: Record<string, unknown>, env: NodeJS.ProcessEnv,
 *   verdict: 'accept' | 'reject', questionId: string) => BuilderCommandResult} */
function settleProposal(root, options, env, verdict, questionId) {
  const draft = requireDraft(root);
  const found = proposalFor(draft, questionId);
  if (found === null) {
    throw new BuilderError(CODES.BAD_ENTRY, 'no PROPOSED recommendation is recorded for question'
      + ` "${questionId}" — run \`status\` to see the ones that are`);
  }
  if (!flag(options, 'confirm')) needsConfirmation(`${verdict}ing the proposal for ${questionId}`);
  const at = instant(env);
  const id = nextDecisionId(draft.contract);
  const pending = proposeDecision(draft.contract, {
    question: questionById(questionId)?.prompt ?? `the recommendation recorded for ${found.field}`,
    proposal: found.entry.value,
    field: found.field,
  }, at);
  const settled = /** @type {'approved' | 'rejected'} */ (verdict === 'accept' ? 'approved' : 'rejected');
  const promotedFrom = draft.proposals.find((p) => p.questionId === questionId);
  const contract = decide(pending, id, settled, at, promotedFrom);
  writeDraft(root, { ...draft, contract, proposals: draft.proposals.filter((p) => p !== promotedFrom) });
  return {
    lines: [`decision ${id} records the proposal for ${questionId} and is ${settled}`,
      `the recommendation recorded at ${found.field} is ${settled} — see ${DRAFT_REL}`],
  };
}

/** @param {string} root @param {ParsedArgs} args @param {NodeJS.ProcessEnv} [env]
 * @returns {BuilderCommandResult} */
export function cmdDecide(root, { positional, options }, env = process.env) {
  assertAllowed(options, ['root', 'mode', 'question', 'proposal', 'field', 'confirm'], 'decide');
  resolveMode(options);
  if (positional[0] === 'propose' && positional.length === 1) {
    return proposeOne(root, options, env);
  }
  if (positional.length !== 2) throw new BuilderError(CODES.BAD_ENTRY, USAGE_LINE);
  const [first, second] = [String(positional[0]), String(positional[1])];
  if (first === 'accept-proposal' || first === 'reject-proposal') {
    return settleProposal(root, options, env, first === 'accept-proposal' ? 'accept' : 'reject', second);
  }
  return settleOne(root, options, env, first, second);
}
