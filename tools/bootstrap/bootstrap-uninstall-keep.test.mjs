// `uninstall` AND THE THINGS IT MUST NOT DELETE. Every test here is a way a human's work can end up
// inside an installation, and every one of them must survive.
//
//   a managed block in THEIR file   -> removed only if byte-intact, and the file restored exactly;
//   an edited managed block         -> kept, with the reverse patch printed for them to apply;
//   a file they changed             -> kept, unless they name it in --force-modified WITH --confirm;
//   a file they added in our dir    -> kept, and the directory with it;
//   a cell they opened              -> the WHOLE of vault/state/ kept, skeleton included;
//   a hook path they re-pointed     -> left exactly as it is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './main.mjs';
import { main as cellmode } from '../cellmode/main.mjs';
import { gitHooksPath, run as exec } from './exec.mjs';
import { INSTALL_MANIFEST } from './plan-constants.mjs';
import { REPORT_REL } from './uninstall.mjs';
import { cleanup, listFiles, makeProject } from './fixtures/temp.mjs';
import { initGit } from './fixtures/projects.mjs';

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

/** A real minimal install in a fresh repository. @param {string} tag @param {string[]} [approve]
 * @returns {{ root: string, target: string }} */
function installed(tag, approve = ['first-cell']) {
  const { root, target } = makeProject(tag);
  initGit(target, { commit: false });
  const result = run(['new', target, '--profile', 'minimal', '--confirm', '--approve', approve.join(',')]);
  assert.equal(result.code, 0, result.all);
  return { root, target };
}

/** @param {string} target @param {string} rel @returns {string} */
const read = (target, rel) => readFileSync(join(target, ...rel.split('/')), 'utf8');

test('uninstall · an intact block is removed and THEIR file comes back byte for byte', () => {
  const { root, target } = makeProject('block');
  try {
    const theirs = '# demo-app\n\nOur own rules, which predate any method.\n';
    writeFileSync(join(target, 'AGENTS.md'), theirs);
    initGit(target, { commit: false });
    assert.equal(run(['new', target, '--profile', 'minimal', '--confirm',
      '--approve', 'agents-block,first-cell']).code, 0);
    assert.notEqual(read(target, 'AGENTS.md'), theirs, 'the install must really have appended a block');

    const removed = run(['uninstall', target, '--confirm']);
    assert.equal(removed.code, 0, removed.all);
    assert.equal(read(target, 'AGENTS.md'), theirs, 'their file was not restored byte for byte');
    assert.match(removed.out, /restored: 1 file/);
    assert.ok(!existsSync(join(target, ...INSTALL_MANIFEST.split('/'))), 'nothing was kept, so the record goes');
  } finally {
    cleanup(root);
  }
});

