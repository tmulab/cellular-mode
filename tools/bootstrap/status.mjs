// status.mjs — what an installation IS, decided from facts and nothing else. PURE: no filesystem,
// no clock, no process. `status-read.mjs` gathers the facts; this file classifies and renders them.
//
// THREE CLASSIFICATIONS, AND THE DIFFERENCE MATTERS. `healthy` means every file Bootstrap created
// still hashes to what the manifest recorded and every managed block is byte-intact. `partial`
// means a created file is GONE — the install is incomplete, not merely edited. `drift` means
// something Bootstrap owns was CHANGED. A file somebody else owns is never drift: a managed block
// inside their `AGENTS.md` is judged by the block's own digest, because the rest of that file is
// theirs to change and always will be.
//
// AN UNOWNED FILE IS NOT DRIFT EITHER. `extra` lists files that live inside directories the install
// created and that the manifest does not own — somebody's notes in `skills/cell/`, for instance.
// They are listed so that a human can see them, NEVER touched, and they never change the verdict.
//
// THE NEXT ACTION IS NEVER "REINSTALL". A newer source means `upgrade`; the same version at a
// different commit means `repair-or-upgrade`, explained rather than chosen, because this tool cannot
// tell a fix from a feature in somebody else's checkout. UNKNOWN stays UNKNOWN: a revision nobody
// established does not become evidence of sameness.
//
// AND NOT EVERY OWNED FILE IS BOOTSTRAP'S TO JUDGE. `status-ownership.mjs` holds contract H3: the
// project's own record (`vault/state/**`, `vault/verification.json`) EVOLVES by design, so it is
// reported as evolved and never counted into a verdict; and a target an uninstall already left is
// `uninstalled-with-residue`, not a damaged install.
import { blockOf } from './install-manifest-parts.mjs';
import { extrasOf, filesOf, residueVerdict } from './status-ownership.mjs';

/** @typedef {{ component: string, sha256: string | null }} BlockRef */
/** @typedef {{ path: string, mode: string, created: boolean, sha256Before: string | null,
 *   sha256After: string, block: BlockRef | null }} Entry */
/** @typedef {'healthy'|'missing'|'modified'|'referenced'} FileState */
/** @typedef {'intact'|'modified'|'missing'|'unknown'} BlockState */
/** @typedef {{ entry: Entry, state: FileState, block: BlockState | null,
 *   sha256: string | null }} FileFact */
/** @typedef {{ name: string, version: string, revision: string | null }} Identity */
/** What an uninstall left behind, as its own report describes it: the report's path, the instant it
 * was written, and the paths it says it KEPT.
 * @typedef {{ report: string, at: string, kept: ReadonlyArray<string> }} Residue */
/** @typedef {{ installed: boolean, source: Identity | null, sourceNow: Identity | null,
 *   profile: string, installedAt: string, components: ReadonlyArray<string>,
 *   files: ReadonlyArray<FileFact>, extras: ReadonlyArray<string>, residue: Residue | null,
 *   integrations: ReadonlyArray<{ kind: string, status: string,
 *   detail: string }>, hooksPath: string | null, hooksDir: string }} StatusFacts */

/** How many paths a status report prints per category before it counts the rest. */
export const PATH_CAP = 8;

/** PURE and TOTAL. The manifest's `files` as normalized entries. Anything that is not a record is
 * dropped: the manifest was validated before this ran, so a survivor here would be a bug, and
 * dropping is the fail-closed direction (an entry nobody can read owns nothing).
 * @param {unknown} manifest @returns {ReadonlyArray<Entry>} */
export function entriesOf(manifest) {
  const files = /** @type {{ files?: unknown }} */ (manifest ?? {}).files;
  if (!Array.isArray(files)) return Object.freeze([]);
  /** @type {Entry[]} */
  const out = [];
  for (const file of files) {
    if (typeof file !== 'object' || file === null) continue;
    const record = /** @type {Record<string, unknown>} */ (file);
    out.push({
      path: String(record.path), mode: String(record.mode), created: record.created === true,
      sha256Before: typeof record.sha256Before === 'string' ? record.sha256Before : null,
      sha256After: String(record.sha256After),
      block: 'block' in record ? blockOf(record.block) : null,
    });
  }
  return Object.freeze(out);
}

/** PURE. Every ancestor directory of a target-relative path, deepest first, root excluded.
 * @param {string} rel @returns {ReadonlyArray<string>} */
export function ancestorsOf(rel) {
  const parts = rel.split('/').slice(0, -1);
  /** @type {string[]} */
  const out = [];
  for (let i = parts.length; i > 0; i -= 1) out.push(parts.slice(0, i).join('/'));
  return Object.freeze(out);
}

/**
 * PURE. The directories the install CREATED, deepest first: every ancestor of a created file,
 * minus every ancestor of a file that already existed. A directory holding a pre-existing file was
 * there before Bootstrap, so it is never one Bootstrap may remove or call its own.
 * @param {ReadonlyArray<Entry>} entries @returns {ReadonlyArray<string>}
 */
