// `status` END TO END — the command that answers "what is installed here, and what should happen
// next", checked against a real install on disk rather than against a fixture of itself.
//
// TWO PROPERTIES CARRY THE REST. STATUS WRITES NOTHING: every test hashes the whole target tree,
// `.git` included, before and after. AND IT NEVER INVITES A REINSTALL: a manifest already there
// makes `new` and `existing` refuse with the CLASSIFICATION in the message, so the human is told
// whether this is a repair, an upgrade or a healthy install.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { main } from './main.mjs';
import { gitRevision } from './exec.mjs';
import { INSTALL_MANIFEST } from './plan-constants.mjs';
import { cleanup, makeProject, treeHash } from './fixtures/temp.mjs';
import { initGit } from './fixtures/projects.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });

/** @param {string[]} args @returns {{ code: number, out: string, err: string, all: string }} */
function run(args) {
  let out = '';
  let err = '';
  const code = main(['node', 'cli.mjs', ...args], {
    stdout: { write: (text) => { out += text; return true; } },
    stderr: { write: (text) => { err += text; return true; } },
    env: { ...ENV },
  });
  return { code, out, err, all: `${out}${err}` };
}

/** A real minimal install in a fresh git repository. @param {string} tag
 * @returns {{ root: string, target: string }} */
function installed(tag) {
  const { root, target } = makeProject(tag);
  initGit(target, { commit: false });
  const result = run(['new', target, '--profile', 'minimal', '--confirm', '--approve', 'first-cell']);
  assert.equal(result.code, 0, result.all);
  return { root, target };
}

/** @param {string} target @returns {Record<string, unknown>} */
const manifestOf = (target) => JSON.parse(readFileSync(join(target, ...INSTALL_MANIFEST.split('/')), 'utf8'));

/** @param {string} target @param {Record<string, unknown>} manifest @returns {void} */
const writeManifest = (target, manifest) => writeFileSync(join(target, ...INSTALL_MANIFEST.split('/')),
  `${JSON.stringify(manifest, null, 2)}\n`);

test('status · a fresh install reads healthy, exits 0 and writes nothing — .git included', () => {
  const { root, target } = installed('healthy');
  try {
    const before = treeHash(target);
    const result = run(['status', target]);
    assert.equal(result.code, 0, result.all);
    assert.match(result.out, /Installed: cellular-mode/);
    assert.match(result.out, /profile minimal/);
    assert.match(result.out, /Files: \d+ healthy · 0 missing · 0 modified · 0 extra/);
    assert.match(result.out, /State: healthy/);
    assert.match(result.out, /Next: none —/);
    assert.equal(treeHash(target), before, 'status wrote something into the target');
    assert.doesNotMatch(result.all, /[A-Za-z]:[\\/]/, 'an absolute path reached the output');
    assert.ok(!result.all.includes(tmpdir()), 'the temp directory was printed verbatim');
  } finally {
    cleanup(root);
  }
});

test('status · drift, a partial install and an unowned extra file are three different answers', () => {
  const { root, target } = installed('drift');
  try {
    // An unowned file inside a directory the install created: listed, never touched, still healthy.
    writeFileSync(join(target, 'skills', 'cell', 'NOTES.md'), 'my notes\n');
    const extra = run(['status', target]);
    assert.equal(extra.code, 0, extra.all);
    assert.match(extra.out, /1 extra \(unowned, never touched\)/);
    assert.match(extra.out, /skills\/cell\/NOTES\.md/);
    assert.match(extra.out, /State: healthy/);

    // A file Bootstrap created, changed: DRIFT, and the next action is a repair.
    writeFileSync(join(target, 'AGENTS.md'), `${readFileSync(join(target, 'AGENTS.md'), 'utf8')}\nmine\n`);
    const drift = run(['status', target]);
    assert.equal(drift.code, 2, drift.all);
    assert.match(drift.out, /State: drift/);
    assert.match(drift.out, /Modified:\n {2}- AGENTS\.md/);
    assert.match(drift.out, /Next: repair —/);

    // A created file GONE: the install is PARTIAL, which is a different fact from drift.
    rmSync(join(target, 'skills', 'cell', 'SKILL.md'));
    const partial = run(['status', target]);
    assert.equal(partial.code, 2, partial.all);
    assert.match(partial.out, /State: partial/);
    assert.match(partial.out, /Missing:\n {2}- skills\/cell\/SKILL\.md/);
    const before = treeHash(target);
    run(['status', target]);
    assert.equal(treeHash(target), before, 'status wrote something while reporting drift');
  } finally {
    cleanup(root);
  }
});

test('status · a newer source is an upgrade; the same version at another commit is the human\'s choice', () => {
  const { root, target } = installed('upgrade');
  try {
    const manifest = manifestOf(target);
    const source = /** @type {{ name: string, version: string, revision: string | null }} */ (manifest.source);
    writeManifest(target, { ...manifest, source: { ...source, version: '0.0.1' } });
    const upgrade = run(['status', target]);
    assert.equal(upgrade.code, 0, upgrade.all);
    assert.match(upgrade.out, /Next: upgrade —/);
    assert.match(upgrade.out, /0\.0\.1 was installed/);

    if (gitRevision(ROOT, { ...ENV }) !== null) {
      writeManifest(target, { ...manifest, source: { ...source, revision: 'a'.repeat(40) } });
      const either = run(['status', target]);
      assert.equal(either.code, 0, either.all);
      assert.match(either.out, /Next: repair-or-upgrade —/);
      assert.match(either.out, /cannot tell a fix from a feature/);
    }
  } finally {
    cleanup(root);
  }
});

test('status · no record is "not installed" and exit 0; an unreadable record is exit 2', () => {
  const { root, target } = makeProject('absent');
  try {
    const absent = run(['status', target]);
    assert.equal(absent.code, 0, absent.all);
    assert.match(absent.out, /Not installed/);
    assert.match(absent.out, /--analyze/, 'the answer points at the command that reasons about a codebase');

    const result = run(['new', target, '--profile', 'minimal', '--confirm', '--approve', 'first-cell']);
    assert.equal(result.code, 0, result.all);
    writeManifest(target, { schema: 'cellular-mode/install-manifest', version: 1 });
    const broken = run(['status', target]);
    assert.equal(broken.code, 2, broken.all);
    assert.match(broken.err, /install manifest is not usable/);
    // And an install that cannot be read is still an install: `new` refuses, and says UNKNOWN.
    const again = run(['new', target, '--profile', 'minimal', '--confirm']);
    assert.equal(again.code, 3, again.all);
    assert.match(again.err, /status: UNKNOWN/);
  } finally {
    cleanup(root);
  }
});

test('status · a reinstall is refused with the classification in the message, never silently', () => {
  const { root, target } = installed('refuse');
  try {
    rmSync(join(target, 'skills', 'pause', 'SKILL.md'));
    const again = run(['new', target, '--profile', 'minimal', '--confirm']);
    assert.equal(again.code, 3, again.all);
    assert.match(again.err, /status: partial, next action: repair/);
    assert.match(again.err, /Run `status` for the detail, `uninstall` to remove it/);
  } finally {
    cleanup(root);
  }
});
