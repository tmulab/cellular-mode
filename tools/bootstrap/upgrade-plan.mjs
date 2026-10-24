// upgrade-plan.mjs — what an upgrade WOULD do, decided from facts and nothing else. PURE: no
// filesystem, no clock, no process. `upgrade.mjs` gathers the facts and performs the plan; this
// file decides it, which is what lets the decision be tested from a fixture.
//
// THE OWNERSHIP CLASS DECIDES, NOT THE DIFF (contract H3, `status-ownership.mjs`). An upgrade is
// the one verb that may REPLACE a file Bootstrap wrote, so the question "whose change is it?" is
// asked before any byte is compared:
//   IMMUTABLE and still byte-identical to the record — Bootstrap's to replace when the source has
//     moved on, to re-add when it is gone (a partial install), and to leave alone otherwise.
//   IMMUTABLE and MODIFIED by the adopter — the whole upgrade is REFUSED, by returning it as a
//     finding. Not skipped, not overwritten, not "merged": somebody edited an installed file, and
//     a tool that proceeded would either destroy that work or leave an install it cannot describe.
//   EVOLVING (`vault/state/**`, `vault/verification.json`) — never touched. The one exception is
//     ADDITIVE: a skeleton file the current source defines and the target does NOT have (a new
//     `operations/README.md`, say) is created, because an absent file holds no history. `log.md` is
//     excluded even from that: it is the source of truth, and this verb never goes near it.
//   USER / REFERENCED, a managed block, or a GENERATED artefact — never touched. A generated file
//     is rendered from the target's own facts, and re-rendering one is not an upgrade this verb
//     claims to perform; it is reported so that nobody believes it happened.
// A path the current catalog copies and the record does not name is an ADDITION — that is how a
// component that grew a file (a new skill, say) reaches a target at all. Unless it is already
// there unrecorded, in which case it is somebody else's file and stays theirs.
import { ownershipClassOf } from './status-ownership.mjs';
import { STATE_REL } from '../cellmode/paths.mjs';

/** @typedef {import('./status.mjs').FileFact} FileFact */
/** @typedef {{ path: string, source: string | null, recorded: string | null,
 *   next: string }} Change */
/** @typedef {{ path: string, reason: string }} Untouched */
/** @typedef {{ path: string, why: string }} Finding */
/** @typedef {{ replace: ReadonlyArray<Change>, add: ReadonlyArray<Change>,
 *   skeleton: ReadonlyArray<Change>, untouched: ReadonlyArray<Untouched>,
 *   findings: ReadonlyArray<Finding>, current: number }} UpgradePlan */

/** The skeleton files this verb will NEVER create, however absent they are. The log is the
 * project's source of truth; a tool that can write one is a tool that can forge one. */
export const NEVER_CREATED = Object.freeze(['log.md']);

/** Why each class of recorded file is left alone, in the words the plan prints. */
export const REASONS = Object.freeze({
  evolving: "evolving: the project's own record, never replaced by an upgrade",
  generated: "generated from this project's own facts, so an upgrade does not re-render it",
  block: 'a managed block inside a file somebody else owns',
  referenced: 'referenced, never written by Bootstrap',
  dropped: 'the current catalog no longer copies it, and an upgrade never deletes',
  unowned: 'already there and NOT recorded: Bootstrap never replaces a file it does not own',
  unknownSource: 'the current source does not hold the file it was copied from',
});

/** Why a modified immutable file refuses the whole upgrade. @param {string} path
 * @returns {string} */
const modifiedWhy = (path) => `${path} was changed after it was installed: an upgrade would`
  + ' overwrite that change, so the WHOLE upgrade is refused. Keep the edit and restore the file'
  + ' from your own history, or copy it aside and run `uninstall --force-modified` for it first.';

/**
 * @typedef {{ files: ReadonlyArray<FileFact>,
 *   targets: Readonly<Record<string, string>>,
 *   sourceDigest: (sourceRel: string) => string | null,
 *   present: (targetRel: string) => boolean,
 *   skeleton: Readonly<Record<string, string>> }} UpgradeInput
 */

