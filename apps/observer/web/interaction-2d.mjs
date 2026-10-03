// interaction-2d.mjs — runs in the BROWSER. The 2D ADAPTER for the shared selection
// machine: how to find the node under the pointer, how to paint in SVG, how to approach
// with the zoom. The selection LOGIC does not live here — it lives in
// `../view/selection.mjs`, shared with the 3D scene (criterion D9).
//
// Ported from the original dashboard's `interacao2d.mjs`.
import { createSelection } from '../view/selection.mjs';

/** The SVG arrives with everything already on it: identity, status and both ends of each
 * edge. The client re-derives no graph — it reads what the server computed.
 * @param {Element} group @returns {{ id: string, status: string, x: number, y: number }} */
function nodeData(group) {
  const read = (/** @type {string} */ name) => group.getAttribute(name) ?? '';
  return {
    id: read('data-id'),
    status: read('data-status'),
    x: Number(read('data-x')),
    y: Number(read('data-y')),
  };
}

/**
 * @param {object} wiring
 * @param {HTMLElement} wiring.host the element holding the `<svg>`
 * @param {{ focus: (x: number, y: number) => void }} wiring.zoom
 * @param {() => ReadonlyArray<{ from: string, to: string }>} wiring.edges
 * @param {(id: string) => void} wiring.onSelect
 * @param {() => void} wiring.onClear
 */
export function createInteraction2d({ host, zoom, edges, onSelect, onClear }) {
  // `elementFromPoint` rather than `event.target`: with the SVG transformed by the zoom the
  // event target is not always the node's group, but the point on screen always is.
  /** @param {PointerEvent | MouseEvent} event @returns {Element | null} */
  const nodeAt = (event) => {
    const found = document.elementFromPoint(event.clientX, event.clientY);
    const start = found ?? /** @type {Element | null} */ (event.target);
    return start === null ? null : start.closest('.node');
  };

  const selection = createSelection({
    edges,
    paint: (near) => {
      for (const node of host.querySelectorAll('.node')) {
        node.classList.toggle('dimmed', near !== null && !near.has(node.getAttribute('data-id') ?? ''));
      }
      for (const edge of host.querySelectorAll('.edge')) {
        const inside = near !== null
          && near.has(edge.getAttribute('data-from') ?? '')
          && near.has(edge.getAttribute('data-to') ?? '');
        edge.classList.toggle('lit', inside);
        edge.classList.toggle('dimmed', near !== null && !inside);
      }
    },
    focus: (node) => {
      const data = /** @type {{ x?: number, y?: number }} */ (node);
      if (typeof data.x === 'number' && typeof data.y === 'number') zoom.focus(data.x, data.y);
    },
    show: (node) => onSelect(node.id),
    hide: onClear,
  });

  host.addEventListener('pointermove', (event) => {
    if (event.buttons !== 0) return;                 // dragging: do not repaint
    const group = nodeAt(event);
    selection.hover(group === null ? null : nodeData(group));
    host.style.cursor = group === null ? 'grab' : 'pointer';
  });

  host.addEventListener('click', (event) => {
    if (host.dataset['dragged'] !== undefined) return;   // that was a drag, not a click
    const group = nodeAt(event);
    selection.select(group === null ? null : nodeData(group));
  });

  // Keyboard: every node group is focusable, so Enter selects whatever is focused and
  // Escape clears. The graph is navigable with no pointer at all.
  host.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') return selection.clear();
    if (event.key !== 'Enter' && event.key !== ' ') return undefined;
    const target = /** @type {Element | null} */ (event.target);
    const group = target === null ? null : target.closest('.node');
    if (group === null) return undefined;
    event.preventDefault();
    selection.select(nodeData(group));
    return undefined;
  });

  // Both of these are driven BY the page (the table opened a cell, the panel was closed),
  // so neither notifies back: the page already knows, and telling it again is a loop.
  return {
    reapply: () => selection.reapply(),
    clear: () => selection.clear({ notify: false }),
    /** @param {string} id */
    selectById(id) {
      const group = host.querySelector(`.node[data-id="${CSS.escape(id)}"]`);
      selection.select(group === null ? null : nodeData(group), { notify: false });
    },
    focused: () => selection.focused(),
  };
}
