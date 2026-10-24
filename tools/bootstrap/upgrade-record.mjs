// upgrade-record.mjs — the install manifest AFTER an upgrade. PURE: no filesystem, no clock, no
// process; the instant and the source identity come in as parameters, so the same upgrade
// described twice produces the same bytes twice.
//
// AN UPGRADE IS THE ONE OPERATION THAT REWRITES THE RECORD, and it rewrites it by AMENDING, never
// by rebuilding. `buildInstallManifest` describes a fresh install from a plan; there is no plan
// here, only a record and a set of writes that happened, so every key this upgrade did not touch
// is carried over byte-for-byte — the approvals of the original install, the host facts nobody
// re-detected, the limitations, the integrations, the entries of files this verb never goes near.
// Rebuilding instead would quietly re-assert facts nobody established today, which is exactly the
// kind of claim this project forbids.
//
// WHAT CHANGES, AND NOTHING ELSE: the source's version and revision (this is where the target now
// came from), `installedAt` (the instant of this upgrade — the schema is CLOSED, so there is no
// second timestamp field to invent), the recorded component versions of the components already
// recorded, the digest of every file replaced or added, a file entry for every path added, and ONE
// appended approval naming the confirmation that allowed it. The result goes through
// `assertInstallManifest` in the caller: a record this module could not write back is a refusal,
// never a file on disk.

/** @typedef {import('./status.mjs').Identity} Identity */
/** @typedef {{ path: string, sha256After: string, mode: string }} Written */

/** The action recorded in `approvals` when an upgrade was confirmed. */
export const UPGRADE_APPROVAL = 'upgrade --confirm';

/** PURE. @param {unknown} value @returns {Record<string, unknown>[]} */
const records = (value) => (Array.isArray(value)
  ? value.filter((entry) => typeof entry === 'object' && entry !== null)
    .map((entry) => /** @type {Record<string, unknown>} */ (entry))
  : []);

/**
 * PURE. The amended manifest. `written` names every path this upgrade actually wrote, with the
 * digest it wrote and the mode to record it under (`copy` for a catalog file, `generate` for a
 * skeleton file) — only paths that SUCCEEDED, because a record is evidence and a refused write is
 * not one.
 * @param {{ manifest: Readonly<Record<string, unknown>>, written: ReadonlyArray<Written>,
 *   source: Identity, componentVersions: Readonly<Record<string, string>>, now: string }} input
 * @returns {Record<string, unknown>}
 */
export function upgradedManifest(input) {
  const byPath = new Map(input.written.map((entry) => [entry.path, entry]));
  /** @type {Record<string, unknown>[]} */
  const files = records(input.manifest.files).map((entry) => {
    const written = byPath.get(String(entry.path));
    if (written === undefined) return { ...entry };
    byPath.delete(String(entry.path));
    return { ...entry, sha256After: written.sha256After };
  });
  for (const written of byPath.values()) {
    files.push({
      path: written.path, mode: written.mode, created: true,
      sha256Before: null, sha256After: written.sha256After,
    });
  }
  const components = records(input.manifest.components).map((entry) => ({
    ...entry,
    componentVersion: input.componentVersions[String(entry.id)] ?? String(entry.componentVersion),
  }));
  return {
    ...input.manifest,
    source: { name: input.source.name, version: input.source.version, revision: input.source.revision },
    installedAt: input.now,
    components,
    files: files.sort((a, b) => (String(a.path) < String(b.path) ? -1 : 1)),
    approvals: [...records(input.manifest.approvals).map((entry) => ({ ...entry })),
      { action: UPGRADE_APPROVAL, at: input.now }],
  };
}
