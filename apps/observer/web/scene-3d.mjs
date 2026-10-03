// scene-3d.mjs — runs in the BROWSER. THE SCENE COMPUTES NOTHING: every position comes
// ready from the `graph` capability (positions are computed server-side, deterministically).
// What lives here is three.js and events, and nothing that could make the 3D view disagree
// with the 2D projection about where a cell is.
//
// Ported from the original dashboard's `cena3d.mjs`. The optional view: it is imported only
// when the toggle asks for it, so a reader who never opens 3D never downloads three.js.
import {
  BufferGeometry, CylinderGeometry, Line, LineBasicMaterial, Mesh, MeshBasicMaterial,
  Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from '../vendor/three@0.180.0/three.module.min.js';
import { createOrbit } from './orbit.mjs';
import { POSE, createCamera } from './camera-3d.mjs';
import { createLabels } from './labels.mjs';
import { createSelection } from '../view/selection.mjs';
import { STATUS_COLOUR } from '../view/tokens.mjs';
import { statusDescriptor } from '../view/view-model.mjs';

const DIMMED = 0.1;            // what untangles crossing edges is not the 3D: it is dimming
const OPAQUE = 0.9;
const RADIUS = 8000;           // orthographic: the distance only avoids clipping
const NODE_SIZE = 70;
const LABEL_LIMIT = 160;

/** @typedef {{ id: string, name?: string, status?: string, x: number, y: number, z: number }} GraphNode */
/** @typedef {{ from: string, to: string }} Edge */

/**
 * @param {HTMLElement} host
 * @param {unknown} graph the `graph` capability value, already fetched
 * @param {{ onSelect: (id: string) => void, onClear: () => void }} wiring
 */
export function mountScene(host, graph, wiring) {
  const source = /** @type {Record<string, unknown>} */ (graph ?? {});
  const nodes = /** @type {GraphNode[]} */ (Array.isArray(source['nodes']) ? source['nodes'] : []);
  const edges = /** @type {Edge[]} */ (Array.isArray(source['edges']) ? source['edges'] : []);

  const scene = new Scene();
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  const { camera, centre, resize } = createCamera(
    nodes.map((node) => /** @type {readonly [number, number, number]} */ ([node.x, node.y, node.z])),
    width, height,
  );
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height);
  host.replaceChildren(renderer.domElement);

  const orbit = createOrbit({ camera, canvas: renderer.domElement, target: centre, radius: RADIUS, pose: POSE });

  // A hexagonal prism, not a sphere: the 2D projection draws hexagons for `done` and the two
  // views have to speak the same language. Six radial sides = a hexagon seen face-on.
  const geometry = new CylinderGeometry(1, 1, 0.5, 6);
  /** @type {Map<string, Mesh>} */
  const meshes = new Map();
  /** @type {Map<Mesh, GraphNode>} */
  const nodeOf = new Map();
  for (const node of nodes) {
    const colour = STATUS_COLOUR[statusDescriptor(node.status).key] ?? STATUS_COLOUR['unknown'] ?? '#6b7490';
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ color: colour, transparent: true, opacity: OPAQUE }));
    mesh.position.set(node.x, node.y, node.z);
    mesh.scale.set(NODE_SIZE, NODE_SIZE, NODE_SIZE);
    mesh.rotation.x = Math.PI / 2;     // lay the prism down so the hexagon faces the camera
    scene.add(mesh);
    meshes.set(node.id, mesh);
    nodeOf.set(mesh, node);
  }

  const labels = createLabels(host, nodes, camera, (node) => {
    const status = statusDescriptor(node.status);
    return `${status.symbol} ${node.name ?? node.id}`;
  });
  labels.setVisible(nodes.length <= LABEL_LIMIT);

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lines = edges.map((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (from === undefined || to === undefined) return null;
    const geo = new BufferGeometry().setFromPoints([
      new Vector3(from.x, from.y, from.z),
      new Vector3(to.x, to.y, to.z),
    ]);
    const line = new Line(geo, new LineBasicMaterial({ color: 0x2f3742, transparent: true, opacity: 0.35 }));
    scene.add(line);
    return { line, edge };
  }).filter((entry) => entry !== null);

  // THE SAME state machine as the 2D view (../view/selection.mjs). Only the two things that
  // genuinely differ between the views enter here: how to paint and how to approach.
  const selection = createSelection({
    edges: () => edges,
    paint: (near) => {
      for (const [id, mesh] of meshes) {
        mesh.material.opacity = near === null || near.has(id) ? OPAQUE : DIMMED;
      }
      labels.highlight(near);
      for (const entry of lines) {
        const lit = near === null || (near.has(entry.edge.from) && near.has(entry.edge.to));
        entry.line.material.opacity = lit ? (near === null ? 0.35 : 0.85) : 0.02;
      }
    },
    focus: (node) => {
      const found = byId.get(node.id);
      if (found !== undefined) orbit.focus([found.x, found.y, found.z], 3.2);
    },
    show: (node) => wiring.onSelect(node.id),
    hide: wiring.onClear,
  });

  const ray = new Raycaster();
  const pointer = new Vector2();
  /** @param {PointerEvent | MouseEvent} event @returns {GraphNode | null} */
  const targetOf = (event) => {
    const box = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects([...meshes.values()], false)[0];
    return hit === undefined ? null : (nodeOf.get(/** @type {Mesh} */ (hit.object)) ?? null);
  };

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (event.buttons !== 0) return;                   // dragging: do not repaint
    const node = targetOf(event);
    selection.hover(node);
    renderer.domElement.style.cursor = node === null ? 'grab' : 'pointer';
  });
  renderer.domElement.addEventListener('click', (event) => selection.select(targetOf(event)));

  /** @param {KeyboardEvent} event */
  const onKey = (event) => {
    if (event.key === 'r' || event.key === 'R') { selection.clear(); orbit.reset(); }
    if (event.key === 'ArrowLeft') orbit.rotateBy(-0.1, 0);
    if (event.key === 'ArrowRight') orbit.rotateBy(0.1, 0);
    if (event.key === 'ArrowUp') orbit.rotateBy(0, 0.1);
    if (event.key === 'ArrowDown') orbit.rotateBy(0, -0.1);
  };
  const onResize = () => {
    resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    orbit.apply();
    renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
  };
  addEventListener('keydown', onKey);
  addEventListener('resize', onResize);

  let running = true;
  const draw = () => {
    if (!running) return;
    labels.update();
    renderer.render(scene, camera);
    requestAnimationFrame(draw);
  };
  draw();

  return {
    fit() { selection.clear(); orbit.reset(); },
    /** Driven BY the page (the table opened a cell), so it does not notify back: the page
     * already knows, and telling it again is an infinite `show → mirror → select` loop.
     * @param {string} id */
    selectById(id) {
      const node = byId.get(id);
      selection.select(node === undefined ? null : node, { notify: false });
    },
    dispose() {
      running = false;
      removeEventListener('keydown', onKey);
      removeEventListener('resize', onResize);
      labels.dispose();
      renderer.dispose();
      host.replaceChildren();
    },
  };
}
