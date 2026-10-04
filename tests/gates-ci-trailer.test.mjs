// The PURE half of the CI trailer check: what a `Verified-State:` trailer says, and what
// each possible answer MEANS. No repository, no git, no network.
//
// The claim being tested is narrow on purpose. A trailer proves that a local run of
// `npm run verify:final` was about THIS EXACT TREE. It does not prove the suite passed —
// only CI's own re-run can say that. So the verdicts here are about agreement between two
// recorded values, and the one thing they may never do is invent a pass: a missing,
// malformed or doubled trailer fails, and a commit from before Article 8 existed is
// reported as PRE_ARTICLE_8 rather than quietly counted as green.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTICLE_8_BOUNDARY, FAILING_VERDICTS, classify, fails, readTrailer, summarize,
} from '../tools/gates/ci-trailer.mjs';
import {
  informational, readCounts, summaryMarkdown, writeJobSummary,
} from '../tools/gates/ci-summary.mjs';

const FP = 'a'.repeat(64);
const TREE = 'b'.repeat(40);
const OTHER = 'c'.repeat(40);
/** @type {(trailer: string) => string} */
const body = (trailer) => `Subject line\n\nA paragraph.\n\n${trailer}\n`;

test('trailer · the boundary is the first commit that carried a trailer', () => {
  assert.match(ARTICLE_8_BOUNDARY, /^[0-9a-f]{40}$/);
  assert.equal(ARTICLE_8_BOUNDARY, 'b92c7c84ff706ce5dc420a3ccdd5c8ce4816c278');
});

test('trailer · a well-formed trailer yields its fingerprint and tree', () => {
  const read = readTrailer(body(`Verified-State: sha256:${FP} tree:${TREE}`));
  assert.deepEqual(read, { status: 'OK', fingerprint: FP, tree: TREE });
});

test('trailer · trailing whitespace and CRLF do not change the answer', () => {
  const text = `Subject\r\n\r\nVerified-State: sha256:${FP} tree:${TREE}   \r\n`;
  assert.deepEqual(readTrailer(text), { status: 'OK', fingerprint: FP, tree: TREE });
});

test('trailer · no trailer at all is MISSING, which is a policy question, not a parse error', () => {
  assert.equal(readTrailer('Subject\n\nNo trailer here.\n').status, 'MISSING');
  assert.equal(readTrailer('').status, 'MISSING');
  assert.equal(readTrailer(undefined).status, 'MISSING');
});

test('trailer · a malformed trailer is MALFORMED, never ignored', () => {
  for (const bad of [
    'Verified-State: sha256:tree:' + TREE,
    `Verified-State: sha256:${FP}`,
    `Verified-State: tree:${TREE}`,
    `Verified-State: sha256:${'a'.repeat(63)} tree:${TREE}`,
    `Verified-State: sha256:${FP} tree:${'b'.repeat(39)}`,
    `Verified-State: sha256:${FP.toUpperCase()} tree:${TREE}`,
    `Verified-State: md5:${FP} tree:${TREE}`,
    `Verified-State: sha256:${FP} tree:${TREE} extra`,
  ]) {
    const read = readTrailer(body(bad));
    assert.equal(read.status, 'MALFORMED', `should be malformed: ${bad}`);
  }
});

test('trailer · two trailers are MULTIPLE: a commit has one verified state or none', () => {
  const read = readTrailer(`Subject\n\nVerified-State: sha256:${FP} tree:${TREE}\n`
    + `Verified-State: sha256:${FP} tree:${OTHER}\n`);
  assert.equal(read.status, 'MULTIPLE');
  // Identical duplicates are refused too: a reader cannot tell a copy from a tamper.
  const twice = readTrailer(`S\n\nVerified-State: sha256:${FP} tree:${TREE}\n`
    + `Verified-State: sha256:${FP} tree:${TREE}\n`);
  assert.equal(twice.status, 'MULTIPLE');
});

test('verdict · the trailer tree equals the commit tree: MATCH', () => {
  const row = classify({ trailer: readTrailer(body(`Verified-State: sha256:${FP} tree:${TREE}`)), tree: TREE, preArticle8: false });
  assert.equal(row.verdict, 'MATCH');
  assert.equal(fails(row.verdict), false);
});

test('verdict · a trailer about another tree is MISMATCH, and both trees are named', () => {
  const row = classify({ trailer: readTrailer(body(`Verified-State: sha256:${FP} tree:${OTHER}`)), tree: TREE, preArticle8: false });
  assert.equal(row.verdict, 'MISMATCH');
  assert.ok(row.detail.includes(OTHER) && row.detail.includes(TREE), row.detail);
  assert.equal(fails('MISMATCH'), true);
});

test('verdict · an unreadable commit tree is never a MATCH', () => {
  const trailer = readTrailer(body(`Verified-State: sha256:${FP} tree:${TREE}`));
  const row = classify({ trailer, tree: '', preArticle8: false });
  assert.equal(row.verdict, 'MISMATCH');
});

test('verdict · a missing trailer fails AFTER the boundary and is reported before it', () => {
  const after = classify({ trailer: { status: 'MISSING' }, tree: TREE, preArticle8: false });
  assert.equal(after.verdict, 'MISSING');
  assert.equal(fails('MISSING'), true);
  const before = classify({ trailer: { status: 'MISSING' }, tree: TREE, preArticle8: true });
  assert.equal(before.verdict, 'PRE_ARTICLE_8');
  assert.equal(fails('PRE_ARTICLE_8'), false);
  assert.match(before.detail, /Article 8/);
});

