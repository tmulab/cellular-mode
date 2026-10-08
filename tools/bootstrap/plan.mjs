// plan.mjs — the installation plan: one document that says everything that would happen, before
// anything happens.
//
// PURE and TOTAL-ish: it validates its inputs, refuses with a BootstrapError, and otherwise
// returns a frozen document. It takes `expanded` — the concrete copied file list per component —
// as a PARAMETER rather than walking the source tree itself, which is what keeps planning free of
// I/O and lets a test build a plan from a fixture in microseconds.
//
// The integrations are where this cell's judgement lives, and one choice deserves stating plainly.
// When the target already has hook machinery (Husky, Lefthook, pre-commit, native hooks, an
// existing core.hooksPath, or something unrecognised), Bootstrap STILL COPIES the `.githooks/`
// scripts and does NOT activate them. The scripts are inert data until something points a hook
// path at them; copying them lets the human compose them into their own machinery by hand, while
// activation, the one step that changes how the target's git behaves, stays out of the approvals.
import { blockApprovalFor } from './approvals.mjs';
import { CODES, refuse } from './errors.mjs';
import { assertFacts, existingSet } from './target-facts.mjs';
import { ADAPTER_FOR } from './resolve.mjs';
import { componentActions, conflictsOf, sortActions, warningsOf } from './plan-actions.mjs';
import {
  CORE_COMPONENT, GITIGNORE, HOOKS_COMPONENT, HOOKS_DIR, INSTALL_MANIFEST, PLANNER, PLAN_SCHEMA,
  PLAN_VERSION, SCRATCH_DIR, UNTOUCHED_CAP, VERIFICATION_COMPONENT,
} from './plan-constants.mjs';

/** @typedef {import('./plan-actions.mjs').Action} Action */
/** @typedef {import('./plan-actions.mjs').Expanded} Expanded */
/** @typedef {import('./resolve.mjs').Selection} Selection */
/** @typedef {import('./target-facts.mjs').TargetFacts} TargetFacts */
/** @typedef {{ kind: 'hooks'|'ci'|'verification'|'adapter',
 *   status: 'apply-with-confirm'|'propose-only'|'skip', detail: string }} Integration */
/** @typedef {{ id: string, action: string, why: string }} Approval */
/** @typedef {{ id: string, argv: ReadonlyArray<string> }} Check */
/** @typedef {{ schema: string, version: number, profile: string,
 *   components: Selection['components'], added: Selection['added'], skipped: Selection['skipped'],
 *   actions: ReadonlyArray<Action>, conflicts: ReadonlyArray<{ path: string, reason: string }>,
 *   integrations: ReadonlyArray<Integration>, approvals: ReadonlyArray<Approval>,
 *   commandsProposed: ReadonlyArray<{ argv: ReadonlyArray<string>, status: 'PROPOSED' }>,
 *   verification: ReadonlyArray<Check>, warnings: ReadonlyArray<string>,
 *   untouched: ReadonlyArray<string>, untouchedCount: number }} Plan */

/** The three artefacts the planner itself contributes, independent of any component: the install
 * record, the git-ignored scratch directory, and the ignore rule that keeps it out of history. */
const PLANNER_FILES = Object.freeze([
  Object.freeze({ path: INSTALL_MANIFEST, template: 'install-manifest' }),
  Object.freeze({ path: SCRATCH_DIR, template: 'bootstrap-scratch' }),
  Object.freeze({ path: GITIGNORE, template: 'gitignore-block' }),
]);

/**
 * PURE. The integrations a selection implies, in a fixed order: hooks, CI, verification, adapters.
 * @param {ReadonlySet<string>} chosen @param {TargetFacts} facts @returns {ReadonlyArray<Integration>}
 */
export function integrationsOf(chosen, facts) {
  /** @type {Integration[]} */
  const out = [];
  if (!chosen.has(HOOKS_COMPONENT)) {
    out.push({ kind: 'hooks', status: 'skip', detail: `${HOOKS_COMPONENT} is not selected, so no hook is planned` });
  } else if (facts.hookMachinery === 'none') {
    out.push({ kind: 'hooks', status: 'apply-with-confirm',
      detail: `no hook machinery found: core.hooksPath may be set to ${HOOKS_DIR}` });
  } else {
    out.push({ kind: 'hooks', status: 'propose-only',
      detail: `${facts.hookMachinery} hook machinery is already present: the ${HOOKS_DIR} scripts are copied but not activated` });
  }
  out.push({ kind: 'ci', status: 'propose-only',
    detail: facts.ci.length > 0
      ? `detected ${facts.ci.join(', ')}: an additive workflow may be proposed, never an edit`
      : 'no CI detected: an additive workflow may be proposed' });
  out.push(chosen.has(VERIFICATION_COMPONENT)
    ? { kind: 'verification', status: 'propose-only',
      detail: 'the verification contract is generated with discovered commands labelled INFERRED; a mandatory check needs a VERIFIED basis or a human approval' }
    : { kind: 'verification', status: 'skip', detail: `${VERIFICATION_COMPONENT} is not selected` });
  for (const tool of /** @type {ReadonlyArray<'claude'|'cursor'>} */ (['claude', 'cursor'])) {
    const id = ADAPTER_FOR[tool];
    if (chosen.has(id)) {
      out.push({ kind: 'adapter', status: 'apply-with-confirm', detail: `${id}: pointers for an existing ${tool} setup` });
    }
  }
  return Object.freeze(out.map((entry) => Object.freeze(entry)));
}

