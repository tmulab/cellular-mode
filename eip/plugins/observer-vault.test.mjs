// O4, O5, O6, O8, O10, O11 — what the plugin says about a real vault.
//
// The vault is built by the real CLI (see observer-fixture.mjs), so these are not
// assertions about a hand-written fixture: they are assertions about the protocol's
// own output, read through the plugin's own capabilities.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPECTED, loadObserver } from './observer-fixture.mjs';
import { valueOf } from '../kernel/assertions.mjs';

/** @type {(value: unknown) => Record<string, unknown>[]} */
const rows = (value) => /** @type {Record<string, unknown>[]} */ (value);

test('O4 overview reports the counts the CLI actually wrote, plus the active cell', async () => {
  const o = await loadObserver();
  try {
    const value = valueOf(await o.call('overview'));
    assert.deepEqual(value.counts, EXPECTED.counts);
    assert.deepEqual(value.active, { id: EXPECTED.activeId, name: 'Tag filter' });
    // `recent` is the newest recorded closures, newest first, capped at five.
    const recent = rows(value.recent);
    assert.equal(recent.length, EXPECTED.logEntries);
    assert.deepEqual(recent.map((e) => e.cell), ['markdown-parser', 'note-storage']);
    assert.deepEqual(recent.map((e) => e.kind), ['pause', 'complete']);
    // O18 one vocabulary: the event status is the WORD, with the symbol alongside.
    assert.deepEqual(recent.map((e) => e.status), ['paused', 'done']);
    assert.deepEqual(recent.map((e) => e.statusSymbol), ['⏸', '✔']);
    assert.ok(String(recent[0]?.at) < '2026-04-09', 'timestamps come from the log');
  } finally {
    await o.cleanup();
  }
});

test('O11 integrity is the CLI guard, and a broken projection is REPORTED not repaired', async () => {
  const o = await loadObserver();
  try {
    const clean = valueOf(await o.call('overview'));
    assert.deepEqual(clean.integrity, { ok: true, findings: [] });
    // Break the projection the way a careless hand-edit would: claim a ⏸ cell that
    // the append-only log has never heard of.
    const index = join(o.state, 'INDEX.md');
    writeFileSync(index, `${String(valueOf(await o.call('overview')) && '')}# INDEX

| Cell | Area | Status | Last visit | Next step (1 line) |
|---|---|---|---|---|
| [Ghost cell](cells/ghost-cell.md) | x | ⏸ | 2026-04-08 | — |
`, 'utf8');
    const broken = valueOf(await o.call('overview'));
    const integrity = /** @type {{ ok: boolean, findings: { code: string }[] }} */ (broken.integrity);
    assert.equal(integrity.ok, false);
    assert.deepEqual(integrity.findings.map((f) => f.code).sort(), ['current-cell-mismatch', 'log-shrunk']);
    assert.equal(/** @type {{ total: number }} */ (broken.counts).total, 1,
      'the observer describes the vault as it is, it does not fix it');
  } finally {
    await o.cleanup();
  }
});

test('O5 cells lists every row with its status word, symbol and DECLARED dependencies', async () => {
  const o = await loadObserver();
  try {
    const list = rows(valueOf(await o.call('cells')).cells);
    assert.deepEqual(list.map((c) => c.id),
      ['note-storage', 'markdown-parser', 'search-index', 'tag-filter']);
    assert.deepEqual(list.map((c) => c.status), ['done', 'paused', 'planned', 'active']);
    assert.deepEqual(list.map((c) => c.statusSymbol), ['✔', '⏸', '📋', '🔵']);
    assert.deepEqual(
      Object.fromEntries(list.map((c) => [c.id, c.dependencies])),
      EXPECTED.dependencies,
    );
    // A planned cell has never run, so it has no last visit: null, not a dash.
    const planned = list.find((c) => c.id === 'search-index');
    assert.equal(planned?.lastVisit, null);
    assert.equal(planned?.area, 'src/search.mjs');
  } finally {
    await o.cleanup();
  }
});

test('O6 cell-detail answers every field, and names each one it cannot answer', async () => {
  const o = await loadObserver();
  try {
    const detail = valueOf(await o.call('cell-detail', { id: 'markdown-parser' }));
    assert.equal(detail.name, 'Markdown parser');
    assert.equal(detail.status, 'paused');
    assert.equal(detail.area, 'src/parser.mjs');
    assert.match(String(detail.objective), /heading\/paragraph\/list tree/);
    assert.deepEqual(detail.dependencies, ['note-storage']);
    assert.match(String(detail.nextStep), /read the first list failure/);
    assert.match(String(detail.build), /^red/);
    // Evidence is the LOG, not the cell file: only the log can say something ran.
    assert.deepEqual(detail.evidence,
      { logEntries: 1, lastStatus: 'paused', lastBuild: 'red (3 list criteria failing)' });
    // This cell was planned then opened without --in/--out/--done, so those fields
    // are genuinely not recorded. They are null AND named.
    const unavailable = /** @type {string[]} */ (detail.unavailable);
    assert.deepEqual(unavailable, ['allowedOperations', 'boundary.in', 'boundary.out',
      'doneCriterion', 'inputs', 'minimalContext', 'openIssues', 'outputs',
      'prohibitedOperations']);
    for (const name of unavailable) {
      const value = name.startsWith('boundary.')
        ? /** @type {Record<string, unknown>} */ (detail.boundary)[name.slice('boundary.'.length)]
        : detail[name];
      assert.equal(value, null, `${name} is listed as unavailable, so it must be null`);
    }
    // A cell opened with every field present lists nothing as unavailable except the
    // ones the protocol fills only at closure.
    const active = valueOf(await o.call('cell-detail', { id: EXPECTED.activeId }));
    assert.equal(/** @type {{ in: unknown }} */ (active.boundary).in, 'filterByTag() over the parsed tree');
    assert.equal(active.doneCriterion, 'a note with two tags is found by either one');
    assert.equal(/** @type {string[]} */ (active.unavailable).includes('doneCriterion'), false);
    assert.deepEqual(active.evidence, { logEntries: 0, lastStatus: null, lastBuild: null },
      'an opening is not logged by the protocol, so there is no evidence to show');
  } finally {
    await o.cleanup();
  }
});

