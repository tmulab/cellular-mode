// uninstall-plan.mjs — what an uninstall WOULD do, decided before anything is touched. PURE: no
// filesystem, no process. It reads the same facts `status` reads and returns one step per recorded
// file, plus the three decisions that are not about files: the hooks, the directories, the manifest.
//
// THE DEFAULT IS TO KEEP. A file is removed only when Bootstrap created it AND its hash still equals
// what the manifest recorded; a managed block only when it is byte-intact. Everything else is KEPT
// and reported — a modified file, an edited block, a referenced file, a hook configuration somebody
// changed. "Keep" is never silent: every kept path carries the reason it was kept.
//
// VAULT STATE IS SOMEBODY'S MEMORY. `vault/state/` is the method's own append-only record: a cell
// file written after the install, or a changed `log.md`, is work that exists nowhere else. The rule
// is deliberately coarse and deliberately safe: if ANY file under `vault/state/` was added or
// changed, the WHOLE directory is kept, skeleton included. A half-removed history is worse than a
// leftover directory, and the leftover is reported.
//
// THE MANIFEST GOES LAST, and only if nothing it owns was kept. Keeping it is the append-never-
// rewrite rule applied to an uninstall: the record of what was installed is not edited into a record
// of what is left — it stays as written, and what remains is described in a separate report.
import { STATE_REL } from '../cellmode/paths.mjs';
import { HOOKS_DIR, INSTALL_MANIFEST, SCRATCH_DIR } from './plan-constants.mjs';
import { createdDirsOf } from './status.mjs';

/** @typedef {import('./status.mjs').FileFact} FileFact */
/** @typedef {import('./status.mjs').StatusFacts} StatusFacts */
/** One recorded path and what the uninstall will do about it. `sha256` is the digest the deletion
 * must still find (for a block, the digest the FILE must come back to); `blockSha256` is the digest
 * of the block as installed. Both are `null` when the step deletes nothing.
 * @typedef {{ path: string, action: string, reason: string, sha256: string | null,
 *   blockSha256: string | null, component: string | null }} Step */
/** @typedef {{ steps: ReadonlyArray<Step>, kept: ReadonlyArray<Step>,
 *   manifest: { action: string, reason: string }, hooks: { action: string, reason: string },
 *   dirs: ReadonlyArray<string>, forced: ReadonlyArray<string> }} UninstallPlan */

/** The actions a step may carry. Closed, so a renderer and an executor cannot disagree. */
export const ACTIONS = Object.freeze(['remove', 'remove-modified', 'remove-block',
  'keep-modified', 'keep', 'already-gone']);

/** The prefix whose contents are the human's own recorded history. */
export const STATE_PREFIX = `${STATE_REL}/`;

/** PURE. True when `vault/state/` holds work done after the install: a file the manifest does not
 * own (a cell opened in the target), or a recorded file that changed (`log.md`, `INDEX.md`).
 * @param {StatusFacts} facts @returns {boolean} */
export function stateHasHistory(facts) {
  if (facts.extras.some((rel) => rel.startsWith(STATE_PREFIX))) return true;
  return facts.files.some((fact) => fact.entry.path.startsWith(STATE_PREFIX) && fact.state === 'modified');
}

/** PURE. The step for one recorded file.
 * @param {FileFact} fact @param {{ forced: ReadonlySet<string>, keepState: boolean }} options
 * @returns {Step} */
