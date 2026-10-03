// graph-view.mjs — runs in the BROWSER. The graph panel: the 2D projection (default) and
// the optional 3D view sharing ONE container, because they are two views of one model, not
// two screens. The toggle chooses which is shown; the 3D modules — and three.js with them —
// are imported only the first time someone asks for 3D.
//
// Two reading modes, both from the same payload: OVERVIEW (every cell) and FOCUSED (one cell
// and everything one declared dependency away), which is what makes a 500-cell graph usable
// without inventing a layout.
import { svgGraph } from '../view/svg-2d.mjs';
import { createZoom2d } from './zoom-2d.mjs';
import { createInteraction2d } from './interaction-2d.mjs';

/** @typedef {{ from: string, to: string }} Edge */

/**
 * @param {object} wiring
 * @param {HTMLElement} wiring.flat the 2D container
 * @param {HTMLElement} wiring.deep the 3D container
 * @param {HTMLElement} wiring.caption
 * @param {(id: string) => void} wiring.onSelect
 * @param {() => void} wiring.onClear
 */
export function createGraphView({ flat, deep, caption, onSelect, onClear }) {
  /** @type {unknown} */
  let graph = null;
  /** @type {string | null} */
  let focus = null;
  /** @type {'2d' | '3d'} */
  let mode = '2d';
  /** @type {{ fit: () => void, selectById: (id: string) => void, dispose: () => void } | null} */
  let scene = null;

  const zoom = createZoom2d(flat);
  const interaction = createInteraction2d({
    host: flat,
    zoom,
    edges: () => {
      const source = /** @type {Record<string, unknown>} */ (graph ?? {});
      return /** @type {Edge[]} */ (Array.isArray(source['edges']) ? source['edges'] : []);
    },
    onSelect,
    onClear,
  });

  // The panel's height follows its width (`.canvas` carries an aspect ratio), so a resize
  // changes the scale the labels are counter-scaled against. Re-applying is cheap and keeps
  // them at their readable size instead of leaving them wrong until the next repaint.
  window.addEventListener('resize', () => { if (mode === '2d') zoom.apply(); });

  const paint2d = () => {
    // The ONLY markup-from-string in the application, and the string comes from
    // `view/svg-2d.mjs`, which escapes every value it writes and is tested for it.
    flat.innerHTML = svgGraph(graph, { focus });
    zoom.apply();
    const svg = flat.querySelector('svg');
    const counted = svg === null ? '' : svg.getAttribute('aria-label') ?? '';
    caption.textContent = `${focus === null ? 'overview' : `focused on ${focus}`} — ${counted.replace(/^cell graph: /, '')}`;
    interaction.reapply();
  };

  return {
    /** @param {unknown} value */
    setGraph(value) {
      graph = value;
      if (mode !== '2d') {
        scene?.dispose();
        scene = null;
        return undefined;
      }
      paint2d();
      // The INITIAL view is the fit, not the raw viewBox mapping: a model arriving in a
      // panel it does not match is exactly the case `fit` was written for, and asking the
      // reader to press a button before the drawing is legible is not a default.
      zoom.fit();
      return undefined;
    },

    /** @param {string | null} id */
    setFocus(id) {
      focus = id;
      if (mode === '2d') paint2d();
      // Returning to the overview is returning to the initial view, so it is framed again:
      // leaving the reader at the magnification of a cell they just closed, looking at an
      // empty corner of a graph they did not ask to be inside, is not "clear".
      if (id === null && mode === '2d') zoom.fit();
      if (id !== null) {
        if (mode === '3d') scene?.selectById(id);
        else interaction.selectById(id);
      }
    },

    mode: () => mode,

    /** @param {'2d' | '3d'} next @returns {Promise<void>} */
    async setMode(next) {
      mode = next;
      flat.hidden = next === '3d';
      deep.hidden = next !== '3d';
      if (next === '2d') {
        scene?.dispose();
        scene = null;
        paint2d();
        return;
      }
      // Lazy import: a reader who stays in 2D never downloads the vendored three.js.
      // Guarded: three.js blocked, or a machine with no WebGL, must cost the reader the
      // OPTIONAL view and nothing else. An empty panel and an uncaught rejection is how a
      // secondary view takes the proven one down with it.
      try {
        const { mountScene } = await import('./scene-3d.mjs');
        scene = mountScene(deep, graph, { onSelect, onClear });
      } catch (cause) {
        mode = '2d';
        flat.hidden = false;
        deep.hidden = true;
        scene = null;
        paint2d();
        caption.textContent = `3D is not available here (${String(cause)}) — showing 2D`;
        return;
      }
      if (focus !== null) scene.selectById(focus);
      caption.textContent = `3D view — ${focus === null ? 'overview' : `focused on ${focus}`}`;
    },

    fit() {
      if (mode === '3d') scene?.fit();
      else zoom.fit();
    },

    /** Keyboard equivalents for the pointer gestures, so the panel is usable without one.
     * @param {string} key @returns {boolean} true when the key was consumed */
    handleKey(key) {
      if (mode === '3d') return false;          // the 3D view binds its own arrow keys
      const step = 60;
      if (key === 'ArrowLeft') { zoom.nudge(step, 0); return true; }
      if (key === 'ArrowRight') { zoom.nudge(-step, 0); return true; }
      if (key === 'ArrowUp') { zoom.nudge(0, step); return true; }
      if (key === 'ArrowDown') { zoom.nudge(0, -step); return true; }
      if (key === '+' || key === '=') { zoom.scaleBy(1.2); return true; }
      if (key === '-') { zoom.scaleBy(1 / 1.2); return true; }
      if (key === '0') { zoom.fit(); return true; }
      return false;
    },

    clearSelection() {
      interaction.clear();
    },
  };
}
