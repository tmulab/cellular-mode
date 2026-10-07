// report.mjs — the Adoption Compatibility Report, as a document rather than as printed text.
//
// PURE. A detection and a discovery in, a frozen record out. Nothing here reads a disk, starts a
// process or decides to install anything; `render-report.mjs` turns this record into lines and
// `existing-flow.mjs` decides what to do about them.
//
// SIX SECTIONS, AND THE LABEL IS THE SECTION. That is not presentation — it is Article 3. A fact
// is VERIFIED only when this tool looked at the thing itself and has a relative path to show for
// it. A convention is INFERRED, with the basis named, because a manifest is a claim about a project
// and not the project. An integration is PROPOSED, because nothing in this report has happened.
// Conflicts are the places where installing would meet something that is already there. Unknowns
// are said out loud rather than defaulted — a truncated scan, a git fact that would not come, a CI
// line that needs a shell. And approvals are the questions only the human may answer.
import { sanitize } from './display.mjs';

/** @typedef {{ text: string, evidence: string | null }} ReportLine */
/** @typedef {{ kind: string, detail: string }} ReportConflict */
/** @typedef {{ schema: string, version: number, target: string,
 *   profileSuggestion: string, detected: ReadonlyArray<ReportLine>,
 *   inferred: ReadonlyArray<ReportLine>, proposed: ReadonlyArray<ReportLine>,
 *   conflicts: ReadonlyArray<ReportConflict>, unknowns: ReadonlyArray<string>,
 *   approvals: ReadonlyArray<{ id: string, what: string }> }} AdoptionReport */

export const REPORT_SCHEMA = 'cellular-mode/adoption-report';
export const REPORT_VERSION = 1;

/** @param {string} text @param {string | null} [evidence] @returns {ReportLine} */
const line = (text, evidence = null) => Object.freeze({
  text: sanitize(text, 200), evidence: evidence === null ? null : sanitize(evidence, 160),
});

/**
 * PURE. The profile to suggest. The rule is deliberately conservative and stated in the report:
 * Adaptive and the Prompt Builder are Node programs, so offering them to a project with no
 * JavaScript installs tooling that project cannot run. Everything else gets `minimal`, and the
 * human may name any profile they like — a suggestion is not a default.
 * @param {import('./detect.mjs').Detection} detection @returns {string}
 */
export function suggestProfile(detection) {
  return detection.languages.includes('javascript') || detection.languages.includes('typescript')
    ? 'standard' : 'minimal';
}

/** @param {import('./detect.mjs').Detection} detection @returns {ReportLine[]} */
function detectedLines(detection) {
  const git = detection.git;
  /** @type {ReportLine[]} */
  const out = [line(git.isRepo ? 'this is a git work tree' : 'this is not a git work tree')];
  if (git.commit !== null) out.push(line(`HEAD commit ${git.commit}`));
  if (git.tree !== null) out.push(line(`HEAD tree ${git.tree}`));
  if (git.clean !== null) {
    out.push(line(git.clean ? 'the work tree is clean' : `the work tree has ${git.changedCount} changed entr(ies)`));
  }
  out.push(line(`${detection.facts.existingFiles.length} file(s) seen by the scan`));
  if (detection.languages.length > 0) out.push(line(`languages: ${detection.languages.join(', ')}`));
  for (const entry of detection.buildSystems) out.push(line(`build system: ${entry.id}`, entry.evidence));
  for (const entry of detection.packageManagers) out.push(line(`package manager: ${entry.id}`, entry.evidence));
  for (const entry of detection.qualityTools.filter((item) => item.label === 'VERIFIED')) {
    out.push(line(`lint/typecheck: ${entry.id}`, entry.evidence));
  }
  for (const provider of detection.ci) out.push(line(`CI: ${provider.id}`, provider.files.join(', ')));
  for (const note of detection.hooks.evidence) out.push(line(`hooks: ${note}`));
  if (detection.hasGitAttributes) out.push(line('.gitattributes is present', '.gitattributes'));
  for (const entry of detection.instructionFiles) out.push(line(`agent instructions: ${entry.id}`, entry.evidence));
  for (const entry of detection.docs) out.push(line(`docs: ${entry.id}`, entry.evidence));
  for (const entry of detection.securityTooling) out.push(line(`security tooling: ${entry.id}`, entry.evidence));
  return out;
}

/** @param {import('./detect.mjs').Detection} detection
 * @param {import('./commands.mjs').Discovery} discovery @returns {ReportLine[]} */
function inferredLines(detection, discovery) {
  /** @type {ReportLine[]} */
  const out = [];
  for (const entry of detection.testFrameworks) out.push(line(`test framework: ${entry.id}`, entry.evidence));
  for (const entry of detection.qualityTools.filter((item) => item.label === 'INFERRED')) {
    out.push(line(`lint/typecheck: ${entry.id}`, entry.evidence));
  }
  for (const entry of detection.releaseHints) out.push(line(`release process: ${entry.id}`, entry.evidence));
  if (detection.makeTargets.length > 0) {
    out.push(line(`Makefile targets: ${detection.makeTargets.slice(0, 8).join(', ')}`, 'Makefile'));
  }
  for (const entry of discovery.commands) {
    out.push(line(`${entry.label}: ${entry.argv.join(' ')}`, entry.basis));
  }
  return out;
}

/** @param {import('./detect.mjs').Detection} detection
 * @param {import('./commands.mjs').Discovery} discovery @returns {ReportLine[]} */
