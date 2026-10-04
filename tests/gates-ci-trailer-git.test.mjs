// The GIT half of the CI trailer check, exercised in THROWAWAY repositories under the
// system temporary directory (tests/git-fixture.mjs). This repository's own `.git` is
// never touched, and nothing is pushed anywhere.
//
// Why real repositories: the binding comparison is "the tree named by the trailer" versus
// `git rev-parse <commit>^{tree}`, and the PRE_ARTICLE_8 rule is "is this commit an
// ancestor of the boundary". Both sentences are defined by git. A stubbed git would let
// the test agree with the implementation while both disagreed with the tool that decides.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  REPO_ROOT, cleanup, git, hasGit, makeRepo, run, write,
} from './git-fixture.mjs';
import { checkRange, resolveRevs } from '../tools/gates/ci-trailer.mjs';

const CLI = join(REPO_ROOT, 'tools', 'gates', 'ci-trailer.mjs');
const FP = 'a'.repeat(64);
const skip = hasGit() ? false : 'git is not available on this machine';

/** A commit whose message carries `trailer`, built so the trailer can name the commit's
 * OWN tree: commit first, read the tree, then amend the message. Amending a message never
 * changes the tree, which is the property this helper depends on.
 * @param {string} root @param {string} subject
 * @param {(tree: string) => string} trailerFor @returns {{ commit: string, tree: string }} */
function commitWith(root, subject, trailerFor) {
  write(root, `file-${subject.replace(/\W+/g, '-')}.md`, `# ${subject}\n`);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', subject]);
  const tree = git(root, ['rev-parse', 'HEAD^{tree}']).stdout.trim();
  const trailer = trailerFor(tree);
  if (trailer !== '') git(root, ['commit', '-q', '--amend', '-m', `${subject}\n\n${trailer}`]);
  return { commit: git(root, ['rev-parse', 'HEAD']).stdout.trim(), tree };
}

/** @type {(tree: string) => string} */
const goodTrailer = (tree) => `Verified-State: sha256:${FP} tree:${tree}`;

