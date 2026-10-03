// D10 — the 2D projection. The default view of the application, and a pure function, so it
// is tested here rather than left to the eye.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LABEL_LIMIT, escapeXml, polygonPoints, shapeMarkup, subgraph, svgGraph, viewBoxOf,
} from '../view/svg-2d.mjs';

const read = (/** @type {string} */ name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const FIXTURE = read('observer-state.json');
const BIG = read('observer-state-500.json');

describe('D10 · positions come from the server, never from the browser', () => {
  test('every node is drawn at the x the payload gave, with only the y axis flipped', () => {
    const svg = svgGraph(FIXTURE.graph);
    for (const node of FIXTURE.graph.nodes) {
      assert.ok(svg.includes(`data-x="${node.x}" data-y="${-node.y}"`),
        `${node.id} must be placed at the server's coordinates`);
      assert.ok(svg.includes(`transform="translate(${node.x},${-node.y})"`));
    }
  });

  test('the module contains no layout arithmetic beyond flipping y and framing the box', () => {
    const text = readFileSync(new URL('../view/svg-2d.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(text, /Math\.(sin|cos|atan2)\s*\([^)]*(node|layer|column)/i,
      'a position computed here would be a second layout');
  });

  test('the viewBox contains every point, and an empty graph still produces one', () => {
    const box = viewBoxOf(FIXTURE.graph.nodes);
    const xs = FIXTURE.graph.nodes.map((/** @type {{x: number}} */ n) => n.x);
    assert.ok(box.minX < Math.min(...xs));
    assert.ok(box.minX + box.width > Math.max(...xs));
    assert.deepEqual(viewBoxOf([]), { minX: -100, minY: -100, width: 200, height: 200 });
  });
});

describe('D10 · edges are only what the cells declared', () => {
  test('one line per declared dependency, each naming both ends', () => {
    const svg = svgGraph(FIXTURE.graph);
    assert.equal(svg.split('class="edge"').length - 1, FIXTURE.graph.edges.length);
    for (const edge of FIXTURE.graph.edges) {
      assert.ok(svg.includes(`data-from="${edge.from}" data-to="${edge.to}"`));
    }
  });

  test('a dangling edge is counted and declared, never drawn at a made-up position', () => {
    const svg = svgGraph(FIXTURE.graph);
    assert.ok(svg.includes('data-dangling="1"'));
    assert.match(svg, /1 dangling \(listed as warnings, not drawn\)/);
    assert.ok(!svg.includes('data-to="model-adapters"'), 'a cell that does not exist has no position');
  });
});

describe('D10 · status is a shape, and the shapes differ', () => {
  test('each status draws a different outline, and none of them is only a colour', () => {
    const svg = svgGraph(FIXTURE.graph);
    assert.ok(svg.includes('<circle class="glyph"'), 'active is a circle');
    assert.equal(polygonPoints(6, 26).split(' ').length, 6);
    assert.equal(polygonPoints(3, 26).split(' ').length, 3);
    assert.match(shapeMarkup('square'), /rotate\(45\)/, 'the square is a rotated quad, visibly not a diamond');
    assert.notEqual(shapeMarkup('triangle'), shapeMarkup('hexagon'));
  });

  test('every node carries an accessible name with the status word in it', () => {
    const svg = svgGraph(FIXTURE.graph);
    assert.ok(svg.includes('aria-label="Observer dashboard — active"'));
    assert.equal(svg.split('tabindex="0"').length - 1, FIXTURE.graph.nodes.length);
  });
});

describe('D10 · 500 cells stay usable', () => {
  test('above the level-of-detail limit the labels go and the nodes stay', () => {
    assert.ok(BIG.graph.nodes.length > LABEL_LIMIT);
    const svg = svgGraph(BIG.graph);
    assert.ok(svg.includes('data-labels="false"'));
    assert.equal(svg.split('class="node ').length - 1, BIG.graph.nodes.length);
    assert.equal(svg.split('class="name"').length - 1, 0, 'no per-node text above the limit');
  });

  test('below the limit the labels are there', () => {
    const svg = svgGraph(FIXTURE.graph);
    assert.ok(svg.includes('data-labels="true"'));
    assert.equal(svg.split('class="name"').length - 1, FIXTURE.graph.nodes.length);
  });

  test('the focused view is the cell and one declared step around it', () => {
    const { nodes, edges } = subgraph(BIG.graph.nodes, BIG.graph.edges, 'demo-cell-100');
    assert.ok(nodes.length < 10, `a focused view must be small, got ${nodes.length}`);
    assert.ok(nodes.some((node) => node.id === 'demo-cell-100'));
    for (const edge of edges) {
      assert.ok(edge.from === 'demo-cell-100' || edge.to === 'demo-cell-100');
    }
    const svg = svgGraph(BIG.graph, { focus: 'demo-cell-100' });
    assert.ok(svg.includes('data-labels="true"'), 'a focused view is small enough for labels');
  });
});

describe('D10 · every value written into the markup is escaped', () => {
  test('angle brackets, quotes and ampersands cannot leave the text', () => {
    assert.equal(escapeXml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    const svg = svgGraph({
      nodes: [{ id: '"><script>alert(1)</script>', name: '<b>&</b>', status: 'active', x: 0, y: 0 }],
      edges: [], dangling: [],
    });
    assert.ok(!svg.includes('<script>'), 'a crafted cell id must not become an element');
    assert.ok(svg.includes('&lt;script&gt;'));
  });

  test('a malformed payload draws nothing rather than throwing', () => {
    assert.match(svgGraph(null), /^<svg /);
    assert.match(svgGraph({ nodes: 'not a list' }), /^<svg /);
  });
});
