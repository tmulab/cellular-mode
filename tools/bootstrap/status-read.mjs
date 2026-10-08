// status-read.mjs — the reader behind `status`, and the one place that compares an install record
// with the disk. READ-ONLY by construction: the only `node:fs` calls reachable from here are the
// confined reads of `writer-base.mjs` and a `readdirSync` walk, and the only process it starts is
// the `git config --get core.hooksPath` probe of `exec.mjs`, which runs with `GIT_OPTIONAL_LOCKS=0`
// so that not even `.git/index` is rewritten. The test for `status` hashes the whole target tree,
// `.git` included, before and after.
//
// EVERY JUDGEMENT IS MADE ELSEWHERE. This file produces facts; `status.mjs` classifies them. That
// split is what lets the classification be tested from a fixture, and what makes "status writes
// nothing" a property of one small file instead of a promise about a command.
import { readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { CODES, refuse } from './errors.mjs';
import { gitHooksPath } from './exec.mjs';
import { assertInstallManifest } from './install-manifest.mjs';
import { HOOKS_DIR, INSTALL_MANIFEST, SCRATCH_DIR } from './plan-constants.mjs';
import { diskSource, sourceIdentity } from './source-read.mjs';
import { readResidue } from './status-residue.mjs';
import { classify, createdDirsOf, entriesOf } from './status.mjs';
import { NOT_WALKED } from './target-scan.mjs';
import { BEGIN, blockSpan, bytesIfPresent, confine, readIfPresent, sha256 } from './writer.mjs';

/** @typedef {import('./status.mjs').Entry} Entry */
/** @typedef {import('./status.mjs').FileFact} FileFact */
/** @typedef {import('./status.mjs').StatusFacts} StatusFacts */

/** How many unowned files a status walk will list before it stops looking. A bound on this tool,
 * not a judgement about the project; a truncated walk is reported as such. */
export const MAX_EXTRAS = 500;

/** The manifest as a validated record, or a BAD_MANIFEST refusal. `null` means "no install here",
 * which is an answer and not a failure. @param {string} targetRoot
 * @returns {Record<string, unknown> | null} */
export function readManifest(targetRoot) {
  const text = readIfPresent(targetRoot, INSTALL_MANIFEST);
  if (text === null) return null;
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw refuse(CODES.BAD_MANIFEST, `${INSTALL_MANIFEST} is not valid JSON: this target cannot be reasoned about`, {});
  }
  return assertInstallManifest(parsed);
}

/** The state of one recorded file, re-read from disk. @param {string} targetRoot
 * @param {Entry} entry @returns {FileFact} */
export function fileFactOf(targetRoot, entry) {
  const bytes = bytesIfPresent(targetRoot, entry.path);
  if (bytes === null) {
    return { entry, state: 'missing', block: entry.block === null ? null : 'missing', sha256: null };
  }
  // The digest of what is on disk NOW. Recorded here so that a plan can name it and the deletion
  // can re-hash against it; the re-hash in `removeOwned` is what actually guards the unlink.
  const digest = sha256(bytes);
  const state = entry.created ? (digest === entry.sha256After ? 'healthy' : 'modified') : 'referenced';
  if (entry.block === null) return { entry, state, block: null, sha256: digest };
  const text = bytes.toString('utf8');
  const span = blockSpan(text, entry.block.component);
  if ('problem' in span) {
    // No marker at all means the block is GONE; a duplicated or unbalanced pair means somebody
    // edited the delimiters, which is not intact and is never removed automatically.
    const present = text.includes(`${BEGIN} ${entry.block.component}`);
    return { entry, state, block: present ? 'modified' : 'missing', sha256: digest };
  }
  const block = entry.block.sha256 === null
    ? 'unknown'
    : (sha256(span.text) === entry.block.sha256 ? 'intact' : 'modified');
  return { entry, state, block, sha256: digest };
}

/**
 * The files inside directories the install created that the manifest does not own — somebody's own
 * notes, and never anything Bootstrap touches. `vault/bootstrap/` is excluded: it is the git-ignored
 * scratch the tool itself writes, so listing it as somebody else's file would be a lie.
 * @param {string} targetRoot @param {ReadonlyArray<string>} createdDirs
 * @param {ReadonlySet<string>} owned
 * @returns {{ extras: ReadonlyArray<string>, truncated: boolean }}
 */