export function stepFor(fact, options) {
  const { entry } = fact;
  /** @type {{ path: string, sha256: string | null, blockSha256: string | null, component: string | null }} */
  const base = { path: entry.path, sha256: null, blockSha256: null, component: null };
  if (options.keepState && entry.path.startsWith(STATE_PREFIX)) {
    return { ...base, action: 'keep', reason: 'vault/state/ holds work recorded after the install: the whole directory is kept' };
  }
  if (entry.block !== null) {
    if (fact.state === 'missing') return { ...base, action: 'already-gone', reason: 'the file that held the managed block is gone' };
    if (fact.block === 'intact') {
      return { ...base, action: 'remove-block', component: entry.block.component,
        sha256: entry.sha256Before, blockSha256: entry.block.sha256,
        reason: `the managed block for ${entry.block.component} is byte-intact, so it is removed and the file restored` };
    }
    return { ...base, action: 'keep', component: entry.block.component,
      reason: fact.block === 'unknown'
        ? 'no digest was recorded for this block, so whether it is intact is UNKNOWN: it is kept for review'
        : `the managed block is ${fact.block} — somebody edited it, so removing it is a human's decision` };
  }
  if (!entry.created) {
    return { ...base, action: 'keep', reason: `${entry.mode}: this file already existed, Bootstrap never created it` };
  }
  if (fact.state === 'missing') return { ...base, action: 'already-gone', reason: 'already removed' };
  if (fact.state === 'modified') {
    return options.forced.has(entry.path)
      ? { ...base, action: 'remove-modified', sha256: fact.sha256,
        reason: 'MODIFIED and named in --force-modified with --confirm: removed on explicit human instruction' }
      : { ...base, action: 'keep-modified', reason: 'modified since the install: kept. To delete it: --force-modified <path> --confirm' };
  }
  return { ...base, action: 'remove', sha256: entry.sha256After, reason: 'created by the install and unchanged' };
}

/** PURE. What to do about `core.hooksPath`: unset it only when it still holds the exact value this
 * install set. Anything else belongs to somebody's setup. @param {StatusFacts} facts
 * @returns {{ action: string, reason: string }} */
export function hooksStep(facts) {
  const hooks = facts.integrations.find((entry) => entry.kind === 'hooks');
  if (hooks?.status !== 'applied') {
    return { action: 'none', reason: `the install did not set core.hooksPath (${hooks?.status ?? 'not recorded'}), so there is nothing to unset` };
  }
  if (facts.hooksPath === HOOKS_DIR) {
    return { action: 'unset', reason: `core.hooksPath is still ${HOOKS_DIR}: \`git config --unset core.hooksPath\` in the target` };
  }
  return { action: 'keep',
    reason: `core.hooksPath is now ${facts.hooksPath === null ? 'unset' : facts.hooksPath} and not the ${HOOKS_DIR} this install set: left alone` };
}

/**
 * PURE. The whole plan. `forceModified` only has an effect together with `confirm`: a consequential
 * deletion needs the path AND the flag, like every other consequential step in Bootstrap.
 * @param {{ facts: StatusFacts, forceModified?: ReadonlyArray<string> | undefined,
 *   confirm?: boolean | undefined }} input @returns {UninstallPlan}
 */
export function planUninstall(input) {
  const { facts } = input;
  const forced = new Set(input.confirm === true ? (input.forceModified ?? []) : []);
  const keepState = stateHasHistory(facts);
  const steps = facts.files
    .filter((fact) => fact.entry.path !== INSTALL_MANIFEST)
    .map((fact) => stepFor(fact, { forced, keepState }));
  const kept = steps.filter((step) => step.action === 'keep' || step.action === 'keep-modified');
  const hooks = hooksStep(facts);
  const manifestFact = facts.files.find((fact) => fact.entry.path === INSTALL_MANIFEST);
  const manifestModified = manifestFact !== undefined && manifestFact.state === 'modified';
  const manifest = kept.length > 0 || manifestModified
    ? { action: 'keep',
      reason: manifestModified
        ? `${INSTALL_MANIFEST} itself was modified since the install: it is kept untouched`
        : `${kept.length} path(s) were kept, so the record of what was installed is kept too — never rewritten — and what remains is listed in the uninstall report` }
    : { action: 'remove', reason: 'everything it owns was removed, so the record goes last' };
  return {
    steps: Object.freeze(steps),
    kept: Object.freeze(kept),
    manifest,
    hooks,
    dirs: candidateDirs(facts),
    forced: Object.freeze([...forced].sort()),
  };
}

/** PURE. The directories an uninstall may try to remove, deepest first — every directory the install
 * created, plus the git-ignored scratch directory it creates empty and so owns no file in. Each one
 * is still removed only if it is empty when its turn comes.
 * @param {StatusFacts} facts @returns {ReadonlyArray<string>} */
export function candidateDirs(facts) {
  const owned = createdDirsOf(facts.files.map((fact) => fact.entry));
  const scratch = SCRATCH_DIR.replace(/\/+$/, '');
  const all = owned.includes(scratch) ? [...owned] : [...owned, scratch];
  return Object.freeze(all.sort((a, b) => b.split('/').length - a.split('/').length || (a < b ? 1 : -1)));
}