test('verdict · being pre-Article-8 excuses an ABSENT trailer, never a broken one', () => {
  for (const status of ['MALFORMED', 'MULTIPLE']) {
    const row = classify({
      trailer: /** @type {{ status: 'MALFORMED' | 'MULTIPLE', detail: string }} */ ({ status, detail: 'why' }),
      tree: TREE,
      preArticle8: true,
    });
    assert.equal(row.verdict, status, 'an age cannot repair a trailer that is wrong');
    assert.equal(fails(row.verdict), true);
  }
  // A pre-boundary commit that DOES carry a good trailer is still checked, not waved through.
  const checked = classify({ trailer: readTrailer(body(`Verified-State: sha256:${FP} tree:${OTHER}`)), tree: TREE, preArticle8: true });
  assert.equal(checked.verdict, 'MISMATCH');
});

test('verdict · the failing set is closed and explicit', () => {
  assert.deepEqual([...FAILING_VERDICTS].sort(), ['MALFORMED', 'MISMATCH', 'MISSING', 'MULTIPLE']);
  assert.equal(fails('MATCH'), false);
  assert.equal(fails('PRE_ARTICLE_8'), false);
  // Fail closed: a verdict this build does not know is a failure, not a pass.
  assert.equal(fails(/** @type {never} */ ('SOMETHING_NEW')), true);
});

test('summary · counts every verdict and fails on any failing one', () => {
  const rows = [
    { commit: '1'.repeat(40), subject: 'a', verdict: /** @type {const} */ ('MATCH'), detail: '' },
    { commit: '2'.repeat(40), subject: 'b', verdict: /** @type {const} */ ('PRE_ARTICLE_8'), detail: '' },
    { commit: '3'.repeat(40), subject: 'c', verdict: /** @type {const} */ ('PRE_ARTICLE_8'), detail: '' },
  ];
  const clean = summarize(rows);
  assert.equal(clean.ok, true);
  assert.equal(clean.total, 3);
  assert.equal(clean.counts['MATCH'], 1);
  assert.equal(clean.counts['PRE_ARTICLE_8'], 2);
  assert.equal(clean.failed, 0);
  const dirty = summarize([...rows,
    { commit: '4'.repeat(40), subject: 'd', verdict: /** @type {const} */ ('MISSING'), detail: '' }]);
  assert.equal(dirty.ok, false);
  assert.equal(dirty.failed, 1);
});

test('summary · an EMPTY range is not a pass', () => {
  const empty = summarize([]);
  assert.equal(empty.ok, false);
  assert.equal(empty.total, 0);
  assert.match(empty.reason, /no commit/i);
});

// ---- the reporting half (tools/gates/ci-summary.mjs) -----------------------------------

const ROW = {
  commit: '1'.repeat(40), subject: 's', verdict: /** @type {const} */ ('MATCH'),
  detail: 'd', trailerFingerprint: FP,
};

test('summary · the fingerprint comparison is INFORMATIONAL and says why', () => {
  const same = informational([ROW], { fingerprint: FP, tree: TREE }, null);
  assert.ok(same.some((line) => line.includes('equals the CI-computed one')), same.join('\n'));
  const differs = informational([ROW], { fingerprint: 'f'.repeat(64), tree: TREE }, null);
  const text = differs.join('\n');
  assert.match(text, /DIFFERS/);
  assert.match(text, /line endings/, 'a reader must learn why a difference is expected');
  assert.match(text, /tree id is the binding check/);
});

test('summary · an unreadable state is UNKNOWN, never a match', () => {
  assert.deepEqual(informational([ROW], null, null), []);
  const md = summaryMarkdown({
    rows: [ROW], result: { total: 1, failed: 0, ok: true, reason: '1 commit(s): 1 MATCH' },
    state: null, counts: null, sha: '',
  }).join('\n');
  assert.match(md, /sha256:UNKNOWN/);
  assert.match(md, /counts UNKNOWN/);
});

test('summary · the job summary carries the commit, the counts and the verdict', () => {
  const md = summaryMarkdown({
    rows: [ROW], result: { total: 1, failed: 0, ok: true, reason: '1 commit(s): 1 MATCH' },
    state: { fingerprint: FP, tree: TREE },
    counts: { tests: 9, pass: 8, fail: 0, skipped: 1, cancelled: 0, todo: 0 },
    sha: '2'.repeat(40),
  }).join('\n');
  assert.match(md, new RegExp(`commit: \`${'2'.repeat(40)}\``));
  assert.match(md, /9 tests · 8 pass · 0 fail · 1 skipped · 0 cancelled · 0 todo/);
  assert.match(md, /trailer verdict: ✅/);
  assert.match(md, /no `\.cellular\/`\nevidence is read here/, 'CI must not claim local evidence as proof');
});

test('summary · nothing is written when the job-summary path is absent', () => {
  const input = {
    rows: [ROW], result: { total: 1, failed: 0, ok: true, reason: 'x' },
    state: null, counts: null, sha: '',
  };
  assert.equal(writeJobSummary(undefined, input), null);
  assert.equal(writeJobSummary('', input), null);
});

test('summary · a counts file that does not exist reads as null, not as zero', () => {
  assert.equal(readCounts('no-such-test-log-f3a1.txt'), null);
});
