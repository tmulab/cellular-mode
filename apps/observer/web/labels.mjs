// labels.mjs — runs in the BROWSER. Labels as HTML overlaid on the canvas, not as sprites
// inside the scene. Three reasons, all of them visible on screen:
//   1. DOM text is crisp at any zoom; a scaled canvas texture turns to mush;
//   2. the size is CONSTANT in pixels — a sprite is sized in world units;
//   3. it sits ABOVE the canvas, so no edge can cross the text.
//
// Ported from the original dashboard's `rotulos.mjs`.
import { Vector3 } from '../vendor/three@0.180.0/three.module.min.js';

const CLEARANCE = 60;   // how far the chip sits from the node, in world units
const DIMMED = 0.1;

/** @typedef {{ id: string, name?: string, status?: string, x: number, y: number, z: number }} GraphNode */

/**
 * @param {HTMLElement} host
 * @param {ReadonlyArray<GraphNode>} nodes
 * @param {import('../vendor/three@0.180.0/three.module.min.js').Camera} camera
 * @param {(node: GraphNode) => string} describe the chip's text, from the view-model
 */
export function createLabels(host, nodes, camera, describe) {
  const layer = document.createElement('div');
  layer.className = 'labels';
  host.appendChild(layer);

  const items = nodes.map((node, index) => {
    const chip = document.createElement('div');
    chip.className = `chip status-${node.status ?? 'unknown'}`;
    chip.textContent = describe(node);
    layer.appendChild(chip);
    // Alternate above/below: two neighbouring nodes do not collide their labels.
    return { chip, point: new Vector3(), id: node.id, node, above: index % 2 === 0 };
  });

  /** @type {Set<string> | null} */
  let near = null;

  /** @param {{ chip: HTMLElement, point: Vector3, id: string, node: GraphNode, above: boolean }} item
   * @param {number} width @param {number} height */
  const place = (item, width, height) => {
    item.point.set(item.node.x, item.node.y + (item.above ? CLEARANCE : -CLEARANCE), item.node.z)
      .project(camera);
    const x = (item.point.x * 0.5 + 0.5) * width;
    const y = (-item.point.y * 0.5 + 0.5) * height;
    const inside = item.point.z < 1 && x > -160 && x < width + 160 && y > -60 && y < height + 60;
    item.chip.style.display = inside ? 'block' : 'none';
    if (!inside) return;
    item.chip.style.transform = `translate(-50%, ${item.above ? '-100%' : '0%'})`
      + ` translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    item.chip.style.opacity = near === null || near.has(item.id) ? '1' : String(DIMMED);
  };

  return {
    /** @param {Set<string> | null} set */
    highlight(set) { near = set; },
    update() {
      const width = host.clientWidth;
      const height = host.clientHeight;
      for (const item of items) place(item, width, height);
    },
    /** Above this many nodes the chips are hidden: 500 labels are an unreadable mat, and
     * the cells table is the complete reading of the same data.
     * @param {boolean} visible */
    setVisible(visible) {
      layer.hidden = !visible;
    },
    dispose() { layer.remove(); },
  };
}
