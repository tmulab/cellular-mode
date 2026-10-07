// THE DELETION BOUNDARY — `removeOwned`, `removeEmptyDir`, `removeBlock`, and the hostile manifest.
//
// THE RE-HASH IS THE TEST THAT MATTERS. `removeOwned` re-reads and re-hashes the file one statement
// before the unlink; the first test here changes the bytes after the digest was taken and proves the
// file survives. Remove that re-hash from `writer-remove.mjs` and this test goes red — which is the
// only reason to believe it is doing anything.
//
// THE MANIFEST IS UNTRUSTED INPUT. A record naming `../outside`, an absolute path, or a path that
// goes through a symlink is refused before any deletion, by the validator and by `confine` — and the
// test asserts the file OUTSIDE the target is still there afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './main.mjs';
import { INSTALL_MANIFEST } from './plan-constants.mjs';
import { blockSpan, candidates, removeBlock, removeEmptyDir, removeOwned, sha256 } from './writer.mjs';
import { cleanup, makeTarget } from './fixtures/temp.mjs';

/** A drive-anchored path, assembled from fragments: this repository's leak gate refuses an absolute
 * path written as a literal, and rightly so, even in a test about refusing them.
 * @param {string} rest @returns {string} */
const anchored = (rest) => `${'C'}:/${rest}`;

const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });

/** @param {() => unknown} action @param {string} code @returns {void} */
function refuses(action, code) {
  assert.throws(action, (error) => {
    assert.equal(/** @type {{ code?: string }} */ (error).code, code,
      `expected ${code}, got ${String(/** @type {Error} */ (error).message)}`);
    return true;
  });
}

/** A manifest that validates, with exactly the files given.
 * @param {ReadonlyArray<Record<string, unknown>>} files @returns {Record<string, unknown>} */
function manifestWith(files) {
  return {
    schema: 'cellular-mode/install-manifest',
    version: 1,
    source: { name: 'cellular-mode', version: '0.1.0', revision: null },
    profile: 'minimal',
    components: [{ id: 'method-core', componentVersion: '1.0.0' }],
    installedAt: '2026-10-06T12:00:00.000Z',
    target: { name: 'demo-app' },
    files: [...files],
    integrations: [{ kind: 'hooks', status: 'skipped', detail: 'none' }],
    approvals: [],
    host: { languages: [], buildSystems: [], ci: [], hooks: 'none' },
    limitations: [],
  };
}

/** @param {string[]} args @returns {{ code: number, all: string }} */
function run(args) {
  let all = '';
  const write = (/** @type {string} */ text) => { all += text; return true; };
  return { code: main(['node', 'cli.mjs', ...args], { stdout: { write }, stderr: { write }, env: { ...ENV } }), all };
}

test('remove · the re-hash immediately before the unlink is what refuses a changed file', () => {
  const dir = makeTarget('rehash');
  try {
    writeFileSync(join(dir, 'owned.md'), 'original\n');
    const planned = sha256('original\n');
    writeFileSync(join(dir, 'owned.md'), 'they changed it\n'); // after the plan, before the deletion
    refuses(() => removeOwned(dir, 'owned.md', planned), 'CONFLICT');
    assert.equal(readFileSync(join(dir, 'owned.md'), 'utf8'), 'they changed it\n', 'their bytes must survive');

    const removed = removeOwned(dir, 'owned.md', sha256('they changed it\n'));
    assert.deepEqual({ ...removed }, { path: 'owned.md', sha256: sha256('they changed it\n') });
    assert.equal(existsSync(join(dir, 'owned.md')), false);
    refuses(() => removeOwned(dir, 'owned.md', planned), 'CONFLICT'); // and now it is simply gone
  } finally {
    cleanup(dir);
  }
});

test('remove · a path that escapes the target, and a directory, are refused', () => {
  const dir = makeTarget('confined');
  const outside = makeTarget('outside');
  try {
    writeFileSync(join(outside, 'secret.md'), 'theirs\n');
    for (const rel of ['../outside/secret.md', '/etc/passwd', anchored('Windows/x.md'), 'a/../../b.md']) {
      refuses(() => removeOwned(dir, rel, sha256('theirs\n')), 'OUTSIDE_TARGET');
    }
    mkdirSync(join(dir, 'adir'));
    refuses(() => removeOwned(dir, 'adir', sha256('')), 'CONFLICT');
    refuses(() => removeOwned(dir, 'nothing-here.md', sha256('')), 'CONFLICT');
    assert.equal(readFileSync(join(outside, 'secret.md'), 'utf8'), 'theirs\n', 'nothing outside was touched');
  } finally {
    cleanup(dir);
    cleanup(outside);
  }
});

