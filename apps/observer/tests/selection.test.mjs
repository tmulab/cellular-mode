// D9 — the selection state machine. Ported from what the original dashboard verified about
// it, keeping only what is generic: the original's assertions about package names and key
// counts belonged to a private project and are not reproduced.
//
// The machine is DOM-free, so these tests are the real coverage of the behaviour both views
// share — not a stand-in for a browser test.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSelection } from '../view/selection.mjs';

const EDGES = [
  { from: 'b', to: 'a' },
  { from: 'c', to: 'b' },
  { from: 'd', to: 'a' },
];

/** A recording harness: the adapters are what differ between the 2D and the 3D view, so
 * the test supplies trivial ones and watches what the machine asks of them. */
function harness(edges = EDGES) {
  /** @type {Array<Set<string> | null>} */
  const painted = [];
  /** @type {string[]} */
  const focused = [];
  /** @type {string[]} */
  const shown = [];
  let hidden = 0;
  const selection = createSelection({
    edges: () => edges,
    paint: (near) => painted.push(near),
    focus: (node) => focused.push(node.id),
    show: (node) => shown.push(node.id),
    hide: () => { hidden += 1; },
  });
  return { selection, painted, focused, shown, hidden: () => hidden };
}

describe('D9 · neighbours come from the declared edges only', () => {
  test('a node plus everything one declared dependency away, in both directions', () => {
    const { selection } = harness();
    assert.deepEqual([...selection.neighbours('b')].sort(), ['a', 'b', 'c']);
    assert.deepEqual([...selection.neighbours('a')].sort(), ['a', 'b', 'd']);
  });

  test('a node with no edges is its own only neighbour — nothing is inferred', () => {
    const { selection } = harness();
    assert.deepEqual([...selection.neighbours('lonely')], ['lonely']);
  });

  test('the edge list is re-read on every call, so a refetched model is not stale', () => {
    let edges = [{ from: 'b', to: 'a' }];
    const selection = createSelection({ edges: () => edges, paint: () => {} });
    assert.equal(selection.neighbours('a').size, 2);
    edges = [];
    assert.equal(selection.neighbours('a').size, 1);
  });
});

describe('D9 · one machine, the same behaviour for either painting', () => {
  test('hover highlights without fixing', () => {
    const { selection, painted, shown } = harness();
    selection.hover({ id: 'b' });
    assert.deepEqual([...(painted[0] ?? [])].sort(), ['a', 'b', 'c']);
    assert.equal(selection.focused(), null, 'hovering must not fix a selection');
    assert.deepEqual(shown, [], 'hovering must not open the detail panel');
  });

  test('hover off a node returns to what is FOCUSED, not to nothing', () => {
    const { selection, painted } = harness();
    selection.select({ id: 'b' });
    selection.hover(null);
    assert.deepEqual([...(painted[painted.length - 1] ?? [])].sort(), ['a', 'b', 'c']);
  });

  test('hover off a node with nothing focused clears the highlight', () => {
    const { selection, painted } = harness();
    selection.hover(null);
    assert.equal(painted[0], null);
  });

  test('click fixes, opens the detail panel and approaches — all three, once', () => {
    const { selection, painted, focused, shown } = harness();
    selection.select({ id: 'c' });
    assert.equal(selection.focused(), 'c');
    assert.deepEqual([...(painted[0] ?? [])].sort(), ['b', 'c']);
    assert.deepEqual(focused, ['c']);
    assert.deepEqual(shown, ['c']);
  });

  test('clicking nothing clears: no focus, panel hidden, highlight gone', () => {
    const h = harness();
    h.selection.select({ id: 'c' });
    h.selection.select(null);
    assert.equal(h.selection.focused(), null);
    assert.equal(h.hidden(), 1);
    assert.equal(h.painted[h.painted.length - 1], null);
  });

  test('reapply restores the highlight after the model is redrawn', () => {
    const { selection, painted } = harness();
    selection.select({ id: 'b' });
    selection.reapply();
    assert.deepEqual([...(painted[painted.length - 1] ?? [])].sort(), ['a', 'b', 'c']);
  });

  test('reapply with nothing focused paints nothing, rather than guessing', () => {
    const { selection, painted } = harness();
    selection.reapply();
    assert.equal(painted[0], null);
  });

  test('the optional adapters really are optional: a view may skip focus and panel', () => {
    /** @type {Array<Set<string> | null>} */
    const painted = [];
    const selection = createSelection({ edges: () => EDGES, paint: (near) => painted.push(near) });
    selection.select({ id: 'a' });
    selection.clear();
    assert.equal(painted.length, 2);
  });
});

describe('D9 · a selection that came from OUTSIDE is not echoed back', () => {
  test('a quiet select paints and approaches, and does not re-open the panel', () => {
    const { selection, painted, focused, shown } = harness();
    selection.select({ id: 'c' }, { notify: false });
    assert.equal(selection.focused(), 'c');
    assert.deepEqual([...(painted[0] ?? [])].sort(), ['b', 'c']);
    assert.deepEqual(focused, ['c']);
    assert.deepEqual(shown, [], 'the panel is already open: asking for it again is the loop');
  });

  test('a quiet clear drops the highlight and does not re-close the panel', () => {
    const h = harness();
    h.selection.select({ id: 'c' });
    h.selection.clear({ notify: false });
    assert.equal(h.selection.focused(), null);
    assert.equal(h.hidden(), 0);
    assert.equal(h.painted[h.painted.length - 1], null);
  });

  // The regression this pair exists for: the page opens the panel from `show`, and the panel
  // mirrors the choice back into the view. With the mirror notifying, that is an infinite
  // recursion — observed in a browser as "Maximum call stack size exceeded" and one
  // `cell-detail` request per frame of it.
  test('the page wiring (show → mirror → select) terminates', () => {
    let opened = 0;
    let closed = 0;
    /** @type {ReturnType<typeof createSelection>} */
    let selection;
    selection = createSelection({
      edges: () => EDGES,
      paint: () => {},
      show: (node) => { opened += 1; selection.select({ id: node.id }, { notify: false }); },
      hide: () => { closed += 1; selection.clear({ notify: false }); },
    });
    selection.select({ id: 'b' });
    assert.equal(opened, 1);
    selection.clear();
    assert.equal(closed, 1);
    assert.equal(selection.focused(), null);
  });
});

describe('D9 · neither view owns a second copy of the logic', () => {
  test('the 2D and the 3D modules both import the shared machine and define none', async () => {
    const { readFileSync } = await import('node:fs');
    for (const name of ['interaction-2d.mjs', 'scene-3d.mjs']) {
      const text = readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
      assert.match(text, /import \{ createSelection \} from '\.\.\/view\/selection\.mjs'/,
        `${name} must use the shared selection machine`);
      assert.doesNotMatch(text, /const neighbours = /, `${name} must not compute neighbours itself`);
      assert.doesNotMatch(text, /function createSelection/, `${name} must not define a second machine`);
    }
  });
});
