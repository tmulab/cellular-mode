// CONTRACT H3 — THREE OWNERSHIP CLASSES, checked against the adoption trial that found the defect.
//
// The trial (A-02 / B-11) did nothing unusual: it installed, ran `cellmode open` — the documented
// next action — and approved a check in `vault/verification.json`, which Article 8 REQUIRES. Status
// then said `drift`, exit 2, `Next: repair`, and that repair would have overwritten the project's
// own memory with a skeleton. These tests are the regression: using the method as documented leaves
// the install HEALTHY, and the evolution is reported rather than complained about.
//
// B-13 is the mirror image: an uninstall that legitimately kept files keeps the manifest too — the
// record is never rewritten — and `status` used to call that a `partial` install forever. It is now
// `uninstalled-with-residue`, exit 0, with the kept paths and both safe next steps.
//
// WHAT MUST STILL FAIL FAILS. An immutable copied file changed is drift, gone is partial, and a
// managed block somebody edited is drift — three assertions in here exist only to prove that the
// new class did not quietly disarm the old ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './main.mjs';
import { main as cellmode } from '../cellmode/main.mjs';
import { VERIFICATION_FILE } from './plan-constants.mjs';
import { cleanup, makeProject } from './fixtures/temp.mjs';
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

/** The method's own CLI, run against the target exactly as an adopter would.
 * @param {string} target @param {string[]} args @returns {number} */
const cell = (target, args) => cellmode(['node', 'cli.mjs', ...args, '--root', target],
  { stdout: { write: () => true }, stderr: { write: () => true }, env: { ...ENV } });

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
const abs = (target, rel) => join(target, ...rel.split('/'));

