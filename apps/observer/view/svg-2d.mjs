// svg-2d.mjs — the 2D projection: the SAME model the 3D scene shows, with z discarded.
// Not a second drawing — the same thing seen from above. PURE: a `graph` payload in, an
// SVG string out, so the default view of this application is fully testable in node.
//
// THE SCENE COMPUTES NOTHING (the principle this port keeps from the original): every
// x/y comes from the server's `graph` capability. What happens here is the two things a
// projection is allowed to do — flip the y axis (SVG grows down, the model grows up) and
// pick a viewBox that contains the given points. No layout arithmetic.
//
// Status is a SHAPE, never only a colour (D8). The outlines below are shape geometry,
// not position: a square is a square wherever the server put it.
import { statusDescriptor } from './view-model.mjs';

const MARGIN = 60;
const RADIUS = 26;
const HIT_RADIUS = 40;

/** Above this many nodes the labels go, the nodes stay: at 500 cells the text is an
 * unreadable mat and the shape field is still informative. The cells table is the
 * complete reading of the same data, so nothing is lost — only deferred. */
export const LABEL_LIMIT = 160;

/** @typedef {{ id: string, name?: string, status?: string, x: number, y: number }} GraphNode */
/** @typedef {{ from: string, to: string }} Edge */

/** PURE. XML text escape. @param {unknown} value @returns {string} */
export function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** PURE. A regular polygon outline, point-up, as `x,y` pairs.
 * @param {number} sides @param {number} radius @returns {string} */
export function polygonPoints(sides, radius) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = ((index * (360 / sides) - 90) * Math.PI) / 180;
    return `${Math.round(radius * Math.cos(angle))},${Math.round(radius * Math.sin(angle))}`;
  }).join(' ');
}

/** PURE. The outline for a status shape. `circle` is the one that is not a polygon.
 * @param {string} shape @returns {string} */
export function shapeMarkup(shape) {
  if (shape === 'circle') return `<circle class="glyph" r="${RADIUS}" />`;
  const sides = { square: 4, diamond: 4, triangle: 3, hexagon: 6 }[shape] ?? 6;
  const rotation = shape === 'square' ? ' transform="rotate(45)"' : '';
  return `<polygon class="glyph" points="${polygonPoints(sides, RADIUS)}"${rotation} />`;
}

/** PURE. The subgraph a focused cell shows: itself and everything one declared
 * dependency away. The overview passes `null` and gets everything.
 * @param {ReadonlyArray<GraphNode>} nodes @param {ReadonlyArray<Edge>} edges
 * @param {string | null} focus
 * @returns {{ nodes: GraphNode[], edges: Edge[] }} */
export function subgraph(nodes, edges, focus) {
  if (focus === null) return { nodes: [...nodes], edges: [...edges] };
  const near = new Set([focus]);
  for (const edge of edges) {
    if (edge.from === focus) near.add(edge.to);
    if (edge.to === focus) near.add(edge.from);
  }
  return {
    nodes: nodes.filter((node) => near.has(node.id)),
    edges: edges.filter((edge) => near.has(edge.from) && near.has(edge.to)),
  };
}

/** PURE. The viewBox that contains every given point, with a margin. An empty graph
 * still gets a valid box: a drawing of nothing must not be a crash.
 * @param {ReadonlyArray<GraphNode>} nodes @returns {{ minX: number, minY: number, width: number, height: number }} */
export function viewBoxOf(nodes) {
  if (nodes.length === 0) return { minX: -100, minY: -100, width: 200, height: 200 };
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => -node.y);
  const minX = Math.min(...xs) - MARGIN;
  const minY = Math.min(...ys) - MARGIN;
  return {
    minX: Math.round(minX),
    minY: Math.round(minY),
    width: Math.round(Math.max(...xs) + MARGIN - minX),
    height: Math.round(Math.max(...ys) + MARGIN - minY),
  };
}

/** @param {ReadonlyArray<Edge>} edges @param {Map<string, GraphNode>} byId
 * @param {Set<string>} dangling @returns {string} */
