// target-scan.mjs — fills a `TargetFacts` from a real directory. READ-ONLY, by construction: the
// only `node:fs` calls here are `readdirSync`, `existsSync` and `lstatSync`, and the only process
// it starts is the one `exec.mjs` runs to ask git whether this is a work tree.
//
// NEVER FOLLOWS A LINK. A target is untrusted; a symlink called `src` pointing at a key store
// would otherwise be walked and its filenames reported. A link is counted as skipped and the walk
// does not descend. `.git/` and `node_modules/` are not walked either — not for safety but for
// honesty: they hold tens of thousands of files that no plan will ever touch, and a facts record
// that drowns the real ones is a record a human stops reading.
//
// BOUNDED. `maxFiles` and `maxDepth` are limits on THIS tool, not judgements about the project.
// When either is hit, the scan says so (`truncated`), and a truncated scan is UNKNOWN about what
// it did not see — which is why `new` only ever proceeds on a target small enough to be fully
// seen, and why `writeNew` still opens exclusively even so.
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { pathProblem } from './component-parts.mjs';
import { controlProblem } from './display.mjs';
import { isInsideWorkTree } from './exec.mjs';
import { BUILDER_DRAFT_DIR } from './plan-constants.mjs';
import { makeFacts } from './target-facts.mjs';

/** @typedef {import('./target-facts.mjs').TargetFacts} TargetFacts */
/** @typedef {import('./target-facts.mjs').HookMachinery} HookMachinery */
/** @typedef {{ facts: TargetFacts, truncated: boolean, skipped: ReadonlyArray<string>,
 *   languages: ReadonlyArray<string>, buildSystems: ReadonlyArray<string> }} Scan */

/** Directories whose contents no plan touches and no human wants listed. */
export const NOT_WALKED = Object.freeze(['.git', 'node_modules', '.cellular']);

/** Target-relative directories that are not walked WHEREVER else a directory of that name would
 * be fine. `vault/builder/` is the Prompt Builder's private draft (contract H1): not walking it is
 * how "never read for planning" is enforced by construction rather than promised — its paths reach
 * no plan, no manifest and no report, and its bytes are never opened at all. Its mere PRESENCE is
 * still established, as the boolean fact `hasBuilderDraft`, because contract H2 has to warn about
 * it. @type {ReadonlyArray<string>} */
export const NOT_WALKED_PATHS = Object.freeze([BUILDER_DRAFT_DIR.replace(/\/+$/, '')]);

export const MAX_FILES = 5000;
export const MAX_DEPTH = 8;

/** The marker file of each build system, as data. One entry, one established fact. */
const BUILD_SYSTEMS = Object.freeze([
  Object.freeze({ file: 'package.json', id: 'npm' }),
  Object.freeze({ file: 'pyproject.toml', id: 'python' }),
  Object.freeze({ file: 'requirements.txt', id: 'python' }),
  Object.freeze({ file: 'Cargo.toml', id: 'cargo' }),
  Object.freeze({ file: 'go.mod', id: 'go' }),
  Object.freeze({ file: 'pom.xml', id: 'maven' }),
  Object.freeze({ file: 'build.gradle', id: 'gradle' }),
  Object.freeze({ file: 'Makefile', id: 'make' }),
  Object.freeze({ file: 'composer.json', id: 'composer' }),
]);

/** Extension to language. A closed list: an extension nobody mapped is not a language claim. */
const LANGUAGES = Object.freeze({
  mjs: 'javascript', cjs: 'javascript', js: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', py: 'python', rs: 'rust', go: 'go', java: 'java',
  kt: 'kotlin', rb: 'ruby', php: 'php', cs: 'csharp', swift: 'swift', c: 'c', h: 'c',
  cpp: 'cpp', hpp: 'cpp', sh: 'shell', sql: 'sql', css: 'css', html: 'html',
});

/** The CI system each marker path establishes. */
const CI_MARKERS = Object.freeze([
  Object.freeze({ path: '.github/workflows', id: 'github-actions' }),
  Object.freeze({ path: '.gitlab-ci.yml', id: 'gitlab-ci' }),
  Object.freeze({ path: '.circleci', id: 'circleci' }),
  Object.freeze({ path: 'azure-pipelines.yml', id: 'azure-pipelines' }),
  Object.freeze({ path: 'bitbucket-pipelines.yml', id: 'bitbucket' }),
  Object.freeze({ path: 'Jenkinsfile', id: 'jenkins' }),
]);

/** @param {string} root @param {string} rel @returns {boolean} */
const has = (root, rel) => existsSync(join(root, ...rel.split('/')));

