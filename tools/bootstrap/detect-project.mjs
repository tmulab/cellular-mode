// detect-project.mjs — the project's PROCESS: how it is built by a machine, how it guards its
// commits, which agents it already instructs, what it documents, how it ships.
//
// CI WORKFLOWS ARE READ, NEVER RUN, AND NEVER REPRODUCED. A workflow is a program somebody else
// wrote; the only thing taken from it is the text of its `run:` lines, each one sanitized and
// truncated to `RUN_CAP`, and capped at `MAX_RUN_LINES` per file. That is enough to tell a human
// "this is how your CI checks things" and far too little to leak a step's inline secret or to
// reconstruct the pipeline. The lines are INFERRED evidence: the file says it, we did not see it
// happen.
//
// A `run:` line is also not automatically a COMMAND. `commands.mjs` promotes one only when it
// parses into a simple argv — no pipe, no `&&`, no `$`, no redirect — and everything else stays
// text that a human reads. Turning `npm test | tee log` into an argv array would be a quiet lie
// about what that step does.
import { sanitize } from './display.mjs';

/** @typedef {import('./detect-tooling.mjs').Detected} Detected */
/** @typedef {import('./detect-tooling.mjs').Probe} Probe */
/** @typedef {import('./target-facts.mjs').HookMachinery} HookMachinery */
/** @typedef {{ file: string, line: string }} RunLine */
/** @typedef {{ id: string, files: ReadonlyArray<string>,
 *   runLines: ReadonlyArray<RunLine> }} CiProvider */
/** @typedef {{ machinery: HookMachinery, hooksPath: string | null,
 *   evidence: ReadonlyArray<string> }} HookFacts */

/** How much of one `run:` line may be shown. */
export const RUN_CAP = 100;

/** How many `run:` lines are taken from one workflow file. */
export const MAX_RUN_LINES = 40;

/** How many workflow files are read per provider. */
export const MAX_CI_FILES = 10;

/** @param {string} id @param {string} evidence @param {'VERIFIED'|'INFERRED'} label @returns {Detected} */
const found = (id, evidence, label) => Object.freeze({ id, evidence, label });

/** Where each CI provider keeps its definition. `dir` providers have many files; `file` providers
 * have one. */
export const CI_SOURCES = Object.freeze([
  Object.freeze({ id: 'github-actions', re: /^\.github\/workflows\/[^/]+\.ya?ml$/ }),
  Object.freeze({ id: 'gitlab-ci', re: /^\.gitlab-ci\.ya?ml$/ }),
  Object.freeze({ id: 'circleci', re: /^\.circleci\/config\.ya?ml$/ }),
  Object.freeze({ id: 'azure-pipelines', re: /^azure-pipelines\.ya?ml$/ }),
  Object.freeze({ id: 'bitbucket', re: /^bitbucket-pipelines\.ya?ml$/ }),
  Object.freeze({ id: 'jenkins', re: /^Jenkinsfile$/ }),
]);

/**
 * PURE. The `run:` lines of one CI definition, sanitized and capped. Handles both the inline form
 * (`run: npm test`) and the block form (`run: |` followed by indented lines), because a project's
 * real commands are as often in the second as in the first.
 * @param {string | null} text @param {number} [cap] @returns {ReadonlyArray<string>}
 */
export function runLinesOf(text, cap = MAX_RUN_LINES) {
  if (typeof text !== 'string') return Object.freeze([]);
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < lines.length && out.length < cap; i += 1) {
    const here = String(lines[i]);
    const inline = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(here);
    if (inline === null) continue;
    const indent = String(inline[1]).length;
    const value = String(inline[2]).trim();
    if (value !== '' && value !== '|' && value !== '>' && value !== '|-' && value !== '>-') {
      out.push(sanitize(value, RUN_CAP));
      continue;
    }
    for (let j = i + 1; j < lines.length && out.length < cap; j += 1) {
      const body = String(lines[j]);
      if (body.trim() === '') continue;
      const bodyIndent = body.length - body.trimStart().length;
      if (bodyIndent <= indent) break;
      out.push(sanitize(body.trim(), RUN_CAP));
      i = j;
    }
  }
  return Object.freeze(out);
}

/** The CI providers in use, with their files and their `run:` lines. @param {Probe} probe
 * @returns {ReadonlyArray<CiProvider>} */
