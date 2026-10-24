// `upgrade` END TO END — the verb that carries a newer source into an install that already
// exists, checked against a real install on disk rather than against a fixture of itself.
//
// A NEWER SOURCE IS SIMULATED HONESTLY. The source here is this checkout, which a test may not
// modify, so "the source moved on" is staged the other way round: the target is put back to older
// bytes AND the manifest is made to record exactly those bytes — the state an adopter is in after
// an upstream file changed: the file still hashes to the record, which the source now contradicts.
//
// THREE PROPERTIES CARRY THE REST. A dry run writes ZERO bytes (the whole tree is hashed before
// and after). A file the adopter CHANGED refuses the whole upgrade, exit 3, nothing written. After
// `--confirm`, `status` reports the install HEALTHY — the record describes the disk again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './main.mjs';
import { INSTALL_MANIFEST } from './plan-constants.mjs';
import { UPGRADE_APPROVAL } from './upgrade-record.mjs';
import { cleanup, makeProject, makeTarget, treeHash } from './fixtures/temp.mjs';
import { initGit } from './fixtures/projects.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LATER = '2026-10-24 09:30';

/** @param {string[]} args @param {string} [now]
 * @returns {{ code: number, out: string, err: string, all: string }} */
function run(args, now = '2026-10-06 12:00') {
  let out = '';
  let err = '';
  const code = main(['node', 'cli.mjs', ...args], {
    stdout: { write: (text) => { out += text; return true; } },
    stderr: { write: (text) => { err += text; return true; } },
    env: { CELLMODE_NOW: now, PATH: process.env.PATH ?? '' },
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

/** @param {string} target @param {string} rel @returns {string} */
const abs = (target, rel) => join(target, ...rel.split('/'));
/** @param {string} target @returns {Record<string, any>} */
const manifestOf = (target) => JSON.parse(readFileSync(abs(target, INSTALL_MANIFEST), 'utf8'));
/** @param {string} text @returns {string} */
const digest = (text) => createHash('sha256').update(text).digest('hex');

/** Puts `rel` back to older bytes AND records those bytes: the state of a target whose upstream
 * file has changed since it was installed. @param {string} target @param {string} rel
 * @param {string} bytes @returns {void} */
function rollBack(target, rel, bytes) {
  writeFileSync(abs(target, rel), bytes);
  const manifest = manifestOf(target);
  const entry = manifest.files.find((/** @type {{ path: string }} */ file) => file.path === rel);
  assert.ok(entry, `${rel} is not a recorded file`);
  entry.sha256After = digest(bytes);
  writeFileSync(abs(target, INSTALL_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
}

test('upgrade · a dry run plans the replace, writes zero bytes, and --confirm applies it', () => {
  const { root, target } = installed('upgrade-replace');
  try {
    rollBack(target, 'skills/cell/SKILL.md', '# an older skill\n');
    const before = treeHash(target);
    const dry = run(['upgrade', target, '--dry-run'], LATER);
    assert.equal(dry.code, 0, dry.all);
    assert.match(dry.out, /replace\s+1/);
    assert.match(dry.out, /skills\/cell\/SKILL\.md/);
    assert.match(dry.out, /Dry run: nothing was written/);
    assert.equal(treeHash(target), before, 'the dry run wrote something into the target');
    const needed = run(['upgrade', target], LATER);
    assert.equal(needed.code, 5, needed.all);
    assert.match(needed.err, /Re-run with --confirm/);
    assert.equal(treeHash(target), before, 'the run without --confirm wrote something');
    const done = run(['upgrade', target, '--confirm'], LATER);
    assert.equal(done.code, 0, done.all);
    assert.match(done.out, /Replaced: 1 file/);
    assert.equal(readFileSync(abs(target, 'skills/cell/SKILL.md'), 'utf8'),
      readFileSync(join(ROOT, 'skills', 'cell', 'SKILL.md'), 'utf8'));
    const manifest = manifestOf(target);
    assert.equal(manifest.installedAt, '2026-10-24T09:30:00.000Z');
    assert.ok(manifest.approvals.some((/** @type {{ action: string }} */ a) => a.action === UPGRADE_APPROVAL));
    const status = run(['status', target], LATER);
    assert.equal(status.code, 0, status.all);
    assert.match(status.out, /State: healthy/);
    assert.doesNotMatch(done.all, /[A-Za-z]:[\\/]/, 'an absolute path reached the output');
  } finally {
    cleanup(root);
  }
});

test('upgrade · a file the adopter changed refuses the WHOLE upgrade, and writes nothing', () => {
  const { root, target } = installed('upgrade-modified');
  try {
    rollBack(target, 'skills/cell/SKILL.md', '# an older skill\n');
    writeFileSync(abs(target, 'skills/pause/SKILL.md'), '# my own edit\n');
    const before = treeHash(target);
    for (const args of [['upgrade', target, '--dry-run'], ['upgrade', target, '--confirm']]) {
      const result = run(args, LATER);
      assert.equal(result.code, 3, result.all);
      assert.match(result.out, /REFUSED/);
      assert.match(result.out, /skills\/pause\/SKILL\.md was changed after it was installed/);
      assert.equal(treeHash(target), before, 'a refused upgrade wrote something');
    }
    assert.equal(readFileSync(abs(target, 'skills/pause/SKILL.md'), 'utf8'), '# my own edit\n');
  } finally {
    cleanup(root);
  }
});

test('upgrade · a recorded file that is GONE and a catalog file nobody recorded are both added', () => {
  const { root, target } = installed('upgrade-add');
  try {
    // Gone: the partial install `status` calls `partial`, which an upgrade re-adds from the source.
    rmSync(abs(target, 'skills/cell/SKILL.md'));
    // Unrecorded: what a component that GAINED a file looks like from the target's side.
    const manifest = manifestOf(target);
    manifest.files = manifest.files.filter((/** @type {{ path: string }} */ f) => f.path !== 'skills/pause/SKILL.md');
    writeFileSync(abs(target, INSTALL_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    rmSync(abs(target, 'skills/pause/SKILL.md'));
    const dry = run(['upgrade', target, '--dry-run'], LATER);
    assert.equal(dry.code, 0, dry.all);
    assert.match(dry.out, /add\s+2/);
    const done = run(['upgrade', target, '--confirm'], LATER);
    assert.equal(done.code, 0, done.all);
    assert.match(done.out, /Added: 2 files/);
    for (const rel of ['skills/cell/SKILL.md', 'skills/pause/SKILL.md']) {
      assert.equal(readFileSync(abs(target, rel), 'utf8'),
        readFileSync(join(ROOT, ...rel.split('/')), 'utf8'), rel);
    }
    const after = manifestOf(target);
    assert.ok(after.files.some((/** @type {{ path: string }} */ f) => f.path === 'skills/pause/SKILL.md'));
    assert.equal(run(['status', target], LATER).code, 0);
  } finally {
    cleanup(root);
  }
});

test('upgrade · an absent skeleton file is created, and log.md never is', () => {
  const { root, target } = installed('upgrade-skeleton');
  try {
    rmSync(abs(target, 'vault/state/cells/README.md'));
    rmSync(abs(target, 'vault/state/log.md'));
    const dry = run(['upgrade', target, '--dry-run', '--verbose'], LATER);
    assert.equal(dry.code, 0, dry.all);
    // The skeleton group holds exactly one path, and the deleted log is NOT it: `log.md` appears
    // only further down, among the evolving paths this verb leaves alone.
    assert.match(dry.out, /skeleton\s+1\n\s+vault\/state\/cells\/README\.md\n/);
    assert.match(dry.out, /evolving[^\n]*\n(?:\s+vault[^\n]*\n)*\s+vault\/state\/log\.md\n/);
    const done = run(['upgrade', target, '--confirm'], LATER);
    assert.equal(done.code, 0, done.all);
    assert.match(done.out, /Skeleton files created: 1/);
    assert.ok(readFileSync(abs(target, 'vault/state/cells/README.md'), 'utf8').startsWith('# Cells'));
    assert.throws(() => readFileSync(abs(target, 'vault/state/log.md')), /ENOENT/);
  } finally {
    cleanup(root);
  }
});

test('upgrade · an evolved vault and a user file are left alone, and a target with no record exits 0', () => {
  const { root, target } = installed('upgrade-evolving');
  try {
    writeFileSync(abs(target, 'vault/state/CURRENT-CELL.md'), '# my own cell state\n');
    writeFileSync(abs(target, 'skills/cell/NOTES.md'), 'my notes\n');
    const dry = run(['upgrade', target, '--dry-run', '--verbose'], LATER);
    assert.equal(dry.code, 0, dry.all);
    assert.match(dry.out, /left alone/);
    assert.match(dry.out, /evolving: the project's own record/);
    assert.match(dry.out, /Plan: nothing to write/);
    const done = run(['upgrade', target, '--confirm'], LATER);
    assert.equal(done.code, 0, done.all);
    assert.equal(readFileSync(abs(target, 'vault/state/CURRENT-CELL.md'), 'utf8'), '# my own cell state\n');
    assert.equal(readFileSync(abs(target, 'skills/cell/NOTES.md'), 'utf8'), 'my notes\n');
  } finally {
    cleanup(root);
  }
});

test('upgrade · a directory with no install record is not a failure, and the help lists the verb', () => {
  const bare = makeTarget('upgrade-bare');
  try {
    mkdirSync(join(bare, 'src'));
    const result = run(['upgrade', bare], LATER);
    assert.equal(result.code, 0, result.all);
    assert.match(result.out, /Not installed/);
    assert.match(run(['help']).out, /upgrade <target-dir>/);
    assert.equal(run(['upgrade']).code, 1);
  } finally {
    cleanup(bare);
  }
});
