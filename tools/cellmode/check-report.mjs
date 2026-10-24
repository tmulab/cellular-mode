// check-report.mjs — the REPORT rule of the integrity guard: one finding, `map-stale`.
// PURE: it is handed the text of `vault/state/map.svg` and the text of the sources, and
// answers with findings. The reads are `state.mjs`'s and the composition is
// `check-layer.mjs`'s, exactly as for the operation rules.
//
// The rule is narrow on purpose. A generated map is useful only while it still describes
// the vault, and the failure it replaces — a hand-written panel that went stale while the
// log moved on — is invisible by nature: the file looks fine. So the map carries the
// fingerprint of the bytes it was generated from, and this rule compares it with the bytes
// that are there now. NO map file is NOT a finding: a project that never generates one is
// not in breach of anything, and `check` must print the bytes it always printed for it.
import { sourceFingerprint } from './report-model.mjs';
import { embeddedFingerprint } from './report-svg.mjs';

/** @typedef {import('./types.mjs').Finding} Finding */

export const REPORT_CODES = {
  MAP_STALE: 'map-stale',
};

/** A fingerprint in a message is cut to its first 12 hex characters: enough to tell two
 * apart, and the whole value is in the file. @type {(hex: string) => string} */
const short = (hex) => (hex === '' ? 'no fingerprint' : hex.slice(0, 12));

/**
 * PURE. `map-stale` when a map exists and was generated from other bytes than the ones in
 * the vault now — including a map with no fingerprint at all, which is a map nothing can
 * vouch for.
 * @param {{ mapText?: string, logText?: string, indexText?: string,
 *   operationTexts?: ReadonlyArray<{ slug: string, text: string }> }} [input]
 * @returns {Finding[]}
 */
export function checkReport({
  mapText = '', logText = '', indexText = '', operationTexts = [],
} = {}) {
  const text = String(mapText ?? '');
  if (text.trim() === '') return [];
  const source = sourceFingerprint({ logText, indexText, operationTexts });
  const embedded = embeddedFingerprint(text);
  if (embedded === source) return [];
  return [{
    code: REPORT_CODES.MAP_STALE,
    message: `map stale: vault/state/map.svg carries source ${short(embedded)} but log.md, `
      + `INDEX.md and operations/ now hash to ${short(source)} — regenerate it with `
      + '`cellmode report`',
  }];
}
