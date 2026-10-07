// This repository's own hooks, as GIT records them. A hook that is not executable is one git
// silently SKIPS on a POSIX checkout: no error, no warning, Article 8 simply not enforced. The
// mode therefore belongs in the index — `100755`, not `100644` — and the index is the only place
// that answers for every clone, because `core.filemode=false` on a Windows machine means the
// working tree here carries no exec bit to read.
//
// This is the regression test for the defect Linux CI run 37614832141 found on commit 2e8e84a:
// the three hooks were committed `100644`, so the adopted-project end-to-end test could not tell
// a refusing hook from an absent one. It reads git, never a file mode, and so it is deterministic
// on Windows and on POSIX alike. It uses `tests/git-fixture.mjs`, which is the one place in
// `tests/` allowed to reach `node:child_process`, and it only READS this repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOOKS, REPO_ROOT, git, hasGit } from './git-fixture.mjs';

/** The removal rehearsals copy this tree WITHOUT its `.git`, so the copy is no work tree and git
 * has no index to answer from. That is not a failure of the rule — there is simply nothing to ask —
 * so it SKIPS with the reason stated, exactly like the git-unavailable case. Inside a real work tree
 * the assertion below is unconditional.
 * @returns {false | string} */
function skipReason() {
  if (!hasGit()) return 'git is not available on this machine';
  const inside = git(REPO_ROOT, ['rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    return `${REPO_ROOT} is not inside a git work tree, so git records no mode to check`;
  }
  return false;
}

const skip = skipReason();

test('the three git hooks are recorded executable (100755) in this repository\'s index', { skip }, () => {
  const paths = HOOKS.map((hook) => `.githooks/${hook}`);
  const listed = git(REPO_ROOT, ['ls-files', '-s', ...paths]);
  assert.equal(listed.status, 0, `${listed.stdout}${listed.stderr}`);
  const rows = listed.stdout.split('\n').filter((line) => line.trim() !== '');
  assert.equal(rows.length, paths.length, `every hook must be tracked: ${listed.stdout}`);
  for (const row of rows) {
    const [mode, , , file] = row.split(/\s+/);
    assert.equal(mode, '100755',
      `${file} is ${mode} in the index, so git would not run it on a POSIX checkout; fix with \`git update-index --chmod=+x ${file}\``);
  }
});
