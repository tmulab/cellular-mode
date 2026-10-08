// existing-flow.mjs — `bootstrap existing <target>`: adopt the method into a codebase that already
// exists, analysis first.
//
// TWO MODES, AND THE FIRST ONE IS A PROMISE. `--analyze` reads, reports and STOPS. It writes
// nothing at all — not a report, not a cache, not a scratch file, and (because every git probe runs
// with `GIT_OPTIONAL_LOCKS=0`) not even `.git/index`; the test hashes the whole tree with `.git`.
//
// THAT PROMISE IS WHY `--save-report` IS REFUSED HERE (decision, this cell). The contract allows the
// report to be saved into git-ignored `vault/bootstrap/`, and saving it would still be a write, so
// "analysis writes nothing" would become "analysis writes nothing except when it does" — a sentence
// no reviewer can check. So: with `--analyze`, `--save-report` is a usage error and `--json` prints
// the same document. On the INSTALL path `--save-report` writes `vault/bootstrap/adoption-report.json`,
// deliberately NOT in the install manifest: `vault/bootstrap/` is git-ignored scratch, and the
// manifest records controlled history.
//
// BEHAVIOUR PRESERVATION. Installing into a live codebase may create files and may append an
// approved managed block to `AGENTS.md`, `CLAUDE.md` or `.gitignore` — whose exact text the plan
// now prints (H5). Nothing else that already exists is touched: `plan-actions.classify` turns every
// other collision into a conflict or a patch, and `applyPlan` refuses a plan with any conflict.
import { basename } from 'node:path';
import { BASELINE_APPROVAL, BASELINE_REL, assertBaseline, buildBaseline, executionLimitations, runBaselineChecks } from './baseline.mjs';
import { discoverCommands } from './commands.mjs';
import { detectTarget } from './detect.mjs';
import { MAX_ACTIONABLE, plural, sanitize } from './display.mjs';
import { CODES, refuse } from './errors.mjs';
import { preparePlan, requireExistingDirectory, sourceIdentity } from './new-flow.mjs';
import { INSTALL_MANIFEST, SCRATCH_DIR, VERIFICATION_FILE } from './plan-constants.mjs';
import { contractFor, contractLines } from './verification.mjs';
import { applyPlan } from './apply.mjs';
import { consentRender, warningLines } from './plan-consent.mjs';
import { existingInstallRefusal } from './status-read.mjs';
import { buildReport } from './report.mjs';
import { renderReport, reportJson } from './render-report.mjs';
import { assertNoOverlap, writeNew } from './writer.mjs';

/** @typedef {{ lines: string[], code: number, stdout?: boolean }} FlowResult */

/** Where `--save-report` puts the report on the install path. Git-ignored scratch, by BS2. */
export const REPORT_REL = `${SCRATCH_DIR}adoption-report.json`;

/** @param {import('./report.mjs').AdoptionReport} report
 * @param {{ json?: boolean | undefined, saveReport?: boolean | undefined }} input
 * @returns {FlowResult} */
function analyzeResult(report, input) {
  if (input.saveReport === true) {
    throw refuse(CODES.USAGE,
      '--save-report cannot be combined with --analyze: analysis writes nothing at all. Use --json and redirect it, or --save-report on the install path',
      {});
  }
  const lines = input.json === true ? [reportJson(report).trimEnd()] : [renderReport(report)];
  // Exit 2 is "analysis findings" (bootstrap/CONTRACTS.md, Exit codes). The report still goes to
  // stdout, because a findings exit is a verdict about the project and not a failure of the command.
  return { lines, code: report.conflicts.length > 0 ? 2 : 0, stdout: true };
}

/** The lines that tell a human what the baseline recorded, and what it did not.
 * @param {ReturnType<typeof runBaselineChecks>} checks @returns {string[]} */
function baselineLines(checks) {
  if (!checks.ran) return [`Baseline: ${BASELINE_REL} — ${checks.reason}`];
  /** @type {Record<string, number>} */
  const counts = {};
  for (const entry of checks.results) counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  const summary = Object.entries(counts).sort().map(([status, count]) => `${count} ${status}`).join(', ');
  return [
    `Baseline: ${BASELINE_REL} — ${plural(checks.results.length, 'check')} executed (${summary === '' ? 'none' : summary}).`,
    'A failing check is recorded as a PRE-EXISTING failure of this project. Bootstrap never fixes it.',
  ];
}

/** @param {import('./apply.mjs').ApplyResult} result @param {string} name
 * @param {string[]} extra @returns {string[]} */
function summaryLines(result, name, extra) {
  /** @type {string[]} */
  const out = [`Adopted Cellular Mode into ${sanitize(name)}.`, ''];
  out.push(`Files written: ${plural(result.files.length, 'file')}`);
  out.push(`Install record: ${INSTALL_MANIFEST}`);
  out.push(...extra);
  out.push('', 'Integrations:');
  for (const entry of result.integrations) out.push(`  - ${entry.kind} [${entry.status}] ${sanitize(entry.detail, 200)}`);
  if (result.limitations.length > 0) {
    out.push('', `Not applied (${result.limitations.length}) — recorded in the install manifest:`);
    // IN FULL: a limitation names a command to run, and a truncated command is not actionable (A-13).
    for (const line of result.limitations) out.push(`  - ${sanitize(line, MAX_ACTIONABLE)}`);
  }
  out.push('', `First cell: ${sanitize(result.cell.detail, 200)}`);
  out.push('', 'No pre-existing file was replaced. Not activated.');
  return out;
}