function edgeMarkup(edges, byId, dangling) {
  return edges.map((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (from === undefined || to === undefined) return '';
    const key = `${edge.from}\u0000${edge.to}`;
    const classes = dangling.has(key) ? 'edge dangling' : 'edge';
    return `<line class="${classes}" data-from="${escapeXml(edge.from)}" data-to="${escapeXml(edge.to)}"`
      + ` x1="${Math.round(from.x)}" y1="${Math.round(-from.y)}"`
      + ` x2="${Math.round(to.x)}" y2="${Math.round(-to.y)}" />`;
  }).join('');
}

/** PURE. The length of the longest name a label will carry, in characters.
 * @param {ReadonlyArray<GraphNode>} nodes @returns {number} */
export function longestName(nodes) {
  return nodes.reduce((longest, node) => Math.max(longest, String(node.name ?? node.id).length), 0);
}

/** @param {ReadonlyArray<GraphNode>} nodes @param {boolean} withLabels @returns {string} */
function nodeMarkup(nodes, withLabels) {
  return nodes.map((node) => {
    const status = statusDescriptor(node.status);
    const x = Math.round(node.x);
    const y = Math.round(-node.y);
    const name = escapeXml(node.name ?? node.id);
    // The label travels in its own group, placed once here and RE-placed by the view at
    // every scale (`view/fit-2d.mjs`): text that rides the drawing down becomes four pixels
    // tall on a wide graph. The attribute below is what a reader with no script would see.
    const label = withLabels
      ? `<g class="label" transform="translate(0,${RADIUS + 26})">`
        + `<text class="name" y="0">${name}</text>`
        + `<text class="sub" y="22">${escapeXml(status.symbol)} ${escapeXml(status.label)}</text></g>`
      : '';
    // The accessible name travels with the node, labels or not: a shape with no text is
    // still announced by a screen reader, and the table remains the full reading.
    return `<g class="node status-${escapeXml(status.key)}" role="listitem"`
      + ` data-id="${escapeXml(node.id)}" data-status="${escapeXml(status.key)}"`
      + ` data-x="${x}" data-y="${y}" tabindex="0"`
      + ` aria-label="${name} — ${escapeXml(status.label)}" transform="translate(${x},${y})">`
      + `<circle class="hit" r="${HIT_RADIUS}" />${shapeMarkup(status.shape)}${label}</g>`;
  }).join('');
}

/** PURE. The whole projection.
 * @param {unknown} graph @param {{ focus?: string | null }} [options] @returns {string} */
export function svgGraph(graph, options = {}) {
  const source = /** @type {Record<string, unknown>} */ (graph ?? {});
  const allNodes = /** @type {GraphNode[]} */ (Array.isArray(source['nodes']) ? source['nodes'] : []);
  const allEdges = /** @type {Edge[]} */ (Array.isArray(source['edges']) ? source['edges'] : []);
  const danglingList = /** @type {Edge[]} */ (Array.isArray(source['dangling']) ? source['dangling'] : []);
  const { nodes, edges } = subgraph(allNodes, allEdges, options.focus ?? null);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const dangling = new Set(danglingList.map((edge) => `${edge.from}\u0000${edge.to}`));
  const box = viewBoxOf(nodes);
  const withLabels = nodes.length <= LABEL_LIMIT;
  // A dangling edge names a cell that does not exist, so it HAS no position and cannot be
  // drawn. It is not invented at the margin either: it is reported as a warning in the
  // project area, and the count travels in the accessible name so the drawing never
  // claims to be the whole truth.
  const caption = `${nodes.length} cells, ${edges.length} declared dependencies`
    + `, ${dangling.size} dangling (listed as warnings, not drawn)`;
  // How long the longest NAME is, so the view can reserve room for it when it frames the
  // drawing (`view/fit-2d.mjs`). Zero when no label is drawn — nothing to keep clear.
  const labelChars = withLabels ? longestName(nodes) : 0;
  return `<svg viewBox="${box.minX} ${box.minY} ${box.width} ${box.height}" width="100%" height="100%"`
    + ' preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"'
    + ` role="list" aria-label="cell graph: ${caption}" data-labels="${withLabels}"`
    + ` data-label-chars="${labelChars}" data-dangling="${dangling.size}">`
    + `<g class="edges">${edgeMarkup(edges, byId, dangling)}</g>`
    + `<g class="nodes">${nodeMarkup(nodes, withLabels)}</g></svg>`;
}
