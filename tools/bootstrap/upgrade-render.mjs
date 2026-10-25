// upgrade-render.mjs — the upgrade plan and its outcome, as lines a human reads before and after.
// PURE: it formats, it never decides and it never reads anything.
//
// THE PLAN IS THE DOCUMENT THE `--confirm` APPLIES TO, so it is written to be read in full before
// anything is written: every path that would be REPLACED is named, never only counted, because
// replacing a file somebody installed is the one consequential thing this verb does. The long
// tails — the files already current, the files left alone and why — are grouped and capped, and
// `--verbose` uncaps them, exactly as `status` and `uninstall` do.
//
// EVERY PATH GOES THROUGH `sanitize`. A target-relative path is text from somebody else's
// repository, and a line of it must not be able to forge a line of this report.
import { capList, plural, sanitize } from './display.mjs';
import { INSTALL_MANIFEST } from './plan-constants.mjs';
import { PATH_CAP } from './status.mjs';
import { KEPT_REASON, changeCount } from './upgrade-plan.mjs';

/** @typedef {import('./upgrade-plan.mjs').UpgradePlan} UpgradePlan */
/** @typedef {import('./upgrade-plan.mjs').Change} Change */
/** @typedef {import('./status.mjs').Identity} Identity */
/** @typedef {{ replaced: ReadonlyArray<string>, added: ReadonlyArray<string>,
 *   skeleton: ReadonlyArray<string>, kept: ReadonlyArray<string>,
 *   failed: ReadonlyArray<{ path: string, reason: string }>,
 *   manifest: string }} UpgradeOutcome */

/** PURE. An identity as one line, with UNKNOWN said rather than hidden. @param {Identity | null}
 * identity @returns {string} */
export function identityLine(identity) {
  if (identity === null) return 'UNKNOWN';
  const revision = identity.revision === null ? 'revision UNKNOWN' : `revision ${identity.revision.slice(0, 12)}`;
  return `${sanitize(identity.name, 64)} ${sanitize(identity.version, 32)} (${revision})`;
}

/** PURE. One group of changes, named path by path up to `cap`. @param {ReadonlyArray<Change>}
 * changes @param {string} label @param {number} cap @returns {string[]} */
function group(changes, label, cap) {
  if (changes.length === 0) return [];
  const { shown, hidden } = capList(changes, cap);
  return [`  ${label.padEnd(12)} ${String(changes.length).padStart(3)}`,
    ...shown.map((change) => `      ${sanitize(change.path)}`),
    ...(hidden === 0 ? [] : [`      … and ${hidden} more — re-run with --verbose to list every one`])];
}

/**
 * PURE. The plan, for `--dry-run` and for the refusal that asks for `--confirm`.
 * @param {{ plan: UpgradePlan, name: string, installed: Identity | null, source: Identity | null,
 *   verbose?: boolean | undefined }} input @returns {string[]}
 */
export function upgradeLines(input) {
  const { plan } = input;
  const cap = input.verbose === true ? -1 : PATH_CAP;
  /** @type {string[]} */
  const out = [`Target: ${sanitize(input.name, 64)}`,
    `Installed from: ${identityLine(input.installed)}`,
    `Source here:    ${identityLine(input.source)}`, ''];
  const total = changeCount(plan);
  out.push(total === 0
    ? 'Plan: nothing to write — every immutable file already holds the bytes this source installs.'
    : `Plan — ${plural(total, 'path')} would be written:`);
  out.push(...group(plan.replace, 'replace', -1));
  out.push(...group(plan.add, 'add', -1));
  out.push(...group(plan.skeleton, 'skeleton', -1));
  if (plan.current > 0) out.push(`  ${'current'.padEnd(12)} ${String(plan.current).padStart(3)} (already the bytes this source installs)`);
  out.push(...keptLines(plan));
  out.push(...untouchedLines(plan, cap));
  return out;
}

/** PURE. The files `--keep-modified` leaves exactly as they are: named in full, never capped —
 * this is the list the human is authorising, and the consequence is said in the same breath.
 * @param {UpgradePlan} plan @returns {string[]} */
export function keptLines(plan) {
  if (plan.kept.length === 0) return [];
  return [`  ${'kept'.padEnd(12)} ${String(plan.kept.length).padStart(3)} (${KEPT_REASON})`,
    ...plan.kept.map((entry) => `      ${sanitize(entry.path)}`),
    '      --keep-modified: each of these keeps YOUR bytes, is recorded as this project\'s own'
      + ' (referenced), and receives NO further method update — the newer upstream version of it'
      + ' is NOT installed, now or by a later upgrade.'];
}

/** PURE. The files this verb will not touch, with the reason, grouped by reason. @param
 * {UpgradePlan} plan @param {number} cap @returns {string[]} */
export function untouchedLines(plan, cap) {
  if (plan.untouched.length === 0) return [];
  /** @type {Map<string, string[]>} */
  const byReason = new Map();
  for (const entry of plan.untouched) {
    const list = byReason.get(entry.reason) ?? [];
    list.push(entry.path);
    byReason.set(entry.reason, list);
  }
  /** @type {string[]} */
  const out = [`  ${'left alone'.padEnd(12)} ${String(plan.untouched.length).padStart(3)}`];
  for (const [reason, paths] of [...byReason.entries()].sort()) {
    out.push(`      ${sanitize(reason, 200)} — ${plural(paths.length, 'path')}`);
    const { shown, hidden } = capList(paths, cap);
    for (const path of shown) out.push(`        ${sanitize(path)}`);
    if (hidden > 0) out.push(`        … and ${hidden} more — re-run with --verbose to list every one`);
  }
  return out;
}

/** PURE. The refusal a modified immutable file produces: the WHOLE upgrade, named finding by
 * finding. @param {UpgradePlan} plan @returns {string[]} */
export function findingLines(plan) {
  if (plan.findings.length === 0) return [];
  return ['', `REFUSED — ${plural(plan.findings.length, 'file')} Bootstrap installed was changed here:`,
    ...plan.findings.map((finding) => `  - ${sanitize(finding.why, 400)}`),
    '', 'Nothing was written. An upgrade replaces files it still owns, and it owns none of these any more.'];
}

/** PURE. What actually happened. @param {{ outcome: UpgradeOutcome, name: string,
 *   source: Identity | null }} input @returns {string[]} */
export function outcomeLines(input) {
  const { outcome } = input;
  /** @type {string[]} */
  const out = [`Upgraded ${sanitize(input.name, 64)} to ${identityLine(input.source)}.`, '',
    `Replaced: ${plural(outcome.replaced.length, 'file')}`,
    `Added: ${plural(outcome.added.length, 'file')}`,
    `Skeleton files created: ${outcome.skeleton.length}`,
    `${INSTALL_MANIFEST}: ${sanitize(outcome.manifest, 300)}`];
  if (outcome.kept.length > 0) {
    out.push('', `Kept, untouched, now this project's own (--keep-modified): ${plural(outcome.kept.length, 'file')}`,
      ...outcome.kept.map((path) => `  = ${sanitize(path)}`),
      'They receive no further method update: the newer upstream version is NOT installed.');
  }
  if (outcome.failed.length > 0) {
    out.push('', `${plural(outcome.failed.length, 'step')} was refused and did NOT happen:`);
    for (const entry of outcome.failed) out.push(`  - ${sanitize(entry.path)} — ${sanitize(entry.reason, 300)}`);
  }
  out.push('', 'Next: run `status <dir>` to see the installation as it stands now.');
  return out;
}