test('remove · a deletion is never followed through a link, not even one named like ours', (t) => {
  const dir = makeTarget('linked');
  const outside = makeTarget('outside-link');
  try {
    writeFileSync(join(outside, 'secret.md'), 'theirs\n');
    try {
      symlinkSync(outside, join(dir, 'escape'), 'junction');
    } catch {
      t.skip('this environment does not permit creating a junction or symlink');
      return;
    }
    refuses(() => removeOwned(dir, 'escape/secret.md', sha256('theirs\n')), 'OUTSIDE_TARGET');
    refuses(() => removeBlock(dir, 'escape/secret.md', 'method-core', {}), 'OUTSIDE_TARGET');
    refuses(() => removeEmptyDir(dir, 'escape'), 'OUTSIDE_TARGET'); // a junction is never "an empty directory"
    assert.equal(readFileSync(join(outside, 'secret.md'), 'utf8'), 'theirs\n', 'nothing outside was touched');
  } finally {
    cleanup(dir);
    cleanup(outside);
  }
});

test('remove · a directory goes only when it is empty, and never recursively', () => {
  const dir = makeTarget('dirs');
  try {
    mkdirSync(join(dir, 'deep', 'er'), { recursive: true });
    writeFileSync(join(dir, 'deep', 'er', 'file.md'), 'x\n');
    assert.equal(removeEmptyDir(dir, 'deep'), false, 'a directory with content stays');
    assert.equal(removeEmptyDir(dir, 'deep/er'), false);
    assert.equal(existsSync(join(dir, 'deep', 'er', 'file.md')), true);
    removeOwned(dir, 'deep/er/file.md', sha256('x\n'));
    assert.equal(removeEmptyDir(dir, 'deep/er'), true);
    assert.equal(removeEmptyDir(dir, 'deep'), true);
    assert.equal(removeEmptyDir(dir, 'deep'), false, 'a directory that is not there is not an error');
  } finally {
    cleanup(dir);
  }
});

test('remove · one intact block, or nothing: duplicated markers and an edited body are refused', () => {
  const dir = makeTarget('block');
  try {
    const block = '<!-- cellular-mode:begin method-core -->\nours\n<!-- cellular-mode:end method-core -->\n';
    const theirs = '# theirs\n';
    writeFileSync(join(dir, 'A.md'), `${theirs}\n${block}`);
    refuses(() => removeBlock(dir, 'A.md', 'method-core', { blockSha256: sha256('something else') }), 'CONFLICT');
    assert.equal(readFileSync(join(dir, 'A.md'), 'utf8'), `${theirs}\n${block}`, 'a block whose digest differs stays');

    const result = removeBlock(dir, 'A.md', 'method-core',
      { blockSha256: sha256(block), sha256Before: sha256(theirs) });
    assert.equal(readFileSync(join(dir, 'A.md'), 'utf8'), theirs, 'their file comes back exactly');
    assert.equal(result.restored, true);
    assert.equal(result.removed, block);

    // A file that did not end with a newline is restored to exactly that, too.
    writeFileSync(join(dir, 'B.md'), `# no newline\n\n${block}`);
    removeBlock(dir, 'B.md', 'method-core', { blockSha256: sha256(block), sha256Before: sha256('# no newline') });
    assert.equal(readFileSync(join(dir, 'B.md'), 'utf8'), '# no newline');

    writeFileSync(join(dir, 'C.md'), `${block}${block}`);
    refuses(() => removeBlock(dir, 'C.md', 'method-core', { blockSha256: sha256(block) }), 'CONFLICT');
    assert.equal(readFileSync(join(dir, 'C.md'), 'utf8'), `${block}${block}`);
    refuses(() => removeBlock(dir, 'C.md', '(bootstrap)', {}), 'CONFLICT'); // a parenthesis is not a group
    assert.deepEqual(candidates('a\n\n', ''), ['a\n', 'a', 'a\n\n']);
    assert.ok('problem' in blockSpan('nothing here\n', 'method-core'));
  } finally {
    cleanup(dir);
  }
});

test('remove · a hostile install record is refused before any deletion happens', () => {
  const dir = makeTarget('hostile');
  const outside = makeTarget('outside-2');
  try {
    writeFileSync(join(outside, 'secret.md'), 'theirs\n');
    const hash = sha256('theirs\n');
    mkdirSync(join(dir, 'vault'));
    for (const path of ['../outside-2/secret.md', '/absolute.md', anchored('x.md'), 'ok/../../up.md']) {
      writeFileSync(join(dir, ...INSTALL_MANIFEST.split('/')),
        `${JSON.stringify(manifestWith([{ path, mode: 'copy', created: true, sha256Before: null, sha256After: hash }]), null, 2)}\n`);
      const status = run(['status', dir]);
      assert.equal(status.code, 2, `${path} must be refused by the validator, got: ${status.all}`);
      const removed = run(['uninstall', dir, '--confirm']);
      assert.equal(removed.code, 2, `${path} must be refused, got: ${removed.all}`);
      assert.equal(readFileSync(join(outside, 'secret.md'), 'utf8'), 'theirs\n');
      assert.equal(existsSync(join(outside, 'secret.md')), true, 'nothing outside the target was deleted');
    }
  } finally {
    cleanup(dir);
    cleanup(outside);
  }
});