/**
 * PURE. The plan. `targets` maps a target-relative path to the source-relative path the current
 * catalog would copy into it; `sourceDigest` is the digest of those source bytes today, or `null`
 * when this checkout does not hold them; `present` answers whether a path exists in the target;
 * `skeleton` is the current empty-state definition, keyed relative to `vault/state/`.
 * @param {UpgradeInput} input @returns {UpgradePlan}
 */
export function planUpgrade(input) {
  /** @type {Change[]} */
  const replace = [];
  /** @type {Change[]} */
  const add = [];
  /** @type {Untouched[]} */
  const untouched = [];
  /** @type {Finding[]} */
  const findings = [];
  let current = 0;
  const skeleton = skeletonAdds(input);
  const skeletonPaths = new Set(skeleton.map((change) => change.path));
  for (const fact of input.files) {
    const { entry } = fact;
    const reason = staticReason(fact);
    if (reason !== null) {
      if (!skeletonPaths.has(entry.path)) untouched.push({ path: entry.path, reason });
      continue;
    }
    const sourceRel = input.targets[entry.path];
    if (sourceRel === undefined) {
      untouched.push({ path: entry.path, reason: REASONS.dropped });
      continue;
    }
    const next = input.sourceDigest(sourceRel);
    if (next === null) {
      untouched.push({ path: entry.path, reason: REASONS.unknownSource });
      continue;
    }
    const change = { path: entry.path, source: sourceRel, recorded: entry.sha256After, next };
    if (fact.state === 'missing') add.push(change);
    else if (fact.state === 'modified') findings.push({ path: entry.path, why: modifiedWhy(entry.path) });
    else if (next !== entry.sha256After) replace.push(change);
    else current += 1;
  }
  const recorded = new Set(input.files.map((fact) => fact.entry.path));
  for (const [target, sourceRel] of Object.entries(input.targets).sort()) {
    if (recorded.has(target)) continue;
    if (input.present(target)) {
      untouched.push({ path: target, reason: REASONS.unowned });
      continue;
    }
    const next = input.sourceDigest(sourceRel);
    if (next !== null) add.push({ path: target, source: sourceRel, recorded: null, next });
  }
  return Object.freeze({
    replace: sorted(replace), add: sorted(add), skeleton: sorted(skeleton),
    untouched: Object.freeze([...untouched].sort((a, b) => (a.path < b.path ? -1 : 1))),
    findings: Object.freeze(findings), current,
  });
}

/** PURE. The reason one recorded file is left alone whatever its bytes say, or `null` when it is
 * an immutable copy this verb may act on. @param {FileFact} fact @returns {string | null} */
export function staticReason(fact) {
  const { entry } = fact;
  if (ownershipClassOf(entry.path) === 'evolving') return REASONS.evolving;
  if (entry.block !== null) return REASONS.block;
  if (!entry.created || entry.mode === 'reference') return REASONS.referenced;
  if (entry.mode !== 'copy') return REASONS.generated;
  return null;
}

/** PURE. The skeleton files the target does not have, as additive changes. Keyed names are
 * relative to `vault/state/`; `log.md` is never among them. @param {UpgradeInput} input
 * @returns {Change[]} */
function skeletonAdds(input) {
  /** @type {Change[]} */
  const out = [];
  for (const name of Object.keys(input.skeleton).sort()) {
    if (NEVER_CREATED.includes(name)) continue;
    const path = `${STATE_REL}/${name}`;
    if (!input.present(path)) out.push({ path, source: null, recorded: null, next: '' });
  }
  return out;
}

/** PURE. @param {ReadonlyArray<Change>} list @returns {ReadonlyArray<Change>} */
const sorted = (list) => Object.freeze([...list].sort((a, b) => (a.path < b.path ? -1 : 1)));

/** PURE and TOTAL. How many paths this plan would write. @param {UpgradePlan} plan
 * @returns {number} */
export function changeCount(plan) {
  return plan.replace.length + plan.add.length + plan.skeleton.length;
}
