#!/usr/bin/env node
// ci-trailer.mjs — does each pushed commit's `Verified-State:` trailer refer to the tree
// that commit actually records?
//
// WHAT IT PROVES, EXACTLY: that the local claim was about THIS state — nothing more. The
// trailer is NOT evidence that any test passed; `.cellular/` evidence is local, per machine
// and never committed (./FINAL-VERIFICATION.md, limitation 4). What proves the checks pass
// is CI's OWN re-run in the same workflow. This check closes the other half: that the
// commit being re-run is the commit the local run was talking about.
//
// PRE-ARTICLE-8 POLICY: the trailer arrived in commit b92c7c8, so its ancestors have none
// and never could have. They are reported as PRE_ARTICLE_8, never failed, and never given
// a trailer after the fact. FAIL CLOSED: a checkout that cannot resolve the boundary
// excuses nothing. Rationale and limits: ./CI.md.
//
// Split like every gate here: a PURE core (readTrailer, classify, summarize, parseArgs)
// tested on strings, a thin git shell tested in throwaway repositories, and the reporting
// in ./ci-summary.mjs — deciding a verdict and phrasing it are two reviews.
import { commitRows } from './commit-range.mjs';
import { gitRun } from './fingerprint.mjs';
import { ciState, informational, readCounts, writeJobSummary } from './ci-summary.mjs';

/** The FIRST commit that carries a `Verified-State` trailer; its ancestors (it excluded)
 * are the PRE_ARTICLE_8 set. A constant: the boundary is a historical fact about this
 * repository, not a runtime option. `--boundary` exists for the tests. */
export const ARTICLE_8_BOUNDARY = 'b92c7c84ff706ce5dc420a3ccdd5c8ce4816c278';

/** @typedef {{ status: 'OK', fingerprint: string, tree: string } | { status: 'MISSING' }
 *   | { status: 'MALFORMED' | 'MULTIPLE', detail: string }} Trailer */
/** @typedef {'MATCH' | 'MISMATCH' | 'MISSING' | 'MALFORMED' | 'MULTIPLE' | 'PRE_ARTICLE_8'} Verdict */
/** @typedef {{ commit: string, subject: string, verdict: Verdict, detail: string,
 *   tree?: string, trailerTree?: string, trailerFingerprint?: string }} Row */

/** The verdicts that make this check exit non-zero: a closed list, so a new verdict has to
 * be classified deliberately. @type {ReadonlyArray<Verdict>} */
export const FAILING_VERDICTS = Object.freeze(/** @type {Verdict[]} */ (['MISMATCH', 'MISSING', 'MALFORMED', 'MULTIPLE']));

const EXACT = /^Verified-State: sha256:([0-9a-f]{64}) tree:([0-9a-f]{40})$/;

/** PURE. A verdict this build does not know is a FAILURE, never a pass.
 * @param {Verdict} verdict @returns {boolean} */
export function fails(verdict) {
  return verdict !== 'MATCH' && verdict !== 'PRE_ARTICLE_8';
}

/** PURE. What a commit message says about the state it was verified against. One trailer or
 * none: a doubled trailer is refused because a reader cannot tell a copy from a tamper.
 * @param {unknown} message @returns {Trailer} */
export function readTrailer(message) {
  const lines = String(message ?? '').replace(/\r/g, '').split('\n')
    .map((line) => line.trimEnd()).filter((line) => line.startsWith('Verified-State:'));
  if (lines.length === 0) return { status: 'MISSING' };
  if (lines.length > 1) {
    return { status: 'MULTIPLE', detail: `${lines.length} Verified-State trailers on one commit` };
  }
  const match = EXACT.exec(lines[0] ?? '');
  return match === null
    ? { status: 'MALFORMED', detail: `not "Verified-State: sha256:<64hex> tree:<40hex>": ${lines[0] ?? ''}` }
    : { status: 'OK', fingerprint: match[1] ?? '', tree: match[2] ?? '' };
}

/** PURE. The verdict for ONE commit. The binding comparison is the git tree id: it is what
 * the commit records, and git computes it identically everywhere.
 * @param {{ trailer: Trailer, tree: string, preArticle8: boolean }} input
 * @returns {{ verdict: Verdict, detail: string }} */
export function classify({ trailer, tree, preArticle8 }) {
  if (trailer.status === 'MISSING') {
    return preArticle8
      ? {
        verdict: 'PRE_ARTICLE_8',
        detail: 'an ancestor of the commit that introduced Article 8: no trailer existed yet, and none may be invented now',
      }
      : { verdict: 'MISSING', detail: 'no Verified-State trailer on a commit made after Article 8' };
  }
  if (trailer.status !== 'OK') return { verdict: trailer.status, detail: trailer.detail };
  if (tree !== '' && trailer.tree === tree) {
    return { verdict: 'MATCH', detail: `the trailer names this commit's tree ${tree}` };
  }
  return {
    verdict: 'MISMATCH',
    detail: `the trailer names tree:${trailer.tree} but the commit records tree:${tree === '' ? '(unreadable)' : tree}`,
  };
}

/** PURE. The verdict over a whole range. An EMPTY range is not a pass: a check that
 * examined nothing has established nothing.
 * @param {ReadonlyArray<Row>} rows @returns {{ total: number, counts: Record<string, number>,
 *   failed: number, ok: boolean, reason: string }} */
