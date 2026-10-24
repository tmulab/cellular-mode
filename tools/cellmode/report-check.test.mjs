// report-check.test.mjs — the `map-stale` finding, through the real CLI on temp vaults:
// one POSITIVE case (a map generated from bytes the vault no longer has), one NEGATIVE
// (a map just generated), the map nobody can vouch for (no fingerprint at all), and the
// property the finding exists under — a vault with NO map file and NO operation prints byte
// for byte what it printed before this rule was written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { CLI, NOW, freshRoot, run, paths } from './helpers.mjs';

const PASSED = 'Integrity check passed · ';

/** The CLI with BOTH streams captured: a claim about the bytes of a PASSING run has to
 * read its stderr too. @param {string} root @param {string[]} args */
const probe = (root, args) => spawnSync(process.execPath, [CLI, ...args, '--root', root],
  { encoding: 'utf8', env: { ...process.env, CELLMODE_NOW: NOW } });

/** A vault with one paused cell and a freshly generated map. @returns {string} */
function mapped() {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Alpha', '--area', 'core']);
  run(root, ['pause', '--facts', 'wrote the parser', '--next', 'run the tests']);
  run(root, ['report']);
  return root;
}

/** @param {string} root @returns {string} */
const mapText = (root) => readFileSync(`${paths(root).state}/map.svg`, 'utf8');

test('no map file means no finding, and the same bytes as before this rule', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Alpha', '--area', 'a']);
  run(root, ['pause', '--facts', 'wrote a.mjs', '--next', 'run the tests']);
  const clean = probe(root, ['check']);
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stdout, `${PASSED}0 active · 1 paused · 0 planned · 0 done · 1 log entries\n`);
  assert.equal(clean.stderr, '');
});

test('a map generated from the vault as it is now is not stale', () => {
  const root = mapped();
  const passing = probe(root, ['check']);
  assert.equal(passing.status, 0, passing.stderr);
  assert.equal(passing.stdout, `${PASSED}0 active · 1 paused · 0 planned · 0 done · 1 log entries\n`);
  assert.equal(passing.stderr, '');
});

test('map-stale: the log moved and the map did not', () => {
  const root = mapped();
  run(root, ['resume', 'Alpha']);
  run(root, ['pause', '--facts', 'wrote the renderer', '--next', 'run the tests']);
  const stale = probe(root, ['check']);
  assert.equal(stale.status, 2);
  assert.match(stale.stderr, /- \[map-stale\] map stale: vault\/state\/map\.svg carries source [0-9a-f]{12} but log\.md, INDEX\.md and operations\/ now hash to [0-9a-f]{12} — regenerate it with `cellmode report`/);
  run(root, ['report']);
  const fixed = probe(root, ['check']);
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.doesNotMatch(fixed.stdout, /map-stale/);
});

test('a stale map never refuses a transition: recording comes first', () => {
  const root = mapped();
  run(root, ['resume', 'Alpha']);
  run(root, ['pause', '--facts', 'the map is stale from the resume on', '--next', 'report']);
  assert.match(probe(root, ['check']).stderr, /\[map-stale\]/, 'but `check` does say so');
  run(root, ['report']);
  assert.equal(probe(root, ['check']).status, 0);
});

test('map-stale: a map with no fingerprint is a map nothing can vouch for', () => {
  const root = mapped();
  writeFileSync(`${paths(root).state}/map.svg`, '<svg xmlns="http://www.w3.org/2000/svg" />',
    'utf8');
  const stale = probe(root, ['check']);
  assert.equal(stale.status, 2);
  assert.match(stale.stderr, /\[map-stale\] map stale: vault\/state\/map\.svg carries source no fingerprint/);
});

test('map-stale is appended LAST, after every operation finding', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['op', 'open', 'Go Live', '--finish-line', 'ship it; document it',
    '--pack', 'spend ceiling: 2k tokens; max-active-cells: 2', '--bar', 'labels on claims',
    '--cells', 'Alpha']);
  run(root, ['report']);
  const file = paths(root).operationFile('go-live');
  writeFileSync(file, readFileSync(file, 'utf8').replace('ship it', 'ship something else'),
    'utf8');
  const stale = probe(root, ['check']);
  assert.equal(stale.status, 2);
  const codes = stale.stderr.split('\n').filter((l) => l.startsWith('- ['))
    .map((l) => l.slice(3, l.indexOf(']')));
  assert.deepEqual(codes, ['finish-line-moved', 'map-stale'],
    'the operation findings keep their order, and the map comes after them');
});

test('a stale map in a vault with no operation is still a finding', () => {
  const root = mapped();
  writeFileSync(paths(root).log, `${readFileSync(paths(root).log, 'utf8')}\n<!-- a hand edit -->\n`,
    'utf8');
  const stale = probe(root, ['check']);
  assert.equal(stale.status, 2);
  assert.match(stale.stderr, /\[map-stale\]/);
  assert.ok(mapText(root).includes('cellmode-source: sha256:'));
});
