// plan-actions.mjs — one question, asked once: what does this plan DO to this path?
//
// PURE. The whole safety rule of `bootstrap/CONTRACTS.md`, "Safe modification of existing files",
// lives in `classify`, and it has exactly one shape: a path that already exists is NEVER created.
//
//   it does not exist                       -> create
//   it exists and we understand its syntax  -> modify-block  (an appended managed block, approved)
//   it exists and we generate it            -> propose-patch (shown, never applied)
//   it exists and we would have COPIED it    -> skip-existing + a CONFLICT
//   it is only referenced                   -> reference
//
// The copied case is a conflict and not a patch for an epistemic reason: a copy's content is only
// known once the source file is read, and this module reads nothing. "Same bytes or different
// bytes" is therefore UNKNOWN here, and UNKNOWN about overwriting someone's file is a stop.
import {
  BUILDER_DRAFT_DIR, BUILDER_IGNORE_LINE, GITIGNORE, MANAGED_FILES,
} from './plan-constants.mjs';

/** @typedef {import('./catalog.mjs').Component} Component */
/** @typedef {{ source: string, target: string }} Expanded */
/** @typedef {'create'|'modify-block'|'propose-patch'|'skip-existing'|'reference'} Kind */
/** @typedef {'copy'|'generate'|'reference'} Mode */
/** @typedef {{ path: string, component: string, kind: Kind, mode: Mode, source?: string,
 *   template?: string, reason: string }} Action */
/** @typedef {{ path: string, reason: string }} PathConflict */

/** Why each kind was chosen, in the words the dry-run shows. */
export const REASONS = Object.freeze({
  create: 'new file',
  'modify-block': 'exists — a managed block is appended, with approval',
  'propose-patch': 'exists — a patch is proposed, never applied',
  'skip-existing': 'exists — human review',
  reference: 'an existing authoritative file is pointed to, not duplicated',
  'reference-absent': 'referenced path is absent — human review',
  'directory-used': 'directory already holds files — human review',
});

/** @param {string} prefix @param {ReadonlySet<string>} existing @returns {boolean} */
const anyUnder = (prefix, existing) => {
  for (const path of existing) if (path.startsWith(prefix)) return true;
  return false;
};

/**
 * PURE. The kind and the conflict (if any) for one planned path.
 * @param {string} path target-relative, `/`-separated; a trailing `/` means a directory
 * @param {Mode} mode @param {ReadonlySet<string>} existing
 * @returns {{ kind: Kind, reason: string, conflict: string | null }}
 */
export function classify(path, mode, existing) {
  if (mode === 'reference') {
    const absent = !existing.has(path);
    return { kind: 'reference', reason: absent ? REASONS['reference-absent'] : REASONS.reference,
      conflict: absent ? REASONS['reference-absent'] : null };
  }
  if (path.endsWith('/')) {
    if (!anyUnder(path, existing)) return { kind: 'create', reason: REASONS.create, conflict: null };
    return { kind: 'skip-existing', reason: REASONS['directory-used'], conflict: REASONS['directory-used'] };
  }
  if (!existing.has(path)) return { kind: 'create', reason: REASONS.create, conflict: null };
  if (MANAGED_FILES.includes(path)) {
    return { kind: 'modify-block', reason: REASONS['modify-block'], conflict: null };
  }
  if (mode === 'generate') return { kind: 'propose-patch', reason: REASONS['propose-patch'], conflict: null };
  return { kind: 'skip-existing', reason: REASONS['skip-existing'], conflict: REASONS['skip-existing'] };
}

/** @param {string} component @param {string} path @param {Mode} mode @param {ReadonlySet<string>} existing
 * @param {{ source?: string, template?: string }} extra @returns {Action} */
export function action(component, path, mode, existing, extra = {}) {
  const verdict = classify(path, mode, existing);
  /** @type {Action} */
  const built = { path, component, kind: verdict.kind, mode, reason: verdict.reason };
  if (extra.source !== undefined) built.source = extra.source;
  if (extra.template !== undefined) built.template = extra.template;
  return Object.freeze(built);
}

/**
 * PURE. Every action one component contributes. Copy actions come from `expanded` — the concrete
 * file list the caller derived with `expandFiles`, so this module never walks a tree. Generate and
 * reference actions come from the manifest, which is the only place they are declared.
 * @param {Component} component @param {ReadonlyArray<Expanded>} expanded
 * @param {ReadonlySet<string>} existing @returns {ReadonlyArray<Action>}
 */
export function componentActions(component, expanded, existing) {
  const id = String(component.id);
  /** @type {Action[]} */
  const out = [];
  for (const file of expanded) {
    out.push(action(id, file.target, 'copy', existing, { source: file.source }));
  }
  const entries = Array.isArray(component.files) ? component.files : [];
  for (const entry of entries) {
    const record = /** @type {Record<string, unknown>} */ (entry);
    const mode = record.mode;
    if (mode !== 'generate' && mode !== 'reference') continue;
    const path = String(record.target);
    const extra = typeof record.template === 'string' ? { template: record.template }
      : typeof record.source === 'string' ? { source: record.source } : {};
    out.push(action(id, path, mode, existing, extra));
  }
  return Object.freeze(out);
}

/** PURE. The conflicts implied by a set of actions, sorted by path. Kept separate from the
 * actions so that a caller can show both without recomputing either.
 * @param {ReadonlyArray<Action>} actions @param {ReadonlySet<string>} existing
 * @returns {ReadonlyArray<PathConflict>} */
export function conflictsOf(actions, existing) {
  /** @type {Map<string, string>} */
  const found = new Map();
  for (const entry of actions) {
    const conflict = classify(entry.path, entry.mode, existing).conflict;
    if (conflict !== null && !found.has(entry.path)) found.set(entry.path, conflict);
  }
  return Object.freeze([...found.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([path, reason]) => Object.freeze({ path, reason })));
}

/** The one warning contract H2 requires, as one line a human can act on. Exported so that the
 * plan, the renderer and the install summary all print the SAME sentence. */
export const BUILDER_IGNORE_WARNING = `${BUILDER_DRAFT_DIR} holds a Prompt Builder draft and`
  + ` ${GITIGNORE} already exists, so the rule that hides it is only appended with`
  + ` --approve gitignore-block. Without that approval the draft MAY BECOME COMMITTABLE.`
  + ` The exact line to add to ${GITIGNORE} yourself: ${BUILDER_IGNORE_LINE}`;

/**
 * PURE. What a human must be told even though nothing is wrong yet. A warning is not a conflict:
 * it never stops an install, and it is printed in full in every mode, because it names a privacy
 * consequence of WITHHOLDING an approval — the one thing a plan would otherwise be silent about.
 * @param {{ hasBuilderDraft: boolean }} facts @param {ReadonlyArray<Action>} actions
 * @returns {ReadonlyArray<string>}
 */
export function warningsOf(facts, actions) {
  /** @type {string[]} */
  const out = [];
  const gated = actions.some((entry) => entry.kind === 'modify-block' && entry.path === GITIGNORE);
  if (facts.hasBuilderDraft && gated) out.push(BUILDER_IGNORE_WARNING);
  return Object.freeze(out);
}

/** PURE. Actions in a total order: by path, then component, then kind. A plan whose order
 * depends on how a caller happened to iterate is not a plan anybody can diff.
 * @param {ReadonlyArray<Action>} actions @returns {ReadonlyArray<Action>} */
export function sortActions(actions) {
  const key = (/** @type {Action} */ a) => `${a.path}\u0000${a.component}\u0000${a.kind}`;
  return Object.freeze([...actions].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)));
}
