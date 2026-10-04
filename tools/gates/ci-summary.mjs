// ci-summary.mjs — how a CI run REPORTS what it established, to a human reading the job
// page and to a human reading the log.
//
// It is a separate module from ./ci-trailer.mjs for the reason the gates next door are
// split: deciding a verdict and phrasing it are two different reviews. Here the only
// question is wording and shape, so the whole thing is pure except one `appendFileSync`,
// and the wording can be asserted in a test instead of being read off a screenshot.
//
// THE SENTENCE THIS FILE MUST NOT GET WRONG: the fingerprint comparison is INFORMATIONAL.
// A fingerprint hashes file BYTES, so a checkout whose line endings differ (git
// `core.autocrlf` on Windows, a different operating system, a `.gitattributes` change)
// legitimately produces a different fingerprint for the same commit. The git TREE id is
// the binding comparison: it is what the commit records, and git computes it identically
// everywhere. Saying "fingerprint mismatch" as if it were tampering would train a reader
// to ignore the one line that does mean tampering.
import { appendFileSync, readFileSync } from 'node:fs';
import { repoState } from './fingerprint.mjs';
import { countsSummary, parseTestCounts } from './test-counts.mjs';

/** @typedef {import('./ci-trailer.mjs').Row} Row */
/** @typedef {import('./test-counts.mjs').TestCounts} TestCounts */
/** @typedef {{ fingerprint: string, tree: string } | null} CiState */
/** @typedef {{ total: number, failed: number, ok: boolean, reason: string }} Result */

/** The fingerprint and working-tree id of the checkout CI is looking at, or `null` when the
 * state cannot be read (no git, no work tree). `null` is reported as UNKNOWN, never as a
 * match: a gate that cannot run is UNKNOWN, never green.
 * @param {string} root @returns {CiState} */
export function ciState(root) {
  try {
    const state = repoState(root);
    return { fingerprint: state.fingerprint, tree: state.tree };
  } catch {
    return null;
  }
}

/** The counts of a saved `node --test` log. An unreadable file is `null`, which prints as
 * UNKNOWN rather than as zero.
 * @param {string} file @returns {TestCounts | null} */
export function readCounts(file) {
  try {
    return parseTestCounts(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** PURE. The `ℹ` lines the log carries beside the verdicts.
 * @param {ReadonlyArray<Row>} rows @param {CiState} state @param {TestCounts | null} counts
 * @returns {string[]} */
export function informational(rows, state, counts) {
  /** @type {string[]} */
  const lines = [];
  if (state !== null) {
    lines.push(`ℹ CI fingerprint of this checkout: sha256:${state.fingerprint} (tree ${state.tree})`);
    const claimed = rows[0]?.trailerFingerprint ?? '';
    if (claimed !== '') {
      lines.push(claimed === state.fingerprint
        ? 'ℹ the trailer fingerprint equals the CI-computed one'
        : 'ℹ the trailer fingerprint DIFFERS from the CI-computed one — expected when the working '
          + 'tree carries uncommitted work, or across operating systems, since line endings are '
          + 'hashed as bytes; the tree id is the binding check');
    }
  }
  if (counts !== null) lines.push(`ℹ tests re-run by CI: ${countsSummary(counts)}`);
  return lines;
}

/** PURE. The Markdown of the job summary, as lines.
 * @param {{ rows: ReadonlyArray<Row>, result: Result, state: CiState,
 *   counts: TestCounts | null, sha: string }} input @returns {string[]} */
export function summaryMarkdown({ rows, result, state, counts, sha }) {
  const commit = sha === '' ? rows[0]?.commit ?? '(unknown)' : sha;
  return [
    '## Independent verification',
    '',
    `- commit: \`${commit}\``,
    `- CI fingerprint: \`sha256:${state === null ? 'UNKNOWN' : state.fingerprint}\``,
    `- CI working tree: \`${state === null ? 'UNKNOWN' : state.tree}\``,
    `- tests re-run here: ${countsSummary(counts)}`,
    `- trailer verdict: ${result.ok ? '✅' : '❌'} ${result.reason}`,
    '',
    '| commit | verdict | detail |',
    '|---|---|---|',
    ...rows.map((row) => `| \`${row.commit.slice(0, 12)}\` | ${row.verdict} `
      + `| ${row.detail.replace(/\|/g, '\\|')} |`),
    '',
    'The trailer proves only that the local verification run referred to this exact tree.',
    'That the checks PASS is proved by this workflow re-running them: no `.cellular/`',
    'evidence is read here, and none is present in a fresh checkout.',
    '',
  ];
}

/** Appends the summary to GitHub\'s step-summary file. `undefined` or an empty path means
 * "not running in a job", which is not an error; a write that fails answers `false` so the
 * caller can say so instead of crashing a green run.
 * @param {string | undefined} file
 * @param {Parameters<typeof summaryMarkdown>[0]} input @returns {boolean | null} */
export function writeJobSummary(file, input) {
  if (file === undefined || file === '') return null;
  try {
    appendFileSync(file, `${summaryMarkdown(input).join('\n')}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}
