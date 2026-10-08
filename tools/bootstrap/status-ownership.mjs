// status-ownership.mjs — contract H3: WHOSE CHANGE IS IT. PURE: no filesystem, no clock, no
// process. `status.mjs` decides what an installation IS; this file answers the question that comes
// first, because a verdict about a file nobody owns is a verdict about nothing.
//
// THREE CLASSES, AND ONE OF THEM IS SUPPOSED TO CHANGE. An installation is not a frozen tree. Most
// of what Bootstrap copies or generates is IMMUTABLE: a skill file, a gate, a hook — changing one
// is drift, losing one is a partial install, and that is right. But two of the paths it writes are
// the project's own living record: `vault/state/**`, which `cellmode open|pause|complete` rewrites
// by design and grows a cell file per cell, and `vault/verification.json`, the contract whose
// checks a human is REQUIRED to edit and approve before Article 8 can go green. Those are
// EVOLVING. Using the method exactly as documented changes both on the first day, so a tool that
// called that "drift" would tell every adopter their install is damaged — and then offer a
// "repair" that would overwrite the project's memory with a skeleton. Evolving paths are reported
// as EVOLVED, listed for audit, and never counted into a verdict. A file nobody installed
// (`created: false`) is user/referenced and was never drift.
//
// THE RULE IS A FROZEN PATH LIST, NOT A MANIFEST FIELD. The class of a path is DERIVED, so the
// record's schema does not move and an installation written before H3 existed is classified by it
// too. Adding a path here is a reviewable decision, never a convenience.
//
// AND AN UNINSTALL IS NOT DAMAGE. When an uninstall legitimately keeps something it keeps the
// manifest as well — never rewriting the record — and that kept manifest used to make `status` say
// `partial`/`repair` forever. `residueVerdict` reads the uninstall's OWN report instead.
import { INSTALL_MANIFEST, VERIFICATION_FILE } from './plan-constants.mjs';
import { STATE_REL } from '../cellmode/paths.mjs';

/** @typedef {import('./status.mjs').StatusFacts} StatusFacts */
/** @typedef {import('./status.mjs').FileFact} FileFact */
/** @typedef {import('./status.mjs').Counts} Counts */
/** @typedef {import('./status.mjs').Verdict} Verdict */
/** @typedef {'evolving'|'immutable'} OwnerClass */

/** The directories whose whole contents are the project's own record, not the install's. */
export const EVOLVING_DIRS = Object.freeze([`${STATE_REL}/`]);

/** The single files a human is expected to edit: the verification contract is approved by hand. */
export const EVOLVING_FILES = Object.freeze([VERIFICATION_FILE]);

/** The classification a target gets when an uninstall already finished here and kept something. */
export const RESIDUE_CLASS = 'uninstalled-with-residue';

/** PURE and TOTAL. The ownership class of one target-relative path. Everything that is not
 * declared evolving is immutable: the fail-closed direction, since an unknown path being judged is
 * recoverable and an unknown path being ignored is not. @param {string} rel @returns {OwnerClass} */
export function ownershipClassOf(rel) {
  const path = String(rel);
  if (EVOLVING_FILES.includes(path)) return 'evolving';
  return EVOLVING_DIRS.some((dir) => path.startsWith(dir)) ? 'evolving' : 'immutable';
}

/** PURE. The recorded files of one class.
 * @param {StatusFacts} facts @param {OwnerClass} owner @returns {ReadonlyArray<FileFact>} */
export function filesOf(facts, owner) {
  return facts.files.filter((fact) => ownershipClassOf(fact.entry.path) === owner);
}

/** PURE. The unowned files of one class. A new cell file under `vault/state/cells/` is an EVOLVING
 * extra — expected growth, not somebody's stray note.
 * @param {StatusFacts} facts @param {OwnerClass} owner @returns {ReadonlyArray<string>} */
export function extrasOf(facts, owner) {
  return facts.extras.filter((rel) => ownershipClassOf(rel) === owner);
}

/** PURE. Every evolving path that differs from the record, and HOW — for audit only. This list
 * never moves a verdict and never produces a next action.
 * @param {StatusFacts} facts @returns {ReadonlyArray<string>} */
export function evolvedOf(facts) {
  const changed = filesOf(facts, 'evolving')
    .filter((fact) => fact.state === 'modified' || fact.state === 'missing')
    .map((fact) => `${fact.entry.path} (${fact.state === 'missing' ? 'deleted' : 'changed'})`);
  const added = extrasOf(facts, 'evolving').map((rel) => `${rel} (added)`);
  return Object.freeze([...changed, ...added].sort());
}

/**
 * PURE. The verdict for a target an uninstall already left — or `null` when this is not one, in
 * which case the ordinary classification runs. TWO CONDITIONS, BOTH NECESSARY: the uninstall's own
 * report was written no earlier than this install was recorded, and every file the install CREATED
 * that is still on disk is one that report says it KEPT. A refused step, a file that came back, or
 * a report left over from an earlier install therefore falls through and is still reported as
 * drift or partial — the fail-closed direction.
 * @param {StatusFacts} facts @param {Counts} counts @returns {Verdict | null}
 */
export function residueVerdict(facts, counts) {
  const residue = facts.residue;
  if (residue === null || residue === undefined || residue.at < facts.installedAt) return null;
  const kept = new Set(residue.kept);
  const present = facts.files.filter((fact) => fact.entry.created && fact.state !== 'missing'
    && fact.entry.path !== INSTALL_MANIFEST);
  if (present.some((fact) => !kept.has(fact.entry.path))) return null;
  return {
    classification: RESIDUE_CLASS,
    action: 'none',
    why: `an uninstall finished here and kept what it would not delete (${residue.report}):`
      + ' this target is a completed removal, NOT a damaged install, so there is nothing to repair.'
      + ` Either leave the kept paths where they are, or delete them and ${INSTALL_MANIFEST} by`
      + ' hand — both are safe, and neither needs this tool.',
    counts,
    code: 0,
  };
}