export function summarize(rows) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const row of rows) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;
  const failed = rows.filter((row) => fails(row.verdict)).length;
  const parts = Object.keys(counts).sort().map((key) => `${counts[key]} ${key}`);
  return rows.length === 0
    ? { total: 0, counts, failed: 0, ok: false, reason: 'no commit was examined — an empty range is never a pass' }
    : { total: rows.length, counts, failed, ok: failed === 0, reason: `${rows.length} commit(s): ${parts.join(', ')}` };
}

/** PURE. The command line: `[rev-range]`, `--all`, `--boundary <rev>`, `--counts <file>`.
 * One loop, so a flag VALUE can never be mistaken for the rev-range.
 * @param {ReadonlyArray<string>} argv @returns {{ positional: string[],
 *   boundary: string | null, counts: string | null, all: boolean }} */
export function parseArgs(argv) {
  /** @type {string[]} */
  const positional = [];
  /** @type {Record<string, string>} */
  const flags = {};
  let all = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '--all') all = true;
    else if (arg === '--boundary' || arg === '--counts') {
      flags[arg] = argv[i + 1] ?? '';
      i += 1;
    } else if (!arg.startsWith('-')) positional.push(arg);
  }
  return { positional, boundary: flags['--boundary'] ?? null, counts: flags['--counts'] ?? null, all };
}

/** A revision as a full object name, or `null` when this checkout does not have it.
 * @param {string} root @param {string} rev @returns {string | null} */
export function resolveCommit(root, rev) {
  const result = gitRun(root, ['rev-parse', '--verify', `${rev}^{commit}`]);
  const sha = result.stdout.trim();
  return result.status === 0 && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

/** Every commit in `revs`, with its verdict.
 * @param {string} root @param {ReadonlyArray<string>} revs
 * @param {{ boundary?: string }} [options] @returns {Row[]} */
export function checkRange(root, revs, options = {}) {
  const boundary = resolveCommit(root, options.boundary ?? ARTICLE_8_BOUNDARY);
  return commitRows(root, revs).map((row) => {
    const message = gitRun(root, ['log', '-1', '--format=%B', row.commit]);
    const trailer = readTrailer(message.status === 0 ? message.stdout : '');
    const pre = boundary !== null && row.commit !== boundary
      && gitRun(root, ['merge-base', '--is-ancestor', row.commit, boundary]).status === 0;
    const { verdict, detail } = classify({ trailer, tree: row.tree, preArticle8: pre });
    return {
      ...row, verdict, detail,
      trailerTree: trailer.status === 'OK' ? trailer.tree : '',
      trailerFingerprint: trailer.status === 'OK' ? trailer.fingerprint : '',
    };
  });
}

/** WHICH commits to examine: a push checks its HEAD, a pull request every commit the branch
 * adds. The base arrives as a ref NAME in `GITHUB_BASE_REF`, so it is validated as one —
 * anything that could be an option or a range is refused and the check falls back to HEAD
 * rather than running a command assembled from input.
 * @param {string} root @param {ReadonlyArray<string>} argv
 * @param {Record<string, string | undefined>} env @returns {{ revs: string[], scope: string }} */
export function resolveRevs(root, argv, env) {
  const positional = argv.filter((arg) => !arg.startsWith('-'));
  if (positional.length > 0) return { revs: [...positional], scope: positional.join(' ') };
  if (argv.includes('--all')) return { revs: ['HEAD'], scope: 'the full history of HEAD' };
  const base = env['GITHUB_BASE_REF'] ?? '';
  const named = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(base) && !base.includes('..');
  if (env['GITHUB_EVENT_NAME'] === 'pull_request' && named) {
    const ref = `origin/${base}`;
    return resolveCommit(root, ref) !== null
      ? { revs: [`${ref}..HEAD`], scope: `the commits this pull request adds to ${base}` }
      : { revs: ['--max-count=1', 'HEAD'], scope: `HEAD (${ref} could not be resolved in this checkout)` };
  }
  return { revs: ['--max-count=1', 'HEAD'], scope: 'HEAD' };
}

/** @param {string[]} [argv] @param {Record<string, string | undefined>} [env] @returns {number} */
function main(argv = process.argv.slice(2), env = process.env) {
  const root = process.cwd();
  /** @type {(line: string) => void} */
  const write = (line) => {
    process.stdout.write(`${line}\n`);
  };
  const args = parseArgs(argv);
  const boundary = args.boundary ?? ARTICLE_8_BOUNDARY;
  const { revs, scope } = resolveRevs(root, [...args.positional, ...(args.all ? ['--all'] : [])], env);
  const counts = args.counts === null ? null : readCounts(args.counts);
  const rows = checkRange(root, revs, { boundary });
  const result = summarize(rows);
  const state = ciState(root);
  write(`trailer check · scope: ${scope} · boundary ${boundary.slice(0, 12)}`);
  for (const row of rows) {
    write(`${fails(row.verdict) ? '❌' : '✅'} ${row.verdict} ${row.commit.slice(0, 12)} ${row.subject}`);
    write(`      ${row.detail}`);
  }
  for (const line of informational(rows, state, counts)) write(line);
  write(`${result.ok ? '✅' : '❌'} ${result.reason}`);
  const sha = env['GITHUB_SHA'] ?? '';
  if (writeJobSummary(env['GITHUB_STEP_SUMMARY'], { rows, result, state, counts, sha }) === false) {
    write('ℹ the job summary could not be written');
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith('ci-trailer.mjs')) {
  process.exitCode = main();
}