/**
 * The hook machinery in place, or `none`. `hooksPath` is NOT detected here: reading it means
 * `git config`, and in this cell `exec.mjs` runs `rev-parse` and nothing else. So a repository
 * whose `core.hooksPath` is already set reads as `native` or `none`, and activation stays a
 * proposal either way — which is the safe direction.
 * @param {string} root @returns {HookMachinery}
 */
export function hookMachineryOf(root) {
  if (has(root, '.husky')) return 'husky';
  for (const name of ['lefthook.yml', 'lefthook.yaml', '.lefthook.yml']) if (has(root, name)) return 'lefthook';
  if (has(root, '.pre-commit-config.yaml')) return 'pre-commit';
  const hooks = join(root, '.git', 'hooks');
  if (existsSync(hooks)) {
    try {
      const live = readdirSync(hooks).filter((name) => !name.endsWith('.sample'));
      if (live.length > 0) return 'native';
    } catch {
      return 'unknown';
    }
  }
  if (has(root, '.githooks')) return 'unknown';
  return 'none';
}

/** The files of a target, as `/`-separated relative paths, links never followed.
 * @param {string} root
 * @param {{ maxFiles?: number | undefined, maxDepth?: number | undefined }} [limits]
 * @returns {{ files: string[], truncated: boolean, skipped: string[] }} */
export function walkTarget(root, limits = {}) {
  const maxFiles = limits.maxFiles ?? MAX_FILES;
  const maxDepth = limits.maxDepth ?? MAX_DEPTH;
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const skipped = [];
  let truncated = false;
  /** @type {Array<{ rel: string, depth: number }>} */
  const pending = [{ rel: '', depth: 0 }];
  while (pending.length > 0) {
    const here = /** @type {{ rel: string, depth: number }} */ (pending.pop());
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(here.rel === '' ? root : join(root, ...here.rel.split('/')), { withFileTypes: true });
    } catch {
      skipped.push(here.rel === '' ? '.' : here.rel);
      continue;
    }
    for (const entry of entries) {
      const rel = here.rel === '' ? entry.name : `${here.rel}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        skipped.push(rel);
        continue;
      }
      if (entry.isDirectory()) {
        if (NOT_WALKED.includes(entry.name) || NOT_WALKED_PATHS.includes(rel)) continue;
        if (here.depth + 1 > maxDepth) {
          truncated = true;
          continue;
        }
        pending.push({ rel, depth: here.depth + 1 });
        continue;
      }
      if (!entry.isFile()) {
        skipped.push(rel);
        continue;
      }
      if (files.length >= maxFiles) {
        truncated = true;
        continue;
      }
      if (pathProblem(rel) !== null || controlProblem(rel) !== null) {
        skipped.push(rel);
        continue;
      }
      files.push(rel);
    }
  }
  return { files: files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), truncated, skipped };
}

/**
 * Everything planning may know about `targetRoot`. `isGitRepo` is established two ways — a `.git`
 * entry, or git's own answer — because a work tree inside a parent repository has no `.git` of its
 * own and is still a repository.
 * @param {string} targetRoot @param {{ env?: NodeJS.ProcessEnv | undefined,
 *   maxFiles?: number | undefined, maxDepth?: number | undefined }} [options] @returns {Scan}
 */
export function scanTarget(targetRoot, options = {}) {
  const walked = walkTarget(targetRoot, options);
  const present = new Set(walked.files);
  const languages = new Set();
  for (const rel of walked.files) {
    const dot = rel.lastIndexOf('.');
    const table = /** @type {Readonly<Record<string, string | undefined>>} */ (LANGUAGES);
    const found = dot > 0 ? table[rel.slice(dot + 1).toLowerCase()] : undefined;
    if (found !== undefined) languages.add(found);
  }
  const facts = makeFacts({
    isGitRepo: has(targetRoot, '.git') || isInsideWorkTree(targetRoot, options.env),
    existingFiles: walked.files,
    tools: {
      claude: present.has('CLAUDE.md') || has(targetRoot, '.claude'),
      cursor: has(targetRoot, '.cursor'),
    },
    hookMachinery: hookMachineryOf(targetRoot),
    ci: CI_MARKERS.filter((marker) => has(targetRoot, marker.path)).map((marker) => marker.id),
    hasInstallManifest: present.has('vault/install-manifest.json'),
    hasProjectContract: present.has('vault/project-contract.json'),
    // PRESENCE only, and never a read: the draft is not authoritative about anything (H1).
    hasBuilderDraft: has(targetRoot, BUILDER_DRAFT_DIR),
  });
  return {
    facts,
    truncated: walked.truncated,
    skipped: Object.freeze(walked.skipped.map((rel) => rel.split(sep).join('/'))),
    languages: Object.freeze([...languages].sort()),
    buildSystems: Object.freeze([...new Set(BUILD_SYSTEMS
      .filter((entry) => present.has(entry.file)).map((entry) => entry.id))].sort()),
  };
}