test('uninstall · a block they edited is kept, with the reverse patch printed for them', () => {
  const { root, target } = makeProject('edited-block');
  try {
    writeFileSync(join(target, 'AGENTS.md'), '# demo-app\n');
    initGit(target, { commit: false });
    assert.equal(run(['new', target, '--profile', 'minimal', '--confirm',
      '--approve', 'agents-block,first-cell']).code, 0);
    const text = read(target, 'AGENTS.md');
    writeFileSync(join(target, 'AGENTS.md'), text.replace('cellular-mode:end', 'our note\n<!-- cellular-mode:end'));

    const status = run(['status', target]);
    assert.equal(status.code, 2, status.all);
    assert.match(status.out, /Blocks: 0 intact · 1 modified/);

    const removed = run(['uninstall', target, '--confirm']);
    assert.equal(removed.code, 0, removed.all);
    assert.match(removed.out, /somebody edited it, so removing it is a human's decision/);
    assert.match(removed.all, /Reverse patch — AGENTS\.md/);
    assert.match(removed.all, /- <!-- cellular-mode:begin method-core -->/);
    assert.ok(read(target, 'AGENTS.md').includes('our note'), 'their edited block must still be there');
    assert.ok(existsSync(join(target, ...INSTALL_MANIFEST.split('/'))),
      'something was kept, so the install record is kept too — never rewritten');
    assert.match(read(target, REPORT_REL), /"kept"/);
  } finally {
    cleanup(root);
  }
});

test('uninstall · a file they changed is kept; only --force-modified with --confirm deletes it', () => {
  const { root, target } = installed('modified');
  try {
    const mine = join(target, 'skills', 'cell', 'SKILL.md');
    writeFileSync(mine, `${readFileSync(mine, 'utf8')}\nMy own addition.\n`);
    writeFileSync(join(target, 'skills', 'cell', 'NOTES.md'), 'my notes\n');

    const kept = run(['uninstall', target, '--confirm']);
    assert.equal(kept.code, 0, kept.all);
    assert.match(kept.out, /modified since the install: kept/);
    assert.ok(existsSync(mine), 'a modified file must never be deleted without being named');
    assert.ok(existsSync(join(target, 'skills', 'cell', 'NOTES.md')), 'their own file must stay');
    assert.ok(existsSync(join(target, ...INSTALL_MANIFEST.split('/'))));

    const forced = run(['uninstall', target, '--confirm', '--force-modified', 'skills/cell/SKILL.md']);
    assert.equal(forced.code, 0, forced.all);
    assert.match(forced.out, /Deleted DESPITE local changes, removed on explicit human instruction/);
    assert.match(forced.out, /! skills\/cell\/SKILL\.md/);
    assert.ok(!existsSync(mine), '--force-modified with --confirm must delete the file it names');
    assert.ok(existsSync(join(target, 'skills', 'cell', 'NOTES.md')), 'and nothing else');
    assert.deepEqual(listFiles(target).filter((rel) => !rel.startsWith('.git/') && !rel.startsWith('vault/bootstrap/')),
      ['skills/cell/NOTES.md'], 'only their own file is left');
  } finally {
    cleanup(root);
  }
});

test('uninstall · a cell opened in the target keeps the whole of vault/state/', () => {
  const { root, target } = installed('history');
  try {
    // The method's own CLI, run against the target: a real cell, a real log entry.
    const opened = cellmode(['node', 'cli.mjs', 'open', 'their work', '--root', target, '--area', 'app'],
      { stdout: { write: () => true }, stderr: { write: () => true }, env: { ...ENV } });
    assert.equal(opened, 0, 'the installed cellmode CLI must be able to open a cell in the target');

    const removed = run(['uninstall', target, '--confirm']);
    assert.equal(removed.code, 0, removed.all);
    assert.match(removed.out, /vault\/state\/ holds work recorded after the install/);
    const left = listFiles(target).filter((rel) => rel.startsWith('vault/state/'));
    assert.ok(left.includes('vault/state/log.md') && left.includes('vault/state/INDEX.md'),
      `the skeleton is kept with the history, got: ${left.join(', ')}`);
    assert.ok(left.some((rel) => rel.startsWith('vault/state/cells/')), 'their cell file must survive');
    assert.ok(!existsSync(join(target, 'skills', 'cell', 'SKILL.md')), 'the rest is still removed');
  } finally {
    cleanup(root);
  }
});

test('uninstall · a hook path they re-pointed themselves is never unset', () => {
  const { root, target } = installed('hooks', ['first-cell', 'hooks']);
  try {
    assert.equal(exec(['git', 'config', 'core.hooksPath', '.my-hooks'], { cwd: target, env: { ...ENV } }).ok, true);
    const removed = run(['uninstall', target, '--confirm']);
    assert.equal(removed.code, 0, removed.all);
    assert.match(removed.out, /not the \.githooks this install set: left alone/);
    assert.equal(gitHooksPath(target, { ...ENV }), '.my-hooks', 'their hook path must be exactly as they left it');
  } finally {
    cleanup(root);
  }
});
