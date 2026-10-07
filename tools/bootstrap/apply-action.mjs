// apply-action.mjs — what ONE planned action does, and nothing about the install as a whole.
//
// Split from `apply.mjs` for the 200-line rule and because the two answer different questions:
// this file answers "what does this action do to this path?" and `apply.mjs` answers "in what
// order, under which gates, and what is recorded". Every branch here corresponds to exactly one
// `kind` the planner produced, so a reader comparing the two files can check the coverage by eye.
//
// THE APPROVAL IS ASKED FIRST. A `modify-block` action whose id the human did not pass returns no
// files and a `proposed` line instead: the step is recorded as not done, never silently done and
// never silently dropped.
import { blockTextFor, generateFor } from './apply-generate.mjs';
import { blockApprovalFor } from './approvals.mjs';
import { appendBlock, copyMode, mkdirIn, readIfPresent, sha256, writeNew } from './writer.mjs';

/** @typedef {import('./plan-actions.mjs').Action} Action */
/** @typedef {import('./install-manifest.mjs').FileRecord} FileRecord */
/** @typedef {{ targetRoot: string, readSource: (rel: string) => Buffer,
 *   generate: import('./apply-generate.mjs').GenerateContext,
 *   approvals: ReadonlySet<string> }} ActionContext */

/** The approval id one action needs, or `null` when it needs none. Only an append to a file
 * somebody else wrote is gated here; a brand-new file is covered by `--confirm` and by the fact
 * that `writeNew` refuses to overwrite. @param {Action} action @returns {string | null} */
export function approvalFor(action) {
  return action.kind === 'modify-block' ? blockApprovalFor(action.path) : null;
}

/** One action's writes, or the reason it was skipped. The only place that chooses between copy,
 * generate and a managed block.
 * @param {Action} action @param {ActionContext} ctx
 * @returns {{ files: FileRecord[], proposed: string | null }} */
export function applyAction(action, ctx) {
  const needed = approvalFor(action);
  if (needed !== null && !ctx.approvals.has(needed)) {
    return { files: [], proposed: `proposed, not applied: append a managed block to ${action.path} (approval "${needed}" was not given)` };
  }
  if (action.kind === 'modify-block') {
    const record = appendBlock(ctx.targetRoot, action.path, action.component, blockTextFor(action, ctx.generate));
    return { files: [{ ...record, mode: 'generate' }], proposed: null };
  }
  if (action.kind === 'propose-patch') {
    return { files: [], proposed: `proposed, not applied: ${action.path} exists and Bootstrap never replaces a file` };
  }
  if (action.kind === 'skip-existing') {
    return { files: [], proposed: `left alone: ${action.path} (${action.reason})` };
  }
  if (action.kind === 'reference') {
    const text = readIfPresent(ctx.targetRoot, action.path);
    if (text === null) return { files: [], proposed: `referenced but absent: ${action.path}` };
    const digest = sha256(text);
    return { files: [{ path: action.path, mode: 'reference', created: false, sha256Before: digest, sha256After: digest }], proposed: null };
  }
  if (action.mode === 'copy') {
    const bytes = ctx.readSource(String(action.source));
    // `copyMode` is `null` for every copy but an `article-8` git hook, which git would otherwise
    // ignore for not being executable. The recorded digest is of the CONTENT either way.
    const record = writeNew(ctx.targetRoot, action.path, bytes, copyMode(action.component, action.path));
    return { files: [{ ...record, mode: 'copy' }], proposed: null };
  }
  /** @type {FileRecord[]} */
  const files = [];
  for (const produced of generateFor(action, ctx.generate)) {
    if (produced.dir === true) {
      mkdirIn(ctx.targetRoot, produced.rel);
      continue;
    }
    files.push({ ...writeNew(ctx.targetRoot, produced.rel, String(produced.bytes)), mode: 'generate' });
  }
  return { files, proposed: null };
}
