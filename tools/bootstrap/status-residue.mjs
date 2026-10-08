// status-residue.mjs — "did an uninstall already finish here?", answered from the uninstall's own
// report. READ-ONLY by construction: the only `node:fs` call reachable from here is the confined
// `readIfPresent` of `writer-base.mjs`.
//
// NO NEW STATE IS INVENTED FOR THIS. `uninstall` already writes
// `vault/bootstrap/uninstall-report*.json` exactly when it keeps something, and the `kept` list in
// it is the authoritative description of what remains. Reading that is what lets `status` tell a
// deliberate removal from a damaged install without Bootstrap adding a marker nobody asked for,
// and without the install record ever being rewritten.
//
// AN UNREADABLE REPORT ESTABLISHES NOTHING. A file that does not parse, does not carry the schema,
// or does not carry an instant is IGNORED, and the target is then classified by the ordinary rules.
// That is fail-closed: a report is allowed to excuse residue, never to hide damage.
import { MAX_REPORTS, reportPathAt } from './plan-constants.mjs';
import { readIfPresent } from './writer.mjs';

/** @typedef {import('./status.mjs').Residue} Residue */

/** The schema `uninstall.mjs` writes. A document without it is not an uninstall report. */
export const REPORT_SCHEMA = 'cellular-mode/uninstall-report';

/** PURE and TOTAL. One report's text as a residue record, or `null` when it establishes nothing.
 * @param {string | null} text @param {string} rel @returns {Residue | null} */
export function residueIn(text, rel) {
  if (text === null) return null;
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (record.schema !== REPORT_SCHEMA) return null;
  if (typeof record.at !== 'string' || record.at === '') return null;
  /** @type {string[]} */
  const kept = [];
  if (Array.isArray(record.kept)) {
    for (const entry of record.kept) {
      const path = /** @type {{ path?: unknown }} */ (entry ?? {}).path;
      if (typeof path === 'string') kept.push(path);
    }
  }
  return { report: rel, at: record.at, kept: Object.freeze(kept.sort()) };
}

/** The LATEST readable uninstall report in the target, or `null` when there is none. Every slot is
 * tried rather than stopping at the first gap: a human may have deleted one report and kept
 * another, and the newest one is the authoritative description of what remains.
 * @param {string} targetRoot @returns {Residue | null} */
export function readResidue(targetRoot) {
  /** @type {Residue | null} */
  let latest = null;
  for (let i = 1; i <= MAX_REPORTS; i += 1) {
    const rel = reportPathAt(i);
    const found = residueIn(readIfPresent(targetRoot, rel), rel);
    if (found !== null && (latest === null || found.at >= latest.at)) latest = found;
  }
  return latest;
}
