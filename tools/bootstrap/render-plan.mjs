// render-plan.mjs — the plan as text for a human, for `--dry-run`.
//
// PURE: a plan in, a string out. It writes nothing and decides nothing; every fact it prints is
// already in the plan.
//
// A declared working mode changes WORDING and VERBOSITY only. That is not a style preference, it
// is `adaptive/policies/boundaries.md`: no mode may change a file, a check, an approval or a
// verification. Concretely, only ONE list in this renderer is ever capped — the files to create —
// and `verbose` uncaps even that. Approvals, conflicts, modifications, integrations, proposed
// commands and the verification plan are printed in full in every mode, because those are the
// lines a human decides on, and a tired human must not be shown a shorter set of decisions.
//
// Every path and detail goes through `sanitize`. The target directory is untrusted: a file named
// with an embedded newline would otherwise forge a line of this very report.
import { capList, plural, sanitize } from './display.mjs';
import { DEFAULT_MODE, MODE_CAPS } from './plan-constants.mjs';

/** @typedef {import('./plan.mjs').Plan} Plan */
/** @typedef {import('./plan-actions.mjs').Action} Action */
/** @typedef {'ready'|'tired'|'focus'|'explore'} RenderMode */
/** @typedef {{ mode?: RenderMode, verbose?: boolean }} RenderOptions */

/** @type {ReadonlyArray<string>} */
export const RENDER_MODES = Object.freeze(['ready', 'tired', 'focus', 'explore']);

/** What a managed block is, said once. */
const BLOCK_NOTE = 'managed block between cellular-mode:begin and cellular-mode:end markers';

/** @param {string} mode @returns {number} */
function capOf(mode) {
  const table = /** @type {Readonly<Record<string, number | undefined>>} */ (MODE_CAPS);
  return table[mode] ?? table[DEFAULT_MODE] ?? 20;
}

/** @param {RenderOptions} options @returns {string} */
function modeOf(options) {
  const asked = options.mode;
  return typeof asked === 'string' && RENDER_MODES.includes(asked) ? asked : DEFAULT_MODE;
}

/** One bullet per item, capped, with the remainder named rather than dropped.
 * @param {ReadonlyArray<string>} items @param {number} cap @returns {string[]} */
function bullets(items, cap) {
  const { shown, hidden } = capList(items, cap);
  const lines = shown.map((text) => `  - ${text}`);
  if (hidden > 0) lines.push(`  … and ${plural(hidden, 'more path')}`);
  return lines;
}

/** @param {Action} entry @returns {string} */
const fileLine = (entry) => (entry.mode === 'copy'
  ? sanitize(entry.path)
  : `${sanitize(entry.path)}  [${entry.mode}]`);

/** @param {Plan} plan @param {boolean} short @returns {string[]} */
function componentSection(plan, short) {
  /** @type {string[]} */
  const out = [`${short ? 'Components' : 'Resolved components'} (${plan.components.length}):`];
  for (const entry of plan.components) out.push(`  - ${sanitize(entry.id)} — ${sanitize(entry.reason)}`);
  if (plan.added.length > 0) {
    out.push('', `${short ? 'Added' : 'Added as dependencies'} (${plan.added.length}):`);
    for (const entry of plan.added) out.push(`  - ${sanitize(entry.id)} — required by ${sanitize(entry.by)}`);
  }
  if (plan.skipped.length > 0) {
    out.push('', `${short ? 'Skipped' : 'Not installed, and why'} (${plan.skipped.length}):`);
    for (const entry of plan.skipped) out.push(`  - ${sanitize(entry.id)} — ${sanitize(entry.reason)}`);
  }
  return out;
}

/** The file sections. `create` is the only capped list in the whole renderer.
 * @param {Plan} plan @param {boolean} short @param {number} cap @returns {string[]} */
