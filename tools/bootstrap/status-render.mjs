// status-render.mjs — the status report as lines. PURE: it turns the facts and the verdict into the
// six-line answer a human reads, and it decides nothing.
//
// Split from `status.mjs` for the 200-line rule and because the questions differ: that file answers
// "what IS this installation", this one answers "how is that said". Every path printed here is
// target-relative by construction and passes through `sanitize`, so neither an absolute path nor a
// forged line can reach a terminal.
import { capList, plural, sanitize } from './display.mjs';
import { CI_WORKFLOW_FILE } from './plan-constants.mjs';
import { RESIDUE_CLASS, evolvedOf, extrasOf, filesOf } from './status-ownership.mjs';
import { PATH_CAP } from './status.mjs';

/** @typedef {import('./status.mjs').StatusFacts} StatusFacts */
/** @typedef {import('./status.mjs').FileFact} FileFact */

/** @param {ReadonlyArray<string>} paths @param {string} label @param {number} cap
 * @returns {string[]} */
function pathLines(paths, label, cap) {
  if (paths.length === 0) return [];
  const { shown, hidden } = capList([...paths].sort(), cap);
  return [`${label}:`, ...shown.map((rel) => `  - ${sanitize(rel)}`),
    ...(hidden === 0 ? [] : [`  … and ${hidden} more`])];
}

/** The IMMUTABLE recorded paths in one state. The evolving ones are listed separately, under their
 * own heading, because "missing" and "modified" are complaints and those are not.
 * @param {StatusFacts} facts @param {import('./status.mjs').FileState} state @returns {string[]} */
function immutablePaths(facts, state) {
  return filesOf(facts, 'immutable').filter((f) => f.state === state).map((f) => f.entry.path);
}

/** The state of the additive CI workflow, as a file rather than as an install-time sentence: the
 * manifest's detail says what was done, and this says whether it is still there.
 * @param {StatusFacts} facts @returns {string} */
function ciFileState(facts) {
  const fact = facts.files.find((item) => item.entry.path === CI_WORKFLOW_FILE);
  if (fact === undefined) return `${CI_WORKFLOW_FILE} is not in the install record`;
  return `${CI_WORKFLOW_FILE} is ${fact.state}`;
}

/**
 * PURE. The report a human reads. Paths are sanitized and capped; no absolute path can appear,
 * because every path here is target-relative by construction. `--verbose` lifts the cap: the
 * evolved list is the audit trail of the project's own record, and a capped audit trail is not one.
 * @param {StatusFacts} facts
 * @param {import('./status.mjs').Verdict} verdict @param {string} name
 * @param {{ verbose?: boolean | undefined }} [options] @returns {string[]}
 */
export function statusLines(facts, verdict, name, options = {}) {
  const { counts } = verdict;
  const cap = options.verbose === true ? -1 : PATH_CAP;
  const installed = facts.source;
  const hooks = facts.integrations.find((entry) => entry.kind === 'hooks');
  const hooksNow = hooks?.status !== 'applied'
    ? `not applied at install (${sanitize(hooks?.status ?? 'unknown', 20)})`
    : facts.hooksPath === facts.hooksDir
      ? `applied, core.hooksPath is still ${facts.hooksDir}`
      : `applied at install, but core.hooksPath is now ${facts.hooksPath === null ? 'unset' : sanitize(facts.hooksPath, 60)} — left alone`;
  return [
    `Target: ${sanitize(name)}`,
    `Installed: ${sanitize(installed?.name ?? 'unknown')} ${sanitize(installed?.version ?? 'unknown')}`
      + ` @ ${installed?.revision === null || installed?.revision === undefined ? 'revision UNKNOWN' : installed.revision.slice(0, 7)}`
      + ` · profile ${sanitize(facts.profile)}`,
    `Components: ${facts.components.length === 0 ? 'none recorded' : facts.components.map((id) => sanitize(id, 40)).join(', ')}`,
    `Files: ${counts.healthy} healthy · ${counts.missing} missing · ${counts.modified} modified · ${counts.extra} extra (unowned, never touched)`
      + ` · ${counts.evolved} evolved (expected, never drift)`,
    `Blocks: ${counts.intact} intact · ${counts.blocksModified} modified · ${counts.blocksMissing} missing`
      + `${counts.blocksUnknown === 0 ? '' : ` · ${counts.blocksUnknown} UNKNOWN (no digest was recorded)`}`,
    `Integrations: hooks — ${hooksNow}`,
    ...facts.integrations.filter((entry) => entry.kind === 'ci')
      .map((entry) => `              ci — ${ciFileState(facts)}; at install: ${sanitize(entry.detail, 120)}`),
    ...pathLines(immutablePaths(facts, 'missing'), 'Missing', cap),
    ...pathLines(immutablePaths(facts, 'modified'), 'Modified', cap),
    ...pathLines(facts.files.filter((f) => f.block === 'modified' || f.block === 'missing')
      .map((f) => `${f.entry.path} (block ${f.block})`), 'Blocks', cap),
    ...pathLines(extrasOf(facts, 'immutable'),
      `Extra, unowned (${plural(extrasOf(facts, 'immutable').length, 'file')}, never touched)`, cap),
    // Listed for audit and for nothing else: this is the project's own record doing what it is for.
    ...pathLines(evolvedOf(facts),
      'Evolved (expected — your own record; never drift, never repaired)', cap),
    ...(verdict.classification !== RESIDUE_CLASS ? [] : pathLines(facts.residue?.kept ?? [],
      'Kept by that uninstall (leave them, or delete them by hand — both are safe)', cap)),
    `State: ${verdict.classification}`,
    `Next: ${verdict.action} — ${verdict.why}`,
  ];
}