function proposedLines(detection, discovery) {
  /** @type {ReportLine[]} */
  const out = [line(`profile: ${suggestProfile(detection)} — a suggestion, never a default; name any profile with --profile`)];
  if (detection.facts.tools.claude) out.push(line('adapter: claude-code-adapter, because this project already has Claude configuration'));
  if (detection.facts.tools.cursor) out.push(line('adapter: cursor-adapter, because this project already has Cursor configuration'));
  out.push(line(`verification: ${discovery.commands.length} discovered check(s) written to vault/verification.json as INFERRED; mandatory needs a VERIFIED basis or an approval`));
  out.push(line(detection.hooks.machinery === 'none'
    ? 'hooks: no machinery found, so core.hooksPath may be proposed for .githooks'
    : `hooks: ${detection.hooks.machinery} is already in place, so the .githooks scripts are copied inert and composed by hand`));
  out.push(line(detection.ci.length > 0
    ? `CI: ${detection.ci.map((provider) => provider.id).join(', ')} detected — an additive workflow may be proposed, never an edit`
    : 'CI: none detected — an additive workflow may be proposed'));
  out.push(line('baseline: vault/adoption-baseline.json records this state at install time'));
  return out;
}

/** PURE. Everywhere installing would meet something that is already there. @param
 * {import('./detect.mjs').Detection} detection @returns {ReportConflict[]} */
export function conflictsOfDetection(detection) {
  const present = new Set(detection.facts.existingFiles);
  /** @type {ReportConflict[]} */
  const out = [];
  for (const path of ['AGENTS.md', 'CLAUDE.md', '.gitignore']) {
    if (present.has(path)) {
      out.push(Object.freeze({ kind: 'managed-file', detail: `${path} exists: a managed block is appended with approval, and the file is never replaced` }));
    }
  }
  if (detection.hooks.machinery !== 'none') {
    out.push(Object.freeze({ kind: 'hooks', detail: `${detection.hooks.machinery} hook machinery is already in place: Bootstrap installs no hook and writes a composition plan` }));
  }
  if (detection.facts.existingFiles.some((rel) => rel.startsWith('vault/'))) {
    out.push(Object.freeze({ kind: 'vault', detail: 'a vault/ directory already exists: its files are never replaced, and a collision stops the install' }));
  }
  if (detection.facts.hasInstallManifest) {
    out.push(Object.freeze({ kind: 'install-manifest', detail: 'vault/install-manifest.json is already there: ask status whether this is a repair or an upgrade' }));
  }
  if (detection.git.clean === false) {
    out.push(Object.freeze({ kind: 'dirty-tree', detail: `${detection.git.changedCount} uncommitted change(s): commit or stash first, so that what Bootstrap writes is reviewable on its own` }));
  }
  return out;
}

/** PURE. Everything this analysis could not establish. @param {import('./detect.mjs').Detection} detection
 * @param {import('./commands.mjs').Discovery} discovery @returns {string[]} */
export function unknownsOf(detection, discovery) {
  /** @type {string[]} */
  const out = ['no command is VERIFIED: analysis never executes anything, so every discovered check is INFERRED until an approved run'];
  if (detection.truncated) out.push('the scan hit its file or depth cap: paths beyond it were not seen');
  if (detection.skipped.length > 0) {
    out.push(`${detection.skipped.length} entr(ies) were skipped and not followed (links, sockets, or names that are unsafe to show)`);
  }
  if (detection.git.isRepo && detection.git.commit === null) out.push('the HEAD commit could not be established');
  if (detection.git.isRepo && detection.git.clean === null) out.push('the work tree cleanliness could not be established');
  if (!detection.git.isRepo) out.push('this target is not a git repository, so commit, tree and cleanliness are all UNKNOWN');
  for (const entry of discovery.unknown) {
    out.push(`a CI line is text, not a command (${entry.basis}): ${entry.text}`);
  }
  if (detection.facts.existingFiles.some((rel) => rel.startsWith('.cellular/'))) {
    out.push('a .cellular/ directory exists: it is local evidence and Bootstrap neither reads nor writes it here');
  }
  return out;
}

/** PURE. The approvals this adoption would require, by id. @param {ReadonlyArray<ReportConflict>} conflicts
 * @returns {ReadonlyArray<{ id: string, what: string }>} */
export function approvalsOfReport(conflicts) {
  /** @type {Array<{ id: string, what: string }>} */
  const out = [];
  for (const conflict of conflicts.filter((entry) => entry.kind === 'managed-file')) {
    const gitignore = conflict.detail.startsWith('.gitignore');
    out.push({ id: gitignore ? 'gitignore-block' : 'agents-block', what: conflict.detail });
  }
  out.push({ id: 'first-cell', what: 'create the first cell, planned and never activated' });
  out.push({ id: 'baseline-checks', what: 'run the discovered checks ONCE to record their pre-existing results' });
  /** @type {Map<string, { id: string, what: string }>} */
  const unique = new Map();
  for (const entry of out) if (!unique.has(entry.id)) unique.set(entry.id, Object.freeze(entry));
  return Object.freeze([...unique.values()]);
}

/**
 * PURE. The whole Adoption Compatibility Report.
 * @param {{ detection: import('./detect.mjs').Detection,
 *   discovery: import('./commands.mjs').Discovery, target: string }} input
 * @returns {AdoptionReport}
 */
export function buildReport(input) {
  const { detection, discovery } = input;
  const conflicts = conflictsOfDetection(detection);
  return Object.freeze({
    schema: REPORT_SCHEMA,
    version: REPORT_VERSION,
    target: sanitize(input.target, 80),
    profileSuggestion: suggestProfile(detection),
    detected: Object.freeze(detectedLines(detection)),
    inferred: Object.freeze(inferredLines(detection, discovery)),
    proposed: Object.freeze(proposedLines(detection, discovery)),
    conflicts: Object.freeze(conflicts),
    unknowns: Object.freeze(unknownsOf(detection, discovery).map((text) => sanitize(text, 200))),
    approvals: approvalsOfReport(conflicts),
  });
}
