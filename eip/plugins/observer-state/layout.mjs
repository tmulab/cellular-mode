// The graph, and its POSITIONS — computed here, on the server, always.
//
// Carried over from the original dashboard: "the scene computes nothing". A viewer
// that places its own nodes is a second layout, so two viewers of the same vault
// disagree about the same project. Here the answer is arithmetic on three integers
// (column, layer, rank), which is why it is deterministic across runs, processes and
// viewers, and why it is testable without a renderer.
//
// COLUMN = status (the protocol's four, always all four, so a column never moves when
// a cell changes status). LAYER = dependency depth. RANK = position inside the
// (column, layer) group, in INDEX.md order.
//
// Cost is O(nodes + edges): one memoised depth walk and one grouping pass. There is
// no all-pairs step anywhere, which is the property the scale test pins.
import { STATUSES } from './model.mjs';

/** @typedef {import('./types.mjs').Entry} Entry */
/** @typedef {import('./types.mjs').GraphEdge} GraphEdge */
/** @typedef {import('./types.mjs').GraphNode} GraphNode */
/** @typedef {import('./types.mjs').Model} Model */

/** Spacing, in abstract units. A viewer scales; it does not re-place. */
export const COLUMN_WIDTH = 1600;
export const LAYER_HEIGHT = 420;
export const RANK_WIDTH = 220;
export const DEPTH_STEP = 360;

/**
 * PURE. Declared edges, split into resolved and dangling. An undeclared pair is no
 * edge at all: nothing here infers a relation from a name, an area or a timestamp.
 * @param {ReadonlyArray<Entry>} entries @param {ReadonlySet<string>} known
 * @returns {{ edges: GraphEdge[], dangling: GraphEdge[] }}
 */
export function declaredEdges(entries, known) {
  /** @type {GraphEdge[]} */
  const edges = [];
  /** @type {GraphEdge[]} */
  const dangling = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const entry of entries) {
    for (const to of entry.dependencies) {
      const id = `${entry.id}\u0000${to}`;
      if (seen.has(id)) continue;
      seen.add(id);
      // A self-dependency is a declaration error, not a layer: it would make every
      // depth infinite. It is reported as dangling-shaped data, never as an edge.
      if (to === entry.id) dangling.push({ from: entry.id, to });
      else if (known.has(to)) edges.push({ from: entry.id, to });
      else dangling.push({ from: entry.id, to });
    }
  }
  return { edges, dangling };
}

/**
 * PURE. Longest dependency path from each node, memoised. A cell that depends on
 * nothing is layer 0. A CYCLE does not hang and does not throw: the walk stops and
 * says a cycle exists, because a graph the human can see is worth more than a refusal.
 * @param {ReadonlyArray<Entry>} entries @param {ReadonlyArray<GraphEdge>} edges
 * @returns {{ layerOf: Map<string, number>, cycle: boolean }}
 */
export function depthLayers(entries, edges) {
  /** @type {Map<string, string[]>} */
  const out = new Map(entries.map((e) => [e.id, []]));
  for (const edge of edges) out.get(edge.from)?.push(edge.to);
  /** @type {Map<string, number>} */
  const layerOf = new Map();
  /** @type {Set<string>} */
  const visiting = new Set();
  let cycle = false;

  /** @type {(id: string) => number} */
  const depth = (id) => {
    const memo = layerOf.get(id);
    if (memo !== undefined) return memo;
    if (visiting.has(id)) { cycle = true; return 0; }
    visiting.add(id);
    const targets = out.get(id) ?? [];
    let deepest = -1;
    for (const target of targets) deepest = Math.max(deepest, depth(target));
    visiting.delete(id);
    const value = deepest + 1;
    layerOf.set(id, value);
    return value;
  };
  for (const entry of entries) depth(entry.id);
  return { layerOf, cycle };
}

/**
 * PURE. The whole graph, positions included.
 * @param {Model} model
 * @returns {{ nodes: GraphNode[], edges: GraphEdge[], dangling: GraphEdge[],
 *   layout: { columns: string[], layers: number }, cycle: boolean }}
 */
export function buildGraph(model) {
  const known = new Set(model.entries.map((e) => e.id));
  const { edges, dangling } = declaredEdges(model.entries, known);
  const { layerOf, cycle } = depthLayers(model.entries, edges);
  const layers = Math.max(1, ...[...layerOf.values()].map((n) => n + 1));

  // Two passes over the nodes: how many share each (column, layer) cell, then where
  // each one sits inside it. Two linear passes, never a comparison of every pair.
  /** @type {Map<string, number>} */
  const total = new Map();
  /** @type {(entry: Entry) => string} */
  const cellKey = (entry) => `${entry.status}/${layerOf.get(entry.id) ?? 0}`;
  for (const entry of model.entries) {
    total.set(cellKey(entry), (total.get(cellKey(entry)) ?? 0) + 1);
  }
  /** @type {Map<string, number>} */
  const used = new Map();
  const columns = [...STATUSES];
  const middle = (columns.length - 1) / 2;

  const nodes = model.entries.map((entry) => {
    const layer = layerOf.get(entry.id) ?? 0;
    const key = cellKey(entry);
    const rank = used.get(key) ?? 0;
    used.set(key, rank + 1);
    const shared = total.get(key) ?? 1;
    const column = columns.indexOf(entry.status);
    // The rank spreads symmetrically inside the column, so adding a cell moves its
    // neighbours by a predictable half-step instead of reshuffling the picture.
    const x = Math.round((column - middle) * COLUMN_WIDTH + (rank - (shared - 1) / 2) * RANK_WIDTH);
    return {
      id: entry.id,
      name: entry.name,
      status: entry.status,
      column,
      layer,
      x,
      y: Math.round(layer * LAYER_HEIGHT),
      z: Math.round((layer - (layers - 1) / 2) * DEPTH_STEP),
    };
  });

  return { nodes, edges, dangling, layout: { columns, layers }, cycle };
}