function fileSection(plan, short, cap) {
  const byKind = (/** @type {string} */ kind) => plan.actions.filter((entry) => entry.kind === kind);
  const creates = byKind('create');
  /** @type {string[]} */
  const out = [`${short ? 'Create' : 'Files to create'} (${creates.length}):`];
  out.push(...bullets(creates.map(fileLine), cap));
  if (creates.length === 0) out.push('  (none)');
  const modifies = byKind('modify-block');
  if (modifies.length > 0) {
    out.push('', `${short ? 'Modify' : 'Files to modify'} (${modifies.length}):`);
    for (const entry of modifies) out.push(`  - ${sanitize(entry.path)} — ${BLOCK_NOTE}`);
  }
  const patches = byKind('propose-patch');
  if (patches.length > 0) {
    out.push('', `${short ? 'Patches proposed' : 'Patches proposed for review, never applied'} (${patches.length}):`);
    for (const entry of patches) out.push(`  - ${sanitize(entry.path)} — ${sanitize(entry.reason)}`);
  }
  const references = byKind('reference');
  if (references.length > 0) {
    out.push('', `${short ? 'Referenced' : 'Referenced, not duplicated'} (${references.length}):`);
    for (const entry of references) out.push(`  - ${sanitize(entry.path)} — ${sanitize(entry.reason)}`);
  }
  const left = byKind('skip-existing');
  if (left.length > 0) {
    out.push('', `${short ? 'Left alone' : 'Existing files Bootstrap refuses to touch'} (${left.length}):`);
    for (const entry of left) out.push(`  - ${sanitize(entry.path)} — ${sanitize(entry.reason)}`);
  }
  out.push('', `${short ? 'Untouched' : 'Existing files this plan does not touch'}: ${plan.untouchedCount}`);
  return out;
}

/** @param {Plan} plan @param {boolean} short @returns {string[]} */
function decisionSection(plan, short) {
  /** @type {string[]} */
  const out = [];
  out.push(`${short ? 'Conflicts' : 'Conflicts needing a human'} (${plan.conflicts.length}):`);
  if (plan.conflicts.length === 0) out.push('  (none)');
  for (const entry of plan.conflicts) out.push(`  - ${sanitize(entry.path)} — ${sanitize(entry.reason)}`);
  out.push('', `${short ? 'Integrations' : 'Integrations'} (${plan.integrations.length}):`);
  for (const entry of plan.integrations) {
    out.push(`  - ${sanitize(entry.kind)} [${sanitize(entry.status)}] ${sanitize(entry.detail)}`);
  }
  out.push('', `${short ? 'Commands proposed' : 'Commands proposed, none of them run'} (${plan.commandsProposed.length}):`);
  if (plan.commandsProposed.length === 0) out.push('  (none)');
  for (const entry of plan.commandsProposed) {
    out.push(`  - ${entry.argv.map((part) => sanitize(part, 60)).join(' ')} [${entry.status}]`);
  }
  out.push('', `${short ? 'Approvals' : 'Approvals required before anything is written'} (${plan.approvals.length}):`);
  if (plan.approvals.length === 0) out.push('  (none)');
  for (const entry of plan.approvals) {
    out.push(`  - [${sanitize(entry.id, 40)}] ${sanitize(entry.action)}`);
    if (!short) out.push(`      why: ${sanitize(entry.why)}`);
  }
  out.push('', `${short ? 'Verification' : 'Verification plan'} (${plan.verification.length}):`);
  if (plan.verification.length === 0) out.push('  (none declared by the selected components)');
  for (const entry of plan.verification) {
    out.push(`  - ${sanitize(entry.id)}: ${entry.argv.map((part) => sanitize(part, 60)).join(' ')}`);
  }
  return out;
}

/**
 * PURE. The plan as text. `mode` changes wording and the single capped list; `verbose` prints
 * every path. An unknown mode falls back to the default rather than throwing: a renderer is not
 * the place to refuse, and no mode is ever inferred.
 * @param {Plan} plan @param {RenderOptions} [options] @returns {string}
 */
export function renderPlan(plan, options = {}) {
  const mode = modeOf(options);
  const short = mode === 'tired';
  const cap = options.verbose === true ? -1 : capOf(mode);
  /** @type {string[]} */
  const out = [];
  out.push(short
    ? 'Cellular Mode — plan only. Nothing is written.'
    : 'Cellular Mode — installation plan. This is a dry run: nothing is written.');
  out.push('');
  out.push(`${short ? 'Profile' : 'Selected profile'}: ${sanitize(plan.profile)}`);
  out.push('');
  out.push(...componentSection(plan, short));
  out.push('');
  out.push(...fileSection(plan, short, cap));
  out.push('');
  out.push(...decisionSection(plan, short));
  return `${out.join('\n')}\n`;
}
