// status-render.mjs — the status report as lines. PURE: it turns the facts and the verdict into the
// six-line answer a human reads, and it decides nothing.
//
// Split from `status.mjs` for the 200-line rule and because the questions differ: that file answers
// "what IS this installation", this one answers "how is that said". Every path printed here is
// target-relative by construction and passes through `sanitize`, so neither an absolute path nor a
// forged line can reach a terminal.
import { capList, plural, sanitize } from './display.mjs';
import { CI_WORKFLOW_FILE } from './plan-constants.mjs';
import { PATH_CAP } from './status.mjs';

/** @typedef {import('./status.mjs').StatusFacts} StatusFacts */
/** @typedef {import('./status.mjs').FileFact} FileFact */

/** @param {ReadonlyArray<string>} paths @param {string} label @returns {string[]} */
function pathLines(paths, label) {
  if (paths.length === 0) return [];
  const { shown, hidden } = capList([...paths].sort(), PATH_CAP);
  return [`${label}:`, ...shown.map((rel) => `  - ${sanitize(rel)}`),
    ...(hidden === 0 ? [] : [`  … and ${hidden} more`])];
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
 * because every path here is target-relative by construction.
 * @param {StatusFacts} facts
 * @param {import('./status.mjs').Verdict} verdict @param {string} name @returns {string[]}
 */
export function statusLines(facts, verdict, name) {
  const { counts } = verdict;
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
    `Files: ${counts.healthy} healthy · ${counts.missing} missing · ${counts.modified} modified · ${counts.extra} extra (unowned, never touched)`,
    `Blocks: ${counts.intact} intact · ${counts.blocksModified} modified · ${counts.blocksMissing} missing`
      + `${counts.blocksUnknown === 0 ? '' : ` · ${counts.blocksUnknown} UNKNOWN (no digest was recorded)`}`,
    `Integrations: hooks — ${hooksNow}`,
    ...facts.integrations.filter((entry) => entry.kind === 'ci')
      .map((entry) => `              ci — ${ciFileState(facts)}; at install: ${sanitize(entry.detail, 120)}`),
    ...pathLines(facts.files.filter((f) => f.state === 'missing').map((f) => f.entry.path), 'Missing'),
    ...pathLines(facts.files.filter((f) => f.state === 'modified').map((f) => f.entry.path), 'Modified'),
    ...pathLines(facts.files.filter((f) => f.block === 'modified' || f.block === 'missing')
      .map((f) => `${f.entry.path} (block ${f.block})`), 'Blocks'),
    ...pathLines(facts.extras, `Extra, unowned (${plural(facts.extras.length, 'file')}, never touched)`),
    `State: ${verdict.classification}`,
    `Next: ${verdict.action} — ${verdict.why}`,
  ];
}
