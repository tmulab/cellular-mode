// open-next.test.mjs — `open --next "<action>"`: the FIRST STEP the method's `cell`
// skill asks for at creation, recorded by the tool instead of left as "—".
//
// The skill (skills/cell/SKILL.md, case D) says a new cell is created with a name, a
// boundary AND a first step. Until `open` could carry one, every opened cell started
// life with "NEXT STEP: —", which the observer's cell-contract rule correctly reports
// as a warning. These tests pin the three projections the next step must reach, and
// both sides of the boundary: absent `--next` changes nothing, empty `--next` is a
// usage error — a next step that is blank is not a next step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cellText, freshRoot, run, readState, readCellText } from './helpers.mjs';

const STEP = 'run `node --test tools/cellmode` and read the first failure';

test('open --next records the step in the cell file, the INDEX row and CURRENT-CELL', () => {
  const root = freshRoot();
  run(root, ['init']);
  const before = readState(root, 'log');
  const out = run(root, ['open', 'Index Parser', '--area', 'tools/cellmode',
    '--objective', 'parse INDEX.md', '--in', 'index-table.mjs', '--out', 'the CLI surface',
    '--done', 'build green + round-trip test', '--next', STEP]);
  assert.match(out.stdout, /Opened "Index Parser" \(index-parser\) · 🔵/);
  assert.equal(out.stdout.includes(`NEXT STEP: ${STEP}`), true, 'the opening prints the step');
  const cell = cellText(root, 'index-parser');
  assert.match(cell, /## ➜ NEXT STEP \(doable in <5 min, without thinking\)/);
  assert.equal(cell.includes(`\n${STEP}\n`), true, 'the cell file carries the step verbatim');
  assert.equal(readState(root, 'index').includes(`| ${STEP} |`), true, 'the INDEX column too');
  assert.equal(readState(root, 'current'), cell, 'CURRENT-CELL is the projection of the cell file');
  assert.equal(readState(root, 'log'), before, 'opening a cell must still not write a log entry');
});

test('open --next carries the step when a 📋 planned cell is promoted', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['plan', 'Key Audit', '--area', 'tools', '--objective', 'audit keys']);
  assert.match(readState(root, 'index'), /\| 📋 \| — \| — \|/);
  const logAfterPlan = readState(root, 'log');
  const out = run(root, ['open', 'Key Audit', '--next', STEP]);
  assert.match(out.stdout, /promoted from 📋 \(an opening, not a resume\)/);
  assert.equal(out.stdout.includes(`NEXT STEP: ${STEP}`), true);
  assert.equal(cellText(root, 'key-audit').includes(`\n${STEP}\n`), true);
  assert.equal(readState(root, 'index').includes(`| ${STEP} |`), true);
  assert.match(cellText(root, 'key-audit'), /\*\*Objective:\*\* audit keys/);
  assert.equal(readState(root, 'log'), logAfterPlan, 'still no log entry for an opening');
  run(root, ['check']);
});

test('open without --next is unchanged: the next step stays "—"', () => {
  const root = freshRoot();
  run(root, ['init']);
  const out = run(root, ['open', 'Alpha', '--area', 'a']);
  assert.match(out.stdout, /NEXT STEP: —/);
  assert.match(readState(root, 'index'), /\| 🔵 \| 2026-10-02 \| — \|/);
  run(root, ['check']);
});

test('an empty --next is a usage error, and nothing is written', () => {
  const root = freshRoot();
  run(root, ['init']);
  for (const argv of [['open', 'Alpha', '--next', ''], ['open', 'Alpha', '--next='],
    ['open', 'Alpha', '--next', '   ']]) {
    const refused = run(root, argv, { expect: 1 });
    assert.match(refused.stderr, /requires a non-empty --next/);
    assert.equal(readCellText(root, 'alpha'), null, `no cell file after \`${argv.join(' ')}\``);
  }
  assert.equal(readState(root, 'index').includes('Alpha'), false, 'no INDEX row either');
});

test('plan still refuses --next: a planned cell carries intentions, not a first step', () => {
  const root = freshRoot();
  run(root, ['init']);
  const refused = run(root, ['plan', 'Alpha', '--area', 'a', '--next', STEP], { expect: 1 });
  assert.match(refused.stderr, /unknown option --next for `plan`/);
  assert.equal(readCellText(root, 'alpha'), null);
});

test('usage documents --next on open', () => {
  const root = freshRoot();
  const help = run(root, ['help']);
  const text = help.stdout;
  const openBlock = text.slice(text.indexOf('open <name>'), text.indexOf('resume <name>'));
  assert.match(openBlock, /--next/, 'the open entry itself must list the option');
});
