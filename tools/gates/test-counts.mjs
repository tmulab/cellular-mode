// test-counts.mjs — PURE. How many tests actually ran, read from what `node --test` printed.
//
// WHY IT EXISTS: `verify-final` recorded each check as the FIRST line of its output, and
// for the tests check that line is a file name. The record therefore asserted "tests —
// exit 0" with no number behind it, which is the one kind of green a reader cannot audit:
// a suite that ran nothing, or skipped a whole conformance row, produced an identical
// record to a full run. Article 8 asks for real counts (docs/00-constitution.md,
// "Trilateral Verification ... three lines, real counts"), so the counts are DATA here.
//
// A SKIPPED test is VISIBLE, never a failure and never a pass. `skipLines` lists them with
// their reason, because the polyglot conformance rows skip legitimately on a machine
// without a JDK, a Python or a rustc — and a skip nobody can see is the same lie as a
// fabricated pass.
//
// Pure on purpose: the parser is exercised on real captured output in
// tests/gates-test-counts.test.mjs, with no suite to run and no repository to create.

/** @typedef {{ tests: number, pass: number, fail: number, skipped: number }} TestCounts */

/** The four numbers a record keeps. `suites`, `cancelled`, `todo` and `duration_ms` are
 * printed by node too and deliberately left out: they are not the claim being audited.
 * @type {ReadonlyArray<keyof TestCounts>} */
const FIELDS = Object.freeze(['tests', 'pass', 'fail', 'skipped']);

/** The default cap on how many skipped-test lines a record keeps. */
export const SKIP_LIMIT = 20;

/** @type {(value: unknown) => boolean} */
const isCount = (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * PURE. The counts `node --test` reported, or `null` when its summary was not fully
 * present. FAIL CLOSED: a missing or non-numeric field yields `null` rather than a zero,
 * because "0 failures" invented from an absent line is exactly the false green this module
 * was written to remove.
 * @param {unknown} output the combined stdout+stderr of a `node --test` run
 * @returns {TestCounts | null}
 */
export function parseTestCounts(output) {
  const text = String(output ?? '').replace(/\r/g, '');
  /** @type {Record<string, number>} */
  const found = {};
  for (const field of FIELDS) {
    // The summary lines are `ℹ <field> <number>`; the marker is matched loosely so a
    // different reporter prefix (or none) still parses.
    const match = new RegExp(`^\\s*\\S?\\s*${field} (\\d+)\\s*$`, 'm').exec(text);
    if (match === null) return null;
    found[field] = Number(match[1]);
  }
  const counts = {
    tests: found['tests'] ?? -1,
    pass: found['pass'] ?? -1,
    fail: found['fail'] ?? -1,
    skipped: found['skipped'] ?? -1,
  };
  return FIELDS.every((field) => isCount(counts[field])) ? counts : null;
}

/**
 * PURE. Validates a `counts` field read back from a record. Same answer shape as the
 * parser, so a reader of the record and a reader of the output agree on what counts are.
 * Unknown fields are ignored; the four required ones are not negotiable.
 * @param {unknown} value @returns {TestCounts | null}
 */
export function parseCountsValue(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  for (const field of FIELDS) if (!isCount(raw[field])) return null;
  return {
    tests: Number(raw['tests']),
    pass: Number(raw['pass']),
    fail: Number(raw['fail']),
    skipped: Number(raw['skipped']),
  };
}

/**
 * PURE. The skipped tests, as the lines node printed, so the reason survives. The marker
 * is U+FE63 (`﹣`), which is what the default reporter uses for a skipped test; a `# SKIP`
 * suffix from the TAP reporter is accepted too.
 * @param {unknown} output @param {number} [limit] @returns {string[]}
 */
export function skipLines(output, limit = SKIP_LIMIT) {
  /** @type {string[]} */
  const lines = [];
  for (const raw of String(output ?? '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const skipped = /^﹣\s*(.+)$/.exec(line) ?? /^(?:ok\s+\d+\s*-\s*)?(.+ # SKIP.*)$/.exec(line);
    if (skipped === null) continue;
    const name = (skipped[1] ?? '').trim();
    if (name !== '') lines.push(name.length > 140 ? `${name.slice(0, 137)}...` : name);
    if (lines.length >= Math.max(0, limit)) break;
  }
  return lines;
}

/**
 * PURE. Adds the optional measured fields to a check record, and only when they are real.
 * It lives here rather than in ./final-evidence.mjs so that what a `counts` field MEANS is
 * decided in one module: the parser of the output and the parser of the record are the
 * same two functions.
 * @template {object} T
 * @param {T} base @param {{ counts?: unknown, skips?: unknown }} source
 * @returns {T & { counts?: TestCounts, skips?: string[] }}
 */
export function withMeasurements(base, source) {
  const counts = parseCountsValue(source.counts);
  const skips = Array.isArray(source.skips)
    ? source.skips.filter((s) => typeof s === 'string' && s !== '').slice(0, SKIP_LIMIT)
    : [];
  return {
    ...base,
    ...(counts === null ? {} : { counts }),
    ...(skips.length === 0 ? {} : { skips }),
  };
}

/** PURE. One line a human can read, for the CLI and the CI job summary. `null` is reported
 * as UNKNOWN, which is the honest answer when the output did not say.
 * @param {TestCounts | null} counts @returns {string} */
export function countsSummary(counts) {
  if (counts === null) return 'counts UNKNOWN (the output did not report them)';
  return `${counts.tests} tests · ${counts.pass} pass · ${counts.fail} fail · ${counts.skipped} skipped`;
}
