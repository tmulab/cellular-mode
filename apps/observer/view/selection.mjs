// selection.mjs — the selection STATE MACHINE, one for both views. Ported from the
// original dashboard's `selecao.mjs`, with one change: the original held a DOM element
// for the detail panel, so the machine could only run in a browser. Here the panel is an
// adapter (`show`/`hide`), which makes the whole machine DOM-free and therefore testable
// in node — criterion D9.
//
// What varies between the 2D projection and the 3D scene is only HOW you paint and HOW
// you approach. Those two enter as adapters. Neighbours, focus, the detail request and
// clearing live here and are identical, which is why neither view owns a copy: the 2D
// mirroring the 3D's logic is how two views drift apart one fix at a time.

/**
 * @typedef {{ from: string, to: string }} Edge
 * @typedef {{ id: string }} GraphNode
 * @typedef {object} Adapters
 * @property {() => ReadonlyArray<Edge>} edges current edge list (re-read on every call:
 *   the model is refetched, and a captured array would silently go stale)
 * @property {(near: Set<string> | null) => void} paint `null` means "no selection"
 * @property {(node: GraphNode) => void} [focus] bring the node closer, view's own way
 * @property {(node: GraphNode) => void} [show] open the detail panel for this node
 * @property {() => void} [hide] close the detail panel
 */

/** @param {Adapters} adapters */
export function createSelection({ edges, paint, focus, show, hide }) {
  /** @type {string | null} */
  let focused = null;

  /** PURE over the edge list: the node plus everything one declared dependency away.
   * @param {string} id @returns {Set<string>} */
  const neighbours = (id) => {
    const near = new Set([id]);
    for (const edge of edges()) {
      if (edge.from === id) near.add(edge.to);
      if (edge.to === id) near.add(edge.from);
    }
    return near;
  };

  /** @param {{ notify?: boolean }} [options] */
  function clear({ notify = true } = {}) {
    focused = null;
    if (notify) hide?.();
    paint(null);
  }

  return {
    /** Hover: highlight without fixing. With no target, fall back to what is focused —
     * moving the pointer off a node must not undo a deliberate click.
     * @param {GraphNode | null} node */
    hover(node) {
      if (focused !== null && node === null) return paint(neighbours(focused));
      paint(node === null ? null : neighbours(node.id));
    },

    /** Click: fix the selection, open the detail panel, approach. Identical in both
     * views, which is the point of this module.
     *
     * `notify: false` is for a selection that came from OUTSIDE this view — the page
     * mirroring into the graph a cell the table already opened. The panel is open
     * already; asking for it again is how `show → mirror → select` becomes an infinite
     * recursion, so a mirrored selection paints and approaches and says nothing back.
     * @param {GraphNode | null} node @param {{ notify?: boolean }} [options] */
    select(node, { notify = true } = {}) {
      if (node === null) return clear({ notify });
      focused = node.id;
      paint(neighbours(node.id));
      if (notify) show?.(node);
      focus?.(node);
      return undefined;
    },

    clear,

    /** The model can be refetched while a node is focused; the highlight has to come
     * back on its own rather than being lost to a redraw. */
    reapply() {
      paint(focused === null ? null : neighbours(focused));
    },

    focused: () => focused,
    neighbours,
  };
}