test('H3 · opening and completing a cell in the target leaves the install healthy', () => {
  const { root, target } = installed('evolve-state');
  try {
    assert.equal(cell(target, ['open', 'their work', '--area', 'app']), 0,
      'the installed cellmode CLI must be able to open a cell in the target');
    const opened = run(['status', target]);
    assert.equal(opened.code, 0, opened.all);
    assert.match(opened.out, /State: healthy/);
    assert.doesNotMatch(opened.out, /Next: repair/);
    assert.match(opened.out, /0 missing · 0 modified/);
    assert.match(opened.out, / · [1-9]\d* evolved \(expected, never drift\)/);
    assert.match(opened.out, /Evolved \(expected/);
    assert.match(opened.out, /vault\/state\/CURRENT-CELL\.md \(changed\)/);

    assert.equal(cell(target, ['complete', '--facts', 'it works', '--confirm']), 0,
      'completing a cell is the documented next step and must not create drift');
    const done = run(['status', target]);
    assert.equal(done.code, 0, done.all);
    assert.match(done.out, /State: healthy/);
    assert.match(done.out, /vault\/state\/log\.md \(changed\)/);
  } finally {
    cleanup(root);
  }
});

test('H3 · approving a check in the verification contract is evolution, not drift', () => {
  const { root, target } = installed('evolve-contract');
  try {
    const contract = JSON.parse(readFileSync(abs(target, VERIFICATION_FILE), 'utf8'));
    writeFileSync(abs(target, VERIFICATION_FILE),
      `${JSON.stringify({ ...contract, notes: ['approved by hand, as Article 8 requires'] }, null, 2)}\n`);
    const result = run(['status', target]);
    assert.equal(result.code, 0, result.all);
    assert.match(result.out, /State: healthy/);
    assert.doesNotMatch(result.out, /Next: repair/);
    assert.match(result.out, /vault\/verification\.json \(changed\)/);
    assert.doesNotMatch(result.out, /Modified:/);
  } finally {
    cleanup(root);
  }
});

test('H3 · new files under vault/state are expected growth, and --verbose lists them all', () => {
  const { root, target } = installed('evolve-growth');
  try {
    for (let i = 1; i <= 11; i += 1) {
      writeFileSync(abs(target, `vault/state/cells/grown-${i}.md`), `# cell ${i}\n`);
    }
    const capped = run(['status', target]);
    assert.equal(capped.code, 0, capped.all);
    assert.match(capped.out, /State: healthy/);
    assert.match(capped.out, / · 11 evolved \(expected, never drift\)/);
    assert.match(capped.out, /0 extra \(unowned, never touched\)/,
      'a new cell file is evolution, not somebody\'s stray note');
    assert.match(capped.out, /… and 3 more/);

    const verbose = run(['status', target, '--verbose']);
    assert.equal(verbose.code, 0, verbose.all);
    assert.doesNotMatch(verbose.out, /… and \d+ more/);
    assert.match(verbose.out, /vault\/state\/cells\/grown-11\.md \(added\)/);
  } finally {
    cleanup(root);
  }
});

test('H3 · an immutable file changed is still drift, gone is still partial, theirs is neither', () => {
  const { root, target } = installed('immutable');
  try {
    writeFileSync(abs(target, 'skills/cell/NOTES.md'), 'my notes\n');
    const theirs = run(['status', target]);
    assert.equal(theirs.code, 0, theirs.all);
    assert.match(theirs.out, /State: healthy/);
    assert.match(theirs.out, /1 extra \(unowned, never touched\)/);

    const skill = abs(target, 'skills/cell/SKILL.md');
    writeFileSync(skill, `${readFileSync(skill, 'utf8')}\nmine\n`);
    const drift = run(['status', target]);
    assert.equal(drift.code, 2, drift.all);
    assert.match(drift.out, /State: drift/);
    assert.match(drift.out, /Modified:\n {2}- skills\/cell\/SKILL\.md/);
    assert.match(drift.out, /Next: repair —/);

    rmSync(abs(target, 'skills/pause/SKILL.md'));
    const partial = run(['status', target]);
    assert.equal(partial.code, 2, partial.all);
    assert.match(partial.out, /State: partial/);
    assert.match(partial.out, /Missing:\n {2}- skills\/pause\/SKILL\.md/);
  } finally {
    cleanup(root);
  }
});

test('H3 · a managed block somebody edited is drift: the span is Bootstrap\'s, the file is theirs', () => {
  const { root, target } = makeProject('edited-block');
  try {
    writeFileSync(abs(target, 'AGENTS.md'), '# demo-app\n\nOur own rules.\n');
    initGit(target, { commit: false });
    assert.equal(run(['new', target, '--profile', 'minimal', '--confirm',
      '--approve', 'agents-block,first-cell']).code, 0);
    const text = readFileSync(abs(target, 'AGENTS.md'), 'utf8');
    writeFileSync(abs(target, 'AGENTS.md'),
      text.replace('cellular-mode:end', 'our note\n<!-- cellular-mode:end'));
    const result = run(['status', target]);
    assert.equal(result.code, 2, result.all);
    assert.match(result.out, /Blocks: 0 intact · 1 modified/);
    assert.match(result.out, /State: drift/);
  } finally {
    cleanup(root);
  }
});

test('H3 · a finished uninstall that kept files is residue, never a damaged install (B-13)', () => {
  const { root, target } = installed('residue');
  try {
    // Exactly the trial's two kept paths: one immutable file they changed, and the contract they
    // approved. Both are KEPT by the uninstall — an evolving file that differs is never deleted.
    const skill = abs(target, 'skills/cell/SKILL.md');
    writeFileSync(skill, `${readFileSync(skill, 'utf8')}\nmine\n`);
    writeFileSync(abs(target, VERIFICATION_FILE), '{ "schema": "mine" }\n');

    const removed = run(['uninstall', target, '--confirm']);
    assert.equal(removed.code, 0, removed.all);
    assert.match(removed.out, /modified since the install: kept/);
    assert.ok(readFileSync(skill, 'utf8').includes('mine'), 'a modified file must survive');
    assert.ok(readFileSync(abs(target, VERIFICATION_FILE), 'utf8').includes('mine'),
      'an evolving file that differs from its record is KEPT, never deleted');

    const after = run(['status', target]);
    assert.equal(after.code, 0, after.all);
    assert.match(after.out, /State: uninstalled-with-residue/);
    assert.doesNotMatch(after.out, /Next: repair/);
    assert.match(after.out, /completed removal, NOT a damaged install/);
    assert.match(after.out, /Kept by that uninstall/);
    assert.match(after.out, /- skills\/cell\/SKILL\.md/);
    assert.match(after.out, /- vault\/verification\.json/);
  } finally {
    cleanup(root);
  }
});