/** PURE. Every consequential step, in the order a human should be asked about it. Nothing here
 * happens without the human saying so; the list IS the question.
 * @param {ReadonlyArray<Action>} actions @param {ReadonlyArray<Integration>} integrations
 * @param {ReadonlySet<string>} chosen @returns {ReadonlyArray<Approval>} */
export function approvalsOf(actions, integrations, chosen) {
  /** @type {Approval[]} */
  const out = [];
  for (const entry of actions.filter((a) => a.kind === 'modify-block')) {
    out.push({ id: blockApprovalFor(entry.path), action: `append a managed block to ${entry.path}`,
      why: 'Bootstrap never replaces an existing file; the block is shown before it is written' });
  }
  if (integrations.some((i) => i.kind === 'hooks' && i.status === 'apply-with-confirm')) {
    out.push({ id: 'hooks', action: `set core.hooksPath to ${HOOKS_DIR}`,
      why: 'it changes how the target repository runs git hooks' });
  }
  if (chosen.has(CORE_COMPONENT)) {
    out.push({ id: 'first-cell', action: 'create the first cell',
      why: 'a cell is recorded state: it is created planned and never activated' });
  }
  if (integrations.some((i) => i.kind === 'ci')) {
    out.push({ id: 'ci-workflow', action: 'write the proposed CI workflow file',
      why: 'a workflow runs code: it is additive, least-privilege and written only on request' });
  }
  return Object.freeze(out.map((entry) => Object.freeze(entry)));
}

/** PURE. The checks the selected components declare, by id, one entry per id.
 * @param {ReadonlyArray<{ id: string }>} components
 * @param {Readonly<Record<string, Record<string, unknown>>>} byId @returns {ReadonlyArray<Check>} */
export function verificationOf(components, byId) {
  /** @type {Map<string, ReadonlyArray<string>>} */
  const checks = new Map();
  for (const { id } of components) {
    const declared = byId[id]?.verify;
    if (!Array.isArray(declared)) continue;
    for (const entry of declared) {
      const record = /** @type {Record<string, unknown>} */ (entry);
      const checkId = String(record.id);
      if (!checks.has(checkId) && Array.isArray(record.argv)) {
        checks.set(checkId, Object.freeze(record.argv.map((part) => String(part))));
      }
    }
  }
  return Object.freeze([...checks.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([id, argv]) => Object.freeze({ id, argv })));
}

/** PURE. The existing files this plan does not touch — capped for display, counted in full.
 * @param {TargetFacts} facts @param {ReadonlyArray<Action>} actions
 * @returns {{ untouched: ReadonlyArray<string>, untouchedCount: number }} */
export function untouchedOf(facts, actions) {
  const paths = actions.map((entry) => entry.path);
  const exact = new Set(paths);
  const directories = paths.filter((path) => path.endsWith('/'));
  const rest = [...facts.existingFiles]
    .filter((path) => !exact.has(path) && !directories.some((dir) => path.startsWith(dir)))
    .sort();
  return { untouched: Object.freeze(rest.slice(0, UNTOUCHED_CAP)), untouchedCount: rest.length };
}

/**
 * PURE. Build the installation plan. `expanded` maps a component id to the concrete copied files
 * for it (from `expandFiles`), supplied by the caller so that this module stays free of I/O.
 * @param {{ catalog: { ok: boolean, byId?: Readonly<Record<string, Record<string, unknown>>> },
 *   selection: Selection, facts: unknown,
 *   expanded?: Readonly<Record<string, ReadonlyArray<Expanded>>> }} input
 * @returns {Plan}
 */
export function buildPlan(input) {
  const { catalog, selection, expanded = {} } = input;
  if (!catalog.ok || catalog.byId === undefined) {
    throw refuse(CODES.BAD_MANIFEST, 'the component catalog did not load, so nothing can be planned', {});
  }
  const facts = assertFacts(input.facts);
  if (facts.hasInstallManifest) {
    throw refuse(CODES.EXISTING_INSTALL,
      `${INSTALL_MANIFEST} already exists: ask status whether this is a repair or an upgrade`,
      { path: INSTALL_MANIFEST });
  }
  const byId = catalog.byId;
  const existing = existingSet(facts);
  /** @type {Action[]} */
  const actions = [];
  for (const { id } of selection.components) {
    const component = byId[id];
    if (component === undefined) {
      throw refuse(CODES.BAD_MANIFEST, `the selection names "${id}", which the catalog does not hold`, { id });
    }
    actions.push(...componentActions(component, expanded[id] ?? [], existing));
  }
  for (const file of PLANNER_FILES) {
    actions.push(...componentActions(
      { id: PLANNER, files: [{ target: file.path, mode: 'generate', template: file.template }] },
      [], existing,
    ));
  }
  const ordered = sortActions(actions);
  const chosen = new Set(selection.components.map((entry) => entry.id));
  const integrations = integrationsOf(chosen, facts);
  return Object.freeze({
    schema: PLAN_SCHEMA,
    version: PLAN_VERSION,
    profile: selection.profile,
    components: selection.components,
    added: selection.added,
    skipped: selection.skipped,
    actions: ordered,
    conflicts: conflictsOf(ordered, existing),
    integrations,
    approvals: approvalsOf(ordered, integrations, chosen),
    commandsProposed: Object.freeze(integrations.some((i) => i.kind === 'hooks' && i.status === 'apply-with-confirm')
      ? [Object.freeze({ argv: Object.freeze(['git', 'config', 'core.hooksPath', HOOKS_DIR]), status: /** @type {'PROPOSED'} */ ('PROPOSED') })]
      : []),
    verification: verificationOf(selection.components, byId),
    warnings: warningsOf(facts, ordered),
    ...untouchedOf(facts, ordered),
  });
}
