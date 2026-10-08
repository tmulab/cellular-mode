// plan-consent.mjs — the consent document. Contract H5: a plan a human is asked to approve must
// SHOW what they are approving, and it must ask ONCE.
//
// Two trial findings live here. B-03: the managed-block TEXT was never rendered, although the
// plan's own `why:` promised "the block is shown before it is written" — so `plannedBlocks` builds
// the exact bytes `appendBlock` would write (markers included, same `blockFor`, same template) and
// hands them to the renderer. B-04: one dry run printed TWO different approval lists, neither of
// them complete — so `approvalUnion` produces ONE list, in the fixed order of `APPROVAL_IDS`,
// carrying every id the run could use, and both the text and the `--json` form render that same
// list. If they ever disagree, one of them is not the document consent was given against.
//
// THIS MODULE MAY READ THE SOURCE (templates), which is exactly why it is not `render-plan.mjs`:
// the renderer stays pure, takes the blocks and the list as options, and cannot reach a disk.
import { MAX_ACTIONABLE, sanitize } from './display.mjs';
import { APPROVAL_IDS, blockApprovalFor } from './approvals.mjs';
import { BUILDER_IGNORE_WARNING } from './plan-actions.mjs';
import { blockTextFor } from './apply-generate.mjs';
import { renderPlan } from './render-plan.mjs';
import { blockFor, commentStyleFor } from './writer.mjs';

/** @typedef {import('./plan.mjs').Plan} Plan */
/** @typedef {import('./plan.mjs').Approval} Approval */
/** @typedef {import('./render-plan.mjs').PlannedBlock} PlannedBlock */
/** @typedef {import('./apply-generate.mjs').GenerateContext} GenerateContext */

/** Why each approval that no `modify-block` action produced is on the list anyway. Keyed by id and
 * closed: an id nobody explained would be an id a human is asked about without a reason. */
const WHY = Object.freeze({
  hooks: 'it changes how the target repository runs git hooks',
  'first-cell': 'a cell is recorded state: it is created planned and never activated',
  'ci-workflow': 'a workflow runs code: it is additive, least-privilege and written only on request',
  'baseline-checks': 'it RUNS commands this tool merely inferred, once, to record what they do today',
  'agents-block': 'Bootstrap never replaces an existing file; the block is shown before it is written',
  'gitignore-block': 'an ignore rule is not the same decision as a change to the file an agent obeys',
});

/**
 * PURE given `ctx.read`. The exact text of every managed block this plan would append, markers
 * included — the same `blockFor(component, blockTextFor(...), commentStyleFor(path))` that
 * `apply-action.mjs` hands to `appendBlock`, so what is shown is what is written.
 *
 * A `modify-block` action for a file Bootstrap has no block for is UNMERGEABLE at apply time; here
 * it becomes a sentence saying so rather than an exception, because a dry run's job is to report.
 * @param {Plan} plan @param {GenerateContext} ctx @returns {ReadonlyArray<PlannedBlock>}
 */
export function plannedBlocks(plan, ctx) {
  /** @type {PlannedBlock[]} */
  const out = [];
  for (const action of plan.actions.filter((entry) => entry.kind === 'modify-block')) {
    /** @type {string} */
    let text;
    try {
      text = blockFor(action.component, blockTextFor(action, ctx), commentStyleFor(action.path));
    } catch (error) {
      text = `UNKNOWN: ${error instanceof Error ? error.message : 'no managed block for this file'}`;
    }
    // The same function the planner and `apply-action.mjs` consult: never a match on prose.
    out.push(Object.freeze({ path: action.path, approval: blockApprovalFor(action.path), text }));
  }
  return Object.freeze(out);
}

/**
 * PURE. ONE complete approval list: every id of `APPROVAL_IDS` that this run could use, in that
 * fixed order, each with what it unlocks and why. An id the plan itself raised keeps the plan's own
 * wording; `extra` names the ids a FLOW can use that no planned action implies (`baseline-checks`
 * belongs to `existing`, which runs discovered checks, and to nothing else).
 * @param {Plan} plan @param {ReadonlyArray<string>} [extra] @returns {ReadonlyArray<Approval>}
 */
export function approvalUnion(plan, extra = []) {
  /** @type {Map<string, Approval>} */
  const byId = new Map();
  for (const entry of plan.approvals) byId.set(entry.id, entry);
  const table = /** @type {Readonly<Record<string, string | undefined>>} */ (WHY);
  /** @type {Approval[]} */
  const out = [];
  for (const known of APPROVAL_IDS) {
    const planned = byId.get(known.id);
    if (planned !== undefined) {
      out.push(Object.freeze(planned));
      continue;
    }
    if (!extra.includes(known.id)) continue;
    out.push(Object.freeze({ id: known.id, action: known.what,
      why: table[known.id] ?? 'it is a consequential step, so it is never taken on one flag' }));
  }
  return Object.freeze(out);
}

/**
 * PURE. The plan as JSON, carrying the SAME blocks and the SAME one approval list the text form
 * shows. `approvals` replaces the plan's own field rather than sitting beside it: two approval
 * arrays in one document is the defect B-04 reported, in machine-readable form.
 * @param {Plan} plan
 * @param {{ blocks: ReadonlyArray<PlannedBlock>, approvals: ReadonlyArray<Approval> }} extra
 * @returns {string}
 */
export function planJson(plan, extra) {
  return `${JSON.stringify({ ...plan, approvals: extra.approvals, blocks: extra.blocks }, null, 2)}\n`;
}

/**
 * The plan as the lines a flow prints: text, or `--json`, with the blocks and the complete
 * approval list either way. One function so that `new` and `existing` cannot drift apart.
 * @param {{ plan: Plan, read: (rel: string) => string, projectName: string,
 *   json?: boolean | undefined, mode?: import('./render-plan.mjs').RenderMode | undefined,
 *   verbose?: boolean | undefined, extraApprovals?: ReadonlyArray<string> | undefined }} input
 * @returns {string[]}
 */
export function consentRender(input) {
  const blocks = plannedBlocks(input.plan, {
    read: input.read,
    projectName: input.projectName,
    chosen: new Set(input.plan.components.map((entry) => entry.id)),
    contract: null,
  });
  const approvals = approvalUnion(input.plan, input.extraApprovals ?? []);
  if (input.json === true) return [planJson(input.plan, { blocks, approvals }).trimEnd()];
  return [renderPlan(input.plan, {
    ...(input.mode === undefined ? {} : { mode: input.mode }),
    verbose: input.verbose === true, blocks, approvals,
  }).trimEnd()];
}

/**
 * PURE. The warnings still LIVE after the human answered. Every warning a plan carries states a
 * consequence of WITHHOLDING an approval, so the matching approval clears it; anything left is
 * printed by the install summary, in full, because the human has to act on it (contract H2).
 * @param {Plan} plan @param {ReadonlySet<string>} approvals @returns {string[]}
 */
export function warningLines(plan, approvals) {
  const live = plan.warnings.filter((line) => (
    line !== BUILDER_IGNORE_WARNING || !approvals.has('gitignore-block')));
  if (live.length === 0) return [];
  return ['', `WARNING (${live.length}) — this install did not change it:`,
    ...live.map((line) => `  ! ${sanitize(line, MAX_ACTIONABLE)}`)];
}