export function createdDirsOf(entries) {
  /** @type {Set<string>} */
  const preexisting = new Set();
  for (const entry of entries.filter((item) => !item.created)) {
    for (const dir of ancestorsOf(entry.path)) preexisting.add(dir);
  }
  /** @type {Set<string>} */
  const created = new Set();
  for (const entry of entries.filter((item) => item.created)) {
    for (const dir of ancestorsOf(entry.path)) if (!preexisting.has(dir)) created.add(dir);
  }
  return Object.freeze([...created].sort((a, b) => b.split('/').length - a.split('/').length
    || (a < b ? 1 : -1)));
}

/** PURE and TOTAL. Compares two dotted versions numerically, segment by segment; a segment that is
 * not a number compares as text. @param {string} a @param {string} b @returns {number} */
export function compareVersions(a, b) {
  const left = String(a).split('.');
  const right = String(b).split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const x = left[i] ?? '0';
    const y = right[i] ?? '0';
    const nx = Number(x);
    const ny = Number(y);
    if (Number.isInteger(nx) && Number.isInteger(ny)) {
      if (nx !== ny) return nx < ny ? -1 : 1;
    } else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** @typedef {{ files: number, healthy: number, missing: number, modified: number, evolved: number,
 *   extra: number, intact: number, blocksModified: number, blocksMissing: number,
 *   blocksUnknown: number }} Counts */

/** PURE. The counts a report prints and a classification is made of. `missing`, `modified` and
 * `extra` count IMMUTABLE paths only; everything the project's own record did — a rewritten
 * `CURRENT-CELL.md`, an approved check, a new cell file — lands in `evolved`, which no verdict
 * reads (contract H3). @param {StatusFacts} facts @returns {Counts} */
export function countsOf(facts) {
  const immutable = filesOf(facts, 'immutable');
  const evolving = filesOf(facts, 'evolving');
  const state = (/** @type {ReadonlyArray<FileFact>} */ list, /** @type {FileState} */ name) =>
    list.filter((f) => f.state === name).length;
  const block = (/** @type {BlockState} */ name) => facts.files.filter((f) => f.block === name).length;
  return {
    files: facts.files.length,
    healthy: state(facts.files, 'healthy') + state(facts.files, 'referenced'),
    missing: state(immutable, 'missing'),
    modified: state(immutable, 'modified'),
    evolved: state(evolving, 'missing') + state(evolving, 'modified')
      + extrasOf(facts, 'evolving').length,
    extra: extrasOf(facts, 'immutable').length,
    intact: block('intact'),
    blocksModified: block('modified'),
    blocksMissing: block('missing'),
    blocksUnknown: block('unknown'),
  };
}

/** @typedef {{ classification: string, action: string, why: string, counts: Counts,
 *   code: number }} Verdict */

/**
 * PURE. The verdict: classification, next action, the reason for it, and the exit status. A missing
 * created IMMUTABLE file is `partial`; anything else Bootstrap owns having changed is `drift`; a
 * target an uninstall already left is neither, and is answered before anything else.
 * @param {StatusFacts} facts @returns {Verdict}
 */
export function classify(facts) {
  const counts = countsOf(facts);
  const residue = residueVerdict(facts, counts);
  if (residue !== null) return residue;
  const changed = counts.modified + counts.blocksModified + counts.blocksMissing;
  const classification = counts.missing > 0 ? 'partial' : changed > 0 ? 'drift' : 'healthy';
  const installed = facts.source;
  const now = facts.sourceNow;
  const cmp = installed === null || now === null ? 0 : compareVersions(installed.version, now.version);
  /** @type {{ action: string, why: string }} */
  let next = { action: 'none', why: 'this install matches its record, and the source here matches the one it came from.' };
  if (cmp < 0) {
    next = { action: 'upgrade', why: `the source here is ${now?.version} and ${installed?.version} was installed: re-reading the plan with the newer source is an UPGRADE, not a repair.` };
  } else if (cmp === 0 && installed?.revision !== null && now?.revision != null && installed?.revision !== now?.revision) {
    next = { action: 'repair-or-upgrade', why: `same version (${installed?.version}), different commit: this tool cannot tell a fix from a feature in another checkout, so the choice is yours — repair restores what was installed, upgrade re-installs from this source.` };
  } else if (classification !== 'healthy') {
    next = { action: 'repair', why: `${classification}: the source here is the version that was installed, so what is missing or changed can be restored.` };
  } else if (cmp > 0) {
    next = { action: 'none', why: `the source here (${now?.version}) is OLDER than the installed ${installed?.version}: nothing to do from this checkout.` };
  }
  return { classification, ...next, counts, code: classification === 'healthy' ? 0 : 2 };
}
