// detect.mjs — one read-only pass over an existing project, and the record it produces.
//
// IT EXTENDS THE CELL 3 SCANNER, it does not replace it. `scanTarget` already walks the tree with
// the caps, the symlink refusal and the `.git`/`node_modules` exclusions that make a walk of an
// untrusted directory safe; everything here is layered on the file list it returns. A second
// scanner would be a second set of those decisions to keep in agreement, which is how one of them
// ends up weaker.
//
// IT WRITES NOTHING, and that is checkable by reading this file: the only disk calls are the
// scanner's `readdirSync`/`lstatSync`, `readIfPresent` (confined, size-capped, read-only), and
// four git invocations that git itself cannot be asked to perform without a process —
// `rev-parse`, `status --porcelain` and `config --get core.hooksPath`. Every one of them runs with
// `GIT_OPTIONAL_LOCKS=0`, `--no-optional-locks` and `core.fsmonitor=false`, because a plain
// `git status` REWRITES `.git/index` and would make "analysis wrote nothing" false.
//
// IT NEVER EXECUTES A PROJECT COMMAND. Not a test, not a build, not a script. The only programs
// started are the read-only git probes above.
import { hookMachineryOf, scanTarget } from './target-scan.mjs';
import { gitHooksPath, gitRevision, gitStatusCounts, gitTree } from './exec.mjs';
import { mentions, packageFacts, readManifest } from './detect-manifests.mjs';
import {
  detectBuildSystems, detectPackageManagers, detectQualityTools, detectTestFrameworks,
} from './detect-tooling.mjs';
import {
  DOC_SOURCES, INSTRUCTION_SOURCES, RELEASE_SOURCES, SECURITY_SOURCES, detectBySources, detectCi,
  hookFacts,
} from './detect-project.mjs';
import { makeTargets } from './detect-manifests.mjs';
import { readIfPresent } from './writer.mjs';

/** @typedef {import('./detect-tooling.mjs').Detected} Detected */
/** @typedef {import('./detect-tooling.mjs').Probe} Probe */
/** @typedef {{ isRepo: boolean, commit: string | null, tree: string | null,
 *   clean: boolean | null, changedCount: number | null }} GitFacts */
/** @typedef {{ facts: import('./target-facts.mjs').TargetFacts,
 *   languages: ReadonlyArray<string>, buildSystems: ReadonlyArray<Detected>,
 *   packageManagers: ReadonlyArray<Detected>, testFrameworks: ReadonlyArray<Detected>,
 *   qualityTools: ReadonlyArray<Detected>,
 *   ci: ReadonlyArray<import('./detect-project.mjs').CiProvider>,
 *   hooks: import('./detect-project.mjs').HookFacts, hasGitAttributes: boolean,
 *   instructionFiles: ReadonlyArray<Detected>, docs: ReadonlyArray<Detected>,
 *   securityTooling: ReadonlyArray<Detected>, releaseHints: ReadonlyArray<Detected>,
 *   makeTargets: ReadonlyArray<string>, pkg: import('./detect-manifests.mjs').PackageFacts | null,
 *   git: GitFacts, truncated: boolean, skipped: ReadonlyArray<string> }} Detection */

/** How much of a CI definition is read. A workflow is kilobytes; anything larger is not read at
 * all rather than read in part, because a truncated YAML is a misleading YAML. */
export const MAX_TEXT = 128 * 1024;

/**
 * The read-only probe over one target. Every reader is memoised, so a detector asking twice costs
 * one disk read, and every reader is TOTAL: an absent, oversized or unreadable file is `null`.
 * @param {string} targetRoot @param {ReadonlyArray<string>} files target-relative, scanner-checked
 * @returns {Probe}
 */
export function makeProbe(targetRoot, files) {
  const present = new Set(files);
  /** @type {Map<string, string | null>} */
  const cache = new Map();
  /** @param {string} rel @param {(path: string) => string | null} reader @returns {string | null} */
  const cached = (rel, reader) => {
    if (cache.has(rel)) return cache.get(rel) ?? null;
    let text = null;
    try {
      text = reader(rel);
    } catch {
      text = null;
    }
    cache.set(rel, text);
    return text;
  };
  const text = (/** @type {string} */ rel) => cached(rel, (path) => readManifest(targetRoot, path));
  return Object.freeze({
    has: (rel) => present.has(rel),
    firstMatch: (re) => files.find((rel) => re.test(rel)) ?? null,
    matches: (re) => Object.freeze(files.filter((rel) => re.test(rel))),
    pkg: packageFacts(text('package.json')),
    text,
    readText: (rel) => (present.has(rel)
      ? cached(`raw:${rel}`, () => readIfPresent(targetRoot, rel, MAX_TEXT))
      : null),
    mentionsIn: (rels, token) => rels.find((rel) => mentions(text(rel), token)) ?? null,
  });
}

/** The git facts of a target, each one `null` when it is not established. @param {string} targetRoot
 * @param {boolean} isRepo @param {NodeJS.ProcessEnv} [env] @returns {GitFacts} */
export function gitFacts(targetRoot, isRepo, env) {
  if (!isRepo) {
    return Object.freeze({ isRepo: false, commit: null, tree: null, clean: null, changedCount: null });
  }
  const status = gitStatusCounts(targetRoot, env);
  return Object.freeze({
    isRepo: true,
    commit: gitRevision(targetRoot, env),
    tree: gitTree(targetRoot, env),
    clean: status === null ? null : status.clean,
    changedCount: status === null ? null : status.changedCount,
  });
}

/**
 * Everything adoption knows about an existing project. READ-ONLY; see this file's header for the
 * exhaustive list of disk and process calls it makes.
 * @param {string} targetRoot @param {{ env?: NodeJS.ProcessEnv | undefined,
 *   maxFiles?: number | undefined, maxDepth?: number | undefined }} [options] @returns {Detection}
 */
export function detectTarget(targetRoot, options = {}) {
  const scan = scanTarget(targetRoot, options);
  const probe = makeProbe(targetRoot, scan.facts.existingFiles);
  const hooksPath = scan.facts.isGitRepo ? gitHooksPath(targetRoot, options.env) : null;
  return Object.freeze({
    facts: scan.facts,
    languages: scan.languages,
    buildSystems: detectBuildSystems(probe),
    packageManagers: detectPackageManagers(probe),
    testFrameworks: detectTestFrameworks(probe),
    qualityTools: detectQualityTools(probe),
    ci: detectCi(probe),
    hooks: hookFacts(hookMachineryOf(targetRoot), hooksPath),
    hasGitAttributes: probe.has('.gitattributes'),
    instructionFiles: detectBySources(probe, INSTRUCTION_SOURCES),
    docs: detectBySources(probe, DOC_SOURCES),
    securityTooling: detectBySources(probe, SECURITY_SOURCES),
    releaseHints: detectBySources(probe, RELEASE_SOURCES, 'INFERRED'),
    makeTargets: makeTargets(probe.text('Makefile')),
    pkg: probe.pkg,
    git: gitFacts(targetRoot, scan.facts.isGitRepo, options.env),
    truncated: scan.truncated,
    skipped: scan.skipped,
  });
}

/** PURE. The ids of a detected list, sorted — the form a baseline and a report both want.
 * @param {ReadonlyArray<Detected>} items @returns {ReadonlyArray<string>} */
export function idsOf(items) {
  return Object.freeze([...new Set(items.map((entry) => entry.id))].sort());
}
