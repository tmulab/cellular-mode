// The committed vault is reproducible, and it is the vault the example claims.
//
// Two separate claims, and the second is the one that keeps the observer suite
// honest: `script.mjs` states what the replay must contain, so a fixture whose shape
// drifted would fail HERE, next to the story, instead of failing in a plugin test
// that nobody would read as "the example changed".
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED, SCRIPT } from '../script.mjs';
import { parseCellFile } from '../../../tools/cellmode/cell-file.mjs';
import { parseDependencies } from '../../../tools/cellmode/deps.mjs';
import { parseIndex } from '../../../tools/cellmode/index-table.mjs';
import { parseLog } from '../../../tools/cellmode/log.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE = join(HERE, '..', 'vault', 'state');
/** @type {(rel: string) => string} */
const state = (rel) => readFileSync(join(STATE, rel), 'utf8');

test('the committed vault replays byte-for-byte from the script', () => {
  // Exit 0 means identical; the script itself ends with `cellmode check`, so this
  // also proves the replayed state passes the protocol's own integrity guard.
  const out = execFileSync(process.execPath, [join(HERE, '..', 'reproduce.mjs')], { encoding: 'utf8' });
  assert.match(out, /vault reproduced: 9 files identical/);
  assert.match(out, new RegExp(`${SCRIPT.length} commands, check exit 0`));
});

test('the vault contains every state the observer has to render', () => {
  const rows = parseIndex(state('INDEX.md'));
  assert.equal(rows.length, EXPECTED.counts.total);
  /** @type {(symbol: string) => number} */
  const count = (symbol) => rows.filter((r) => r.status === symbol).length;
  assert.equal(count('📋'), EXPECTED.counts.planned);
  assert.equal(count('🔵'), EXPECTED.counts.active);
  assert.equal(count('⏸'), EXPECTED.counts.paused);
  assert.equal(count('✔'), EXPECTED.counts.done);
  assert.equal(rows.find((r) => r.status === '🔵')?.slug, EXPECTED.activeId);
  // A planned cell never ran, so the append-only log has fewer entries than cells.
  assert.equal(parseLog(state('log.md')).length, EXPECTED.logEntries);
});

test('the declared dependencies are what the script declared, including the dangling one', () => {
  const expected = /** @type {Record<string, string[]>} */ (EXPECTED.dependencies);
  const ids = Object.keys(expected);
  const declared = Object.fromEntries(ids.map((id) => [
    id, parseDependencies(parseCellFile(state(join('cells', `${id}.md`)))?.dependencies),
  ]));
  assert.deepEqual(declared, expected);
  for (const { from, to } of EXPECTED.dangling) {
    assert.equal(ids.includes(to), false, `${to} must NOT be a cell: that is what makes it dangling`);
    assert.ok(declared[from]?.includes(to), `${from} must still declare it`);
  }
  // Every non-dangling target is a real cell file, so the chain is three layers deep
  // and not a set of names that happen to look related.
  for (const [from, targets] of Object.entries(declared)) {
    for (const to of targets) {
      if (EXPECTED.dangling.some((d) => d.from === from && d.to === to)) continue;
      assert.ok(ids.includes(to), `${from} -> ${to} must resolve`);
    }
  }
});
