// O9 — the layout is deterministic, server-side, and linear in nodes + edges.
//
// PURE throughout: the vault is handed to `readModel` as two in-memory functions
// shaped like the host's read ports, so this file needs neither a disk nor a kernel.
// That is what makes the 500-cell case cheap enough to be a real test instead of a
// comment claiming it would scale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readModel } from './model.mjs';
import { buildGraph, declaredEdges, depthLayers } from './layout.mjs';

/** A vault as two port-shaped functions over an in-memory file map.
 * @param {Record<string, string>} files */
function fakeVault(files) {
  /** @type {(name: string) => Promise<string | null>} */
  const read = async (name) => files[name] ?? null;
  /** @type {() => Promise<string[]>} */
  const list = async () => Object.keys(files)
    .filter((n) => n.startsWith('cells/'))
    .map((n) => n.slice('cells/'.length, -'.md'.length));
  return { read, list };
}

/** The model of an in-memory vault. @type {(files: Record<string, string>) => Promise<import('./types.mjs').Model>} */
const modelOf = (files) => {
  const { read, list } = fakeVault(files);
  return readModel(read, list);
};

/** A generated project: `n` cells in a chain of `depth`, statuses cycling.
 * Deps point BACKWARDS by `depth`, so the dependency graph is `n` long and the
 * longest path is `n / depth` — deep enough that a quadratic layout would show.
 * @param {number} n @param {number} depth */
function generated(n, depth) {
  const symbols = ['📋', '🔵', '⏸', '✔'];
  /** @type {Record<string, string>} */
  const files = {};
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const id = `cell-${String(i).padStart(4, '0')}`;
    // Exactly one 🔵 cell: more than one would be an integrity finding, and this
    // fixture is about the layout, not about breaking the protocol.
    const symbol = i === 1 ? '🔵' : symbols[i % 4 === 1 ? 0 : i % 4] ?? '📋';
    rows.push(`| [Cell ${i}](cells/${id}.md) | area/${i % 7} | ${symbol} | 2026-04-0${(i % 9) + 1} | step ${i} |`);
    const parent = i >= depth ? `cell-${String(i - depth).padStart(4, '0')}` : '';
    files[`cells/${id}.md`] = [
      `# Cell: Cell ${i}`,
      `**ID:** ${id}`,
      `**Area:** area/${i % 7}`,
      `**Opened:** 2026-04-01 · **Status:** ${symbol}`,
      `**Dependencies:** ${parent || '—'}`,
      '',
      '## ➜ NEXT STEP (doable in <5 min, without thinking)',
      `step ${i}`,
      '',
    ].join('\n');
  }
  files['INDEX.md'] = ['# INDEX', '', '| Cell | Area | Status | Last visit | Next step (1 line) |',
    '|---|---|---|---|---|', ...rows, ''].join('\n');
  files['log.md'] = '# Cell log\n';
  files['CURRENT-CELL.md'] = '# Current cell\n\nNo active cell · 0 paused\n';
  return files;
}

test('O9 declaredEdges: an undeclared pair is no edge, an unknown target is dangling', () => {
  /** @type {import('./types.mjs').Entry[]} */
  const entries = [
    { id: 'a', name: 'A', area: null, status: 'done', statusSymbol: '✔', lastVisit: null, nextStep: null, dependencies: [], cell: null },
    { id: 'b', name: 'B', area: null, status: 'active', statusSymbol: '🔵', lastVisit: null, nextStep: null, dependencies: ['a', 'a', 'ghost', 'b'], cell: null },
  ];
  const { edges, dangling } = declaredEdges(entries, new Set(['a', 'b']));
  assert.deepEqual(edges, [{ from: 'b', to: 'a' }], 'duplicates collapse; a is declared once');
  assert.deepEqual(dangling, [{ from: 'b', to: 'ghost' }, { from: 'b', to: 'b' }],
    'an unknown target and a self-dependency are both reported, neither becomes an edge');
});

test('O9 depthLayers: a cycle neither hangs nor throws, and says it is a cycle', () => {
  /** @type {(id: string, deps: string[]) => import('./types.mjs').Entry} */
  const entry = (id, deps) => ({ id, name: id, area: null, status: 'planned', statusSymbol: '📋', lastVisit: null, nextStep: null, dependencies: deps, cell: null });
  const entries = [entry('a', ['b']), entry('b', ['a']), entry('c', [])];
  const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }];
  const { layerOf, cycle } = depthLayers(entries, edges);
  assert.equal(cycle, true);
  assert.equal(layerOf.get('c'), 0);
  assert.ok(Number.isInteger(layerOf.get('a')), 'every node still gets a layer');
});

test('O9 the same vault yields byte-identical positions, twice and from a second model', async () => {
  const files = generated(60, 3);
  const first = buildGraph(await modelOf(files));
  const second = buildGraph(await modelOf(files));
  assert.equal(JSON.stringify(first), JSON.stringify(second),
    'the layout is arithmetic on (column, layer, rank): nothing in it can vary');
  // Nothing is random, nothing is time-based, nothing depends on object iteration
  // order: shuffling the FILE MAP must not move a node.
  const shuffled = Object.fromEntries(Object.entries(files).reverse());
  const third = buildGraph(await modelOf(shuffled));
  assert.equal(JSON.stringify(third), JSON.stringify(first));
});

test('O9 ~500 cells: linear cost, inside the declared bound, and still deterministic', async () => {
  const COUNT = 500;
  const files = generated(COUNT, 5);
  const model = await modelOf(files);
  assert.equal(model.entries.length, COUNT);

  const started = process.hrtime.bigint();
  const graph = buildGraph(model);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  // A generous bound: the claim being pinned is "not quadratic", and 500 nodes with a
  // pairwise pass would be 250_000 comparisons per axis, not 500.
  assert.ok(ms < 250, `layout of ${COUNT} cells took ${ms.toFixed(1)}ms`);

  assert.equal(graph.nodes.length, COUNT);
  assert.equal(graph.edges.length, COUNT - 5, 'one declared dependency per cell beyond the first layer');
  assert.deepEqual(graph.dangling, []);
  assert.equal(graph.layout.layers, COUNT / 5, 'the chain is 100 layers deep');
  assert.equal(graph.cycle, false);
  assert.equal(JSON.stringify(buildGraph(model)), JSON.stringify(graph));

  // Positions are unique per node within a (column, layer) cell: a layout that piled
  // nodes on one another would be deterministic and useless.
  const seats = new Set(graph.nodes.map((n) => `${n.x}/${n.y}/${n.z}`));
  assert.equal(seats.size, COUNT, 'no two cells share a position');
  for (const node of graph.nodes) {
    assert.ok(node.layer >= 0 && node.layer < graph.layout.layers);
    assert.equal(node.column, graph.layout.columns.indexOf(node.status));
  }
});