test('ci-trailer · HEAD whose trailer names its own tree is a MATCH', { skip }, () => {
  const root = makeRepo();
  try {
    const { tree } = commitWith(root, 'verified change', goodTrailer);
    const rows = checkRange(root, ['--max-count=1', 'HEAD'], { boundary: 'HEAD' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.verdict, 'MATCH');
    assert.equal(rows[0]?.trailerTree, tree);
    assert.equal(rows[0]?.tree, tree);
  } finally {
    cleanup(root);
  }
});

test('ci-trailer · a trailer naming another tree is a MISMATCH and fails', { skip }, () => {
  const root = makeRepo();
  try {
    commitWith(root, 'tampered', () => goodTrailer('d'.repeat(40)));
    const rows = checkRange(root, ['--max-count=1', 'HEAD'], { boundary: 'HEAD' });
    assert.equal(rows[0]?.verdict, 'MISMATCH');
    const cli = run(root, process.execPath, [CLI, '--boundary', 'HEAD']);
    assert.equal(cli.status, 1, cli.stdout);
    assert.match(cli.stdout, /MISMATCH/);
  } finally {
    cleanup(root);
  }
});

test('ci-trailer · a commit AFTER the boundary with no trailer is MISSING and fails', { skip }, () => {
  const root = makeRepo();
  try {
    const boundary = commitWith(root, 'the boundary', goodTrailer);
    commitWith(root, 'later and unstamped', () => '');
    const rows = checkRange(root, ['--max-count=1', 'HEAD'], { boundary: boundary.commit });
    assert.equal(rows[0]?.verdict, 'MISSING');
    const cli = run(root, process.execPath, [CLI, '--boundary', boundary.commit]);
    assert.equal(cli.status, 1, cli.stdout);
    assert.match(cli.stdout, /MISSING/);
  } finally {
    cleanup(root);
  }
});

test('ci-trailer · commits BEFORE the boundary are PRE_ARTICLE_8, reported and never failed', { skip }, () => {
  const root = makeRepo();
  try {
    // The seed commit and `older` predate the injected boundary; the boundary itself and
    // everything after it must carry a trailer.
    commitWith(root, 'older', () => '');
    const boundary = commitWith(root, 'the boundary', goodTrailer);
    commitWith(root, 'newer', goodTrailer);
    const rows = checkRange(root, ['HEAD'], { boundary: boundary.commit });
    const byVerdict = rows.map((row) => row.verdict);
    assert.equal(byVerdict.filter((v) => v === 'PRE_ARTICLE_8').length, 2, JSON.stringify(rows));
    assert.equal(byVerdict.filter((v) => v === 'MATCH').length, 2);
    assert.ok(rows.every((row) => row.verdict !== 'MISSING'));
    const cli = run(root, process.execPath, [CLI, '--boundary', boundary.commit, 'HEAD']);
    assert.equal(cli.status, 0, cli.stdout);
    assert.match(cli.stdout, /PRE_ARTICLE_8/);
    assert.match(cli.stdout, /2 PRE_ARTICLE_8|PRE_ARTICLE_8 2/);
  } finally {
    cleanup(root);
  }
});

test('ci-trailer · an UNKNOWN boundary fails closed: nothing is excused', { skip }, () => {
  const root = makeRepo();
  try {
    commitWith(root, 'unstamped', () => '');
    const rows = checkRange(root, ['HEAD'], { boundary: 'e'.repeat(40) });
    assert.ok(rows.length >= 2);
    assert.ok(rows.every((row) => row.verdict === 'MISSING'),
      'a boundary this checkout cannot resolve may not turn MISSING into PRE_ARTICLE_8');
  } finally {
    cleanup(root);
  }
});

test('ci-trailer · a malformed trailer fails even on the boundary commit itself', { skip }, () => {
  const root = makeRepo();
  try {
    const { commit } = commitWith(root, 'broken stamp', () => `Verified-State: sha256:${FP} tree:nope`);
    const rows = checkRange(root, ['--max-count=1', 'HEAD'], { boundary: commit });
    assert.equal(rows[0]?.verdict, 'MALFORMED');
  } finally {
    cleanup(root);
  }
});

test('ci-trailer · two trailers on one commit fail', { skip }, () => {
  const root = makeRepo();
  try {
    const { commit } = commitWith(root, 'doubled',
      (tree) => `${goodTrailer(tree)}\n${goodTrailer(tree)}`);
    const rows = checkRange(root, ['--max-count=1', 'HEAD'], { boundary: commit });
    assert.equal(rows[0]?.verdict, 'MULTIPLE');
  } finally {
    cleanup(root);
  }
});

test('ci-trailer · a pull-request range checks every head commit, not just the tip', { skip }, () => {
  const root = makeRepo();
  try {
    const base = commitWith(root, 'base', goodTrailer);
    git(root, ['checkout', '-q', '-b', 'topic']);
    commitWith(root, 'topic one', goodTrailer);
    commitWith(root, 'topic two', () => '');
    const rows = checkRange(root, [`${base.commit}..HEAD`], { boundary: base.commit });
    assert.equal(rows.length, 2, JSON.stringify(rows.map((r) => r.subject)));
    assert.deepEqual(rows.map((r) => r.verdict).sort(), ['MATCH', 'MISSING']);
  } finally {
    cleanup(root);
  }
});

test('ci-trailer · the range comes from the event: HEAD on a push, base..HEAD on a PR', { skip }, () => {
  const root = makeRepo();
  try {
    commitWith(root, 'one', goodTrailer);
    assert.deepEqual(resolveRevs(root, [], {}).revs, ['--max-count=1', 'HEAD']);
    assert.deepEqual(resolveRevs(root, ['--all'], {}).revs, ['HEAD']);
    assert.deepEqual(resolveRevs(root, ['x..y'], {}).revs, ['x..y']);
    // No `origin/main` exists in a fixture, so the PR form falls back to HEAD rather than
    // asking git for a range it cannot read.
    const pr = resolveRevs(root, [], { GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main' });
    assert.deepEqual(pr.revs, ['--max-count=1', 'HEAD']);
    assert.match(pr.scope, /could not be resolved|HEAD/);
    // A base ref is a ref NAME, never a range or an option: refused outright.
    const hostile = resolveRevs(root, [], { GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: '--upload-pack=x' });
    assert.deepEqual(hostile.revs, ['--max-count=1', 'HEAD']);
  } finally {
    cleanup(root);
  }
});