export function extrasIn(targetRoot, createdDirs, owned) {
  /** @type {Set<string>} */
  const found = new Set();
  let truncated = false;
  /** @param {string} rel @returns {void} */
  const walk = (rel) => {
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(confine(targetRoot, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = `${rel}/${entry.name}`;
      if (entry.isSymbolicLink() || NOT_WALKED.includes(entry.name)) continue;
      if (child.startsWith(SCRATCH_DIR) || `${child}/` === SCRATCH_DIR) continue;
      // The install record is Bootstrap's own file and names itself nowhere: it is not somebody
      // else's "extra" file, and `uninstall` removes it last by its own digest.
      if (child === INSTALL_MANIFEST) continue;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && !owned.has(child)) {
        if (found.size >= MAX_EXTRAS) truncated = true;
        else found.add(child);
      }
    }
  };
  const roots = createdDirs.filter((dir) => !createdDirs.some((other) => dir.startsWith(`${other}/`)));
  for (const dir of roots) walk(dir);
  return { extras: Object.freeze([...found].sort()), truncated };
}

/**
 * Every fact `status` reasons about. No write, no mutation of the target, no judgement.
 * @param {{ targetRoot: string, sourceRoot?: string | undefined,
 *   env?: NodeJS.ProcessEnv | undefined }} input
 * @returns {{ facts: StatusFacts, manifest: Record<string, unknown> | null,
 *   entries: ReadonlyArray<Entry>, createdDirs: ReadonlyArray<string>, truncated: boolean }}
 */
export function readStatusFacts(input) {
  const { targetRoot } = input;
  const manifest = readManifest(targetRoot);
  const empty = { installed: false, source: null, sourceNow: null, profile: '', installedAt: '',
    components: [], files: [], extras: [], residue: null, integrations: [], hooksPath: null,
    hooksDir: HOOKS_DIR };
  if (manifest === null) {
    return { facts: /** @type {StatusFacts} */ (empty), manifest: null, entries: [], createdDirs: [], truncated: false };
  }
  const entries = entriesOf(manifest);
  const createdDirs = createdDirsOf(entries);
  const owned = new Set(entries.map((entry) => entry.path));
  const { extras, truncated } = extrasIn(targetRoot, createdDirs, owned);
  const source = /** @type {import('./status.mjs').Identity} */ (manifest.source);
  const sourceNow = input.sourceRoot === undefined
    ? null
    : sourceIdentity((rel) => diskSource(String(input.sourceRoot)).read(rel), String(input.sourceRoot), input.env);
  /** @type {StatusFacts} */
  const facts = {
    installed: true,
    source,
    sourceNow,
    profile: String(manifest.profile),
    installedAt: String(manifest.installedAt),
    components: /** @type {ReadonlyArray<{ id: string }>} */ (manifest.components ?? []).map((entry) => String(entry.id)),
    files: entries.map((entry) => fileFactOf(targetRoot, entry)),
    extras,
    // The uninstall's own report, when there is one: the signal that separates a finished removal
    // from a damaged install, read rather than written (contract H3).
    residue: readResidue(targetRoot),
    integrations: /** @type {ReadonlyArray<{ kind: string, status: string, detail: string }>} */ (manifest.integrations ?? []),
    hooksPath: gitHooksPath(targetRoot, input.env),
    hooksDir: HOOKS_DIR,
  };
  return { facts, manifest, entries, createdDirs, truncated };
}

/**
 * The refusal `new` and `existing` raise when a manifest is already there. It carries the
 * CLASSIFICATION, so the human is told whether this is a repair, an upgrade or a healthy install
 * rather than being invited to guess — and never offered a silent reinstall.
 * @param {{ targetRoot: string, sourceRoot?: string | undefined,
 *   env?: NodeJS.ProcessEnv | undefined }} input @returns {Error}
 */
export function existingInstallRefusal(input) {
  const name = basename(input.targetRoot);
  /** @type {string} */
  let verdict;
  try {
    const { facts } = readStatusFacts(input);
    const result = classify(facts);
    verdict = `status: ${result.classification}, next action: ${result.action} — ${result.why}`;
  } catch (error) {
    // A record this tool cannot read is UNKNOWN, and UNKNOWN still refuses: an install is present.
    verdict = `status: UNKNOWN — ${INSTALL_MANIFEST} did not validate (${error instanceof Error ? error.message : 'unreadable'})`;
  }
  return refuse(CODES.EXISTING_INSTALL,
    `${INSTALL_MANIFEST} is already there, so nothing was installed. ${verdict} Run \`status\` for the detail, \`uninstall\` to remove it.`,
    { target: name });
}