export function detectCi(probe) {
  /** @type {CiProvider[]} */
  const out = [];
  for (const source of CI_SOURCES) {
    const files = probe.matches(source.re).slice(0, MAX_CI_FILES);
    if (files.length === 0) continue;
    /** @type {RunLine[]} */
    const runLines = [];
    for (const file of files) {
      for (const line of runLinesOf(probe.readText(file))) runLines.push(Object.freeze({ file, line }));
    }
    out.push(Object.freeze({ id: source.id, files: Object.freeze(files), runLines: Object.freeze(runLines) }));
  }
  return Object.freeze(out);
}

/**
 * PURE. The hook facts, with `machinery` decided by the scanner and `hooksPath` by git itself.
 * An explicit `core.hooksPath` WINS over everything else: it is the setting that actually decides
 * which directory git runs, so reporting `native` while a hooksPath is in force would describe a
 * repository that does not exist.
 * @param {HookMachinery} machinery @param {string | null} hooksPath @returns {HookFacts}
 */
export function hookFacts(machinery, hooksPath) {
  /** @type {string[]} */
  const evidence = [];
  if (hooksPath !== null) evidence.push(`git config core.hooksPath = ${sanitize(hooksPath, 60)}`);
  if (machinery !== 'none') evidence.push(`detected ${machinery} hook machinery`);
  if (evidence.length === 0) evidence.push('no hook machinery found');
  return Object.freeze({
    machinery: hooksPath !== null ? /** @type {HookMachinery} */ ('hooksPath') : machinery,
    hooksPath,
    evidence: Object.freeze(evidence),
  });
}

/** The agent instruction files already in the target, by exact name or by directory prefix. */
export const INSTRUCTION_SOURCES = Object.freeze([
  Object.freeze({ id: 'agents-md', re: /^AGENTS\.md$/ }),
  Object.freeze({ id: 'claude-md', re: /^CLAUDE\.md$/ }),
  Object.freeze({ id: 'cursorrules', re: /^\.cursorrules$/ }),
  Object.freeze({ id: 'cursor-dir', re: /^\.cursor\// }),
  Object.freeze({ id: 'copilot-instructions', re: /^\.github\/copilot-instructions\.md$/ }),
  Object.freeze({ id: 'gemini-md', re: /^GEMINI\.md$/ }),
  Object.freeze({ id: 'windsurfrules', re: /^\.windsurfrules$/ }),
]);

/** The documentation a human can be pointed at instead of a duplicate. */
export const DOC_SOURCES = Object.freeze([
  Object.freeze({ id: 'readme', re: /^README(\.md|\.rst|\.txt)?$/ }),
  Object.freeze({ id: 'docs-dir', re: /^docs\// }),
  Object.freeze({ id: 'architecture', re: /^ARCHITECTURE[^/]*$/ }),
  Object.freeze({ id: 'contributing', re: /^CONTRIBUTING[^/]*$/ }),
]);

/** The security machinery already in place. CodeQL is a workflow NAME, so it is INFERRED. */
export const SECURITY_SOURCES = Object.freeze([
  Object.freeze({ id: 'security-md', re: /^SECURITY\.md$/ }),
  Object.freeze({ id: 'dependabot', re: /^\.github\/dependabot\.ya?ml$/ }),
  Object.freeze({ id: 'codeql', re: /^\.github\/workflows\/[^/]*codeql[^/]*\.ya?ml$/i }),
  Object.freeze({ id: 'gitleaks', re: /^\.gitleaks(\.toml|ignore)?$/ }),
  Object.freeze({ id: 'snyk', re: /^\.snyk$/ }),
]);

/** How this project appears to ship. All hints, all INFERRED. */
export const RELEASE_SOURCES = Object.freeze([
  Object.freeze({ id: 'changelog', re: /^CHANGELOG[^/]*$/ }),
  Object.freeze({ id: 'release-workflow', re: /^\.github\/workflows\/[^/]*release[^/]*\.ya?ml$/i }),
  Object.freeze({ id: 'goreleaser', re: /^\.goreleaser\.ya?ml$/ }),
]);

/** PURE. The first matching path for each entry of a source table, as evidence.
 * @param {Probe} probe @param {ReadonlyArray<{ id: string, re: RegExp }>} table
 * @param {'VERIFIED'|'INFERRED'} label @returns {ReadonlyArray<Detected>} */
export function detectBySources(probe, table, label = 'VERIFIED') {
  /** @type {Detected[]} */
  const out = [];
  for (const entry of table) {
    const path = probe.firstMatch(entry.re);
    if (path !== null && !out.some((seen) => seen.id === entry.id)) out.push(found(entry.id, path, label));
  }
  return Object.freeze(out);
}