/**
 * Runs `existing`. Returns lines and an exit code; it never calls `process.exit`.
 * @param {{ sourceRoot: string, targetArg: string, analyze?: boolean | undefined,
 *   json?: boolean | undefined, saveReport?: boolean | undefined, profile?: string | undefined,
 *   components?: ReadonlyArray<string> | undefined, approvals: ReadonlySet<string>,
 *   dryRun?: boolean | undefined, confirm?: boolean | undefined,
 *   mode?: import('./render-plan.mjs').RenderMode | undefined, verbose?: boolean | undefined,
 *   timeoutMs?: number | undefined, mandatory?: ReadonlyArray<string> | undefined,
 *   now: string, env?: NodeJS.ProcessEnv | undefined,
 *   firstCell?: typeof import('./compose-builder.mjs').installFirstCell | undefined,
 *   runOne?: typeof import('./exec.mjs').runCheck | undefined }} input
 * @returns {FlowResult}
 */
export function runExisting(input) {
  const targetRoot = requireExistingDirectory(input.targetArg);
  const name = basename(targetRoot);
  assertNoOverlap(input.sourceRoot, targetRoot);
  const detection = detectTarget(targetRoot, { env: input.env });
  const discovery = discoverCommands(detection);
  const report = buildReport({ detection, discovery, target: name });
  if (input.analyze === true) return analyzeResult(report, input);
  if (input.profile === undefined && input.components === undefined) {
    throw refuse(CODES.USAGE,
      `existing needs --analyze, or a profile to install: --profile ${report.profileSuggestion} (suggested by the analysis, never a default)`,
      {});
  }
  if (detection.facts.hasInstallManifest) {
    throw existingInstallRefusal({ targetRoot, sourceRoot: input.sourceRoot, env: input.env });
  }
  const { source, plan, componentVersions } = preparePlan({
    sourceRoot: input.sourceRoot,
    facts: detection.facts,
    profile: input.profile ?? 'custom',
    components: input.components,
  });
  // ONE approval list (B-04): the report's own list is suppressed here and the plan carries the
  // union, `baseline-checks` included, so a dry run prints exactly one consent document.
  const head = input.json === true ? [] : [renderReport(report, { approvals: false }), '', '— Installation plan —', ''];
  const rendered = consentRender({ plan, read: (rel) => source.read(rel), projectName: name,
    json: input.json === true, ...(input.mode === undefined ? {} : { mode: input.mode }),
    verbose: input.verbose === true, extraApprovals: [BASELINE_APPROVAL] });
  if (input.dryRun === true) {
    return { lines: [...head, ...rendered, ...(input.json === true ? [] : ['', 'Dry run: nothing was written.'])], code: 0 };
  }
  if (input.confirm !== true) {
    return {
      lines: [...head, ...rendered, ...(input.json === true ? [] : ['',
        `Nothing was written. Re-run with --confirm to adopt, --approve <ids> for the steps above, and --approve ${BASELINE_APPROVAL} to record what your checks do today.`])],
      code: 5,
    };
  }
  return install({ ...input, targetRoot, name, detection, discovery, report, source, plan, componentVersions });
}

/** The writing half, separated so that every refusal above it is provably before any write.
 * @param {Parameters<typeof runExisting>[0] & { targetRoot: string, name: string,
 *   detection: import('./detect.mjs').Detection,
 *   discovery: import('./commands.mjs').Discovery,
 *   report: import('./report.mjs').AdoptionReport,
 *   source: import('./source-read.mjs').Source, plan: import('./plan.mjs').Plan,
 *   componentVersions: Record<string, string> }} input @returns {FlowResult} */
function install(input) {
  const { detection, discovery, plan, targetRoot } = input;
  const checks = runBaselineChecks({
    commands: discovery.commands,
    targetRoot,
    approvals: input.approvals,
    confirm: true,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.env === undefined ? {} : { env: input.env }),
    ...(input.runOne === undefined ? {} : { runOne: input.runOne }),
  });
  // The verification contract (BS3): a VERIFIED label in it always names a real execution here.
  const { contract, mandatory } = contractFor({ projectName: input.name, now: input.now,
    commands: discovery.commands, results: checks.results, ...(input.mandatory === undefined ? {} : { mandatory: input.mandatory }) });
  const baseline = assertBaseline(buildBaseline({
    detection,
    discovery,
    checkResults: checks.results,
    limitations: checks.ran ? executionLimitations() : [String(checks.reason)],
    now: input.now,
  }));
  const result = applyPlan({
    sourceRoot: input.sourceRoot, targetRoot, plan, approvals: input.approvals, confirm: true,
    now: input.now, env: input.env, firstCell: input.firstCell,
    readSource: (rel) => input.source.bytes(rel),
    readTemplate: (rel) => input.source.read(rel),
    componentVersions: input.componentVersions,
    source: sourceIdentity((rel) => input.source.read(rel), input.sourceRoot, input.env),
    host: {
      languages: detection.languages,
      buildSystems: detection.buildSystems.map((entry) => entry.id),
      ci: detection.facts.ci,
      hooks: detection.hooks.machinery,
    },
    projectName: input.name,
    contract,
    mandatory,
    extras: [{ path: BASELINE_REL, bytes: `${JSON.stringify(baseline, null, 2)}\n`, mode: 'generate' }],
    limitations: detection.truncated
      ? ['the target scan hit its file or depth cap: paths beyond it were not seen']
      : [],
  });
  const extra = [...baselineLines(checks), ...contractLines(contract, VERIFICATION_FILE),
    ...warningLines(plan, input.approvals)];
  if (input.saveReport === true) {
    writeNew(targetRoot, REPORT_REL, reportJson(input.report));
    extra.push(`Report saved: ${REPORT_REL} (git-ignored scratch, so it is NOT in the install manifest)`);
  }
  return { lines: summaryLines(result, input.name, extra), code: 0 };
}