test('O8 graph edges come ONLY from declared dependencies; the unknown one is dangling', async () => {
  const o = await loadObserver();
  try {
    const graph = valueOf(await o.call('graph'));
    const nodes = rows(graph.nodes);
    assert.deepEqual(nodes.map((n) => n.id),
      ['note-storage', 'markdown-parser', 'search-index', 'tag-filter']);
    assert.deepEqual(graph.edges, [
      { from: 'markdown-parser', to: 'note-storage' },
      { from: 'search-index', to: 'markdown-parser' },
      { from: 'tag-filter', to: 'note-storage' },
      { from: 'tag-filter', to: 'markdown-parser' },
    ]);
    assert.deepEqual(graph.dangling, EXPECTED.dangling);
    // The dangling target is NOT a node: an unknown dependency is never invented.
    assert.equal(nodes.some((n) => n.id === 'full-text-engine'), false);
    // LAYER is the longest declared dependency path, not a position in a list.
    assert.deepEqual(Object.fromEntries(nodes.map((n) => [n.id, n.layer])),
      { 'note-storage': 0, 'markdown-parser': 1, 'search-index': 2, 'tag-filter': 2 });
    assert.deepEqual(graph.layout, { columns: ['planned', 'active', 'paused', 'done'], layers: EXPECTED.layers });
    // COLUMN is the status, as an index into layout.columns.
    for (const node of nodes) {
      assert.equal(node.column, ['planned', 'active', 'paused', 'done'].indexOf(String(node.status)));
      for (const axis of ['x', 'y', 'z']) {
        assert.equal(Number.isInteger(node[axis]), true, `${node.id}.${axis} must be an integer`);
      }
    }
    // The dangling warning is published, with the cell that declared it.
    const warnings = rows(valueOf(await o.call('overview')).warnings);
    const dangling = warnings.find((w) => w.code === 'dangling-dependency');
    assert.equal(dangling?.cell, 'search-index');
    assert.match(String(dangling?.message), /full-text-engine/);
  } finally {
    await o.cleanup();
  }
});

test('O10 the timeline is the log and nothing else, and says what the protocol never records', async () => {
  const o = await loadObserver();
  try {
    const all = valueOf(await o.call('timeline'));
    assert.deepEqual(all.notRecorded, ['open', 'resume']);
    const events = rows(all.events);
    assert.equal(events.length, EXPECTED.logEntries, 'two closures were logged, four cells exist');
    assert.deepEqual(events.map((e) => [e.cell, e.kind, e.status, e.statusSymbol]),
      [['markdown-parser', 'pause', 'paused', '⏸'], ['note-storage', 'complete', 'done', '✔']]);
    assert.match(String(events[0]?.facts), /lists are not implemented yet/);
    assert.equal(events[1]?.nextStep, null, 'a completed cell has no next step');
    // A planned cell has no event at all: inventing one would be fiction in an
    // append-only record.
    assert.deepEqual(valueOf(await o.call('timeline', { cell: 'search-index' })).events, []);
    assert.equal(rows(valueOf(await o.call('timeline', { cell: 'note-storage' })).events).length, 1);
    assert.equal(rows(valueOf(await o.call('timeline', { limit: 1 })).events).length, 1);
    assert.equal(rows(valueOf(await o.call('timeline', { limit: 1 })).events)[0]?.cell, 'markdown-parser',
      'the limit keeps the NEWEST events');
  } finally {
    await o.cleanup();
  }
});

test('O4 an empty and a missing vault are described, never guessed', async () => {
  const o = await loadObserver({ root: join(process.cwd(), 'does-not-exist-anywhere') });
  try {
    const value = valueOf(await o.call('overview'));
    assert.deepEqual(value.counts, { total: 0, planned: 0, active: 0, paused: 0, done: 0 });
    assert.equal(value.active, null);
    assert.deepEqual(value.recent, []);
    assert.deepEqual(rows(value.warnings).map((w) => w.code),
      ['vault-file-missing', 'vault-file-missing', 'vault-file-missing']);
    assert.deepEqual(rows(value.warnings).map((w) => String(w.message).split(' ')[0]),
      ['INDEX.md', 'log.md', 'CURRENT-CELL.md']);
    assert.deepEqual(valueOf(await o.call('cells')).cells, []);
    const graph = valueOf(await o.call('graph'));
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.layout, { columns: ['planned', 'active', 'paused', 'done'], layers: 1 });
  } finally {
    await o.cleanup();
  }
});
