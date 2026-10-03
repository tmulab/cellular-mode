// Article 8, enforced by git itself. A rule that lives only in a model's instructions is
// a suggestion, so the authorization is also asked for by `.githooks/pre-commit`,
// `commit-msg` and `pre-push` — in a THROWAWAY repository here, never in this one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoState } from '../tools/gates/fingerprint.mjs';
import { runFinalVerification } from '../tools/gates/verify-final.mjs';
import { cleanup, git, hasGit, hasSh, installGates, makeRepo, run, stubSuite, write } from './git-fixture.mjs';

const skip = !hasGit()
  ? 'git is not available on this machine'
  : !hasSh() ? 'no POSIX sh available to run the hook scripts' : false;

// The hooks call `node`; the tests pin the exact binary they are running under, so a PATH
// without node cannot turn a real block into an accidental one.
const ENV = { CELLULAR_NODE: process.execPath };

/** @param {string} root @returns {{ ok: boolean, reason: string }} */
const verify = (root) => runFinalVerification({ root, suite: stubSuite() });

/** @param {string} root @param {string} message @returns {{ status: number, stdout: string, stderr: string }} */
const commit = (root, message) => run(root, 'git', ['commit', '-m', message], { env: ENV });

/** @param {string} root @returns {string} */
const head = (root) => git(root, ['rev-parse', 'HEAD']).stdout.trim();

test('(g) pre-commit blocks an unverified staged tree and names the command', { skip }, () => {
  const root = makeRepo();
  try {
    installGates(root);
    git(root, ['add', '-A']);
    const blocked = commit(root, 'unverified work');
    assert.notEqual(blocked.status, 0, 'a commit of an unverified state must not succeed');
    const text = blocked.stdout + blocked.stderr;
    assert.match(text, /verify:final/, text);
    assert.equal(git(root, ['log', '--format=%s']).stdout.trim(), 'seed', 'HEAD must not move');
  } finally {
    cleanup(root);
  }
});

test('(g) pre-commit allows the exact verified state, and (h) commit-msg stamps it', { skip }, () => {
  const root = makeRepo();
  try {
    installGates(root);
    const result = verify(root);
    assert.equal(result.ok, true, result.reason);
    const state = repoState(root);
    git(root, ['add', '-A']);
    const allowed = commit(root, 'verified work');
    assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
    const body = git(root, ['log', '-1', '--format=%B']).stdout;
    assert.match(body, new RegExp(`Verified-State: sha256:${state.fingerprint} tree:${state.tree}`));
    assert.equal(git(root, ['rev-parse', 'HEAD^{tree}']).stdout.trim(), state.tree,
      'the committed tree must be the tree the evidence certifies');
  } finally {
    cleanup(root);
  }
});

test('(j) partial staging is blocked even when HEAD itself is authorized', { skip }, () => {
  const root = makeRepo();
  try {
    installGates(root);
    assert.equal(verify(root).ok, true);
    git(root, ['add', '-A']);
    assert.equal(commit(root, 'verified work').status, 0);
    const authorizedHead = head(root);
    write(root, 'docs/guide.md', '# Guide\n\nEdited.\n');
    write(root, 'vault/state/log.md', '# Log\n\n## entry one\n\n## entry two\n');
    git(root, ['add', 'docs/guide.md']);
    const blocked = commit(root, 'half of the work');
    assert.notEqual(blocked.status, 0, 'a staged tree nobody verified must be refused');
    assert.equal(head(root), authorizedHead, 'HEAD must not move');
  } finally {
    cleanup(root);
  }
});

test('(i) pre-push blocks a commit range with no evidence and passes a verified one', { skip }, () => {
  const root = makeRepo();
  const remote = mkdtempSync(join(tmpdir(), 'cellular-remote-'));
  try {
    git(remote, ['init', '-q', '--bare']);
    installGates(root);
    git(root, ['remote', 'add', 'origin', remote]);
    const base = head(root);
    git(root, ['add', '-A']);
    // `--no-verify` is exactly the bypass the documentation warns about: it is used here
    // to MANUFACTURE the unverified commit the push hook must then refuse.
    assert.equal(run(root, 'git', ['commit', '-q', '--no-verify', '-m', 'bypassed'], { env: ENV }).status, 0);
    const input = `refs/heads/main ${head(root)} refs/heads/main ${base}\n`;
    const blocked = run(root, 'sh', ['.githooks/pre-push', 'origin', remote], { env: ENV, input });
    assert.notEqual(blocked.status, 0, 'pushing an unverified commit must be refused');
    assert.match(blocked.stdout + blocked.stderr, /verify:final/);
    // Verify the state the bypassed commit left behind: now its tree has evidence.
    assert.equal(verify(root).ok, true);
    const allowed = run(root, 'sh', ['.githooks/pre-push', 'origin', remote], { env: ENV, input });
    assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
  } finally {
    cleanup(root);
    cleanup(remote);
  }
});

test('audit · the CLI lists commits whose tree has no evidence', { skip }, () => {
  const root = makeRepo();
  try {
    installGates(root);
    git(root, ['add', '-A']);
    run(root, 'git', ['commit', '-q', '--no-verify', '-m', 'bypassed'], { env: ENV });
    const audit = run(root, process.execPath, ['tools/gates/authorization.mjs', 'audit', 'HEAD~1..HEAD']);
    assert.notEqual(audit.status, 0, 'an unverified commit in the range is a finding');
    assert.match(audit.stdout + audit.stderr, /bypassed|unverified|no evidence/i);
  } finally {
    cleanup(root);
  }
});
