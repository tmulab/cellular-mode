// camera-3d.mjs — runs in the BROWSER. ORTHOGRAPHIC camera (the node on the right must not
// become an ant) with the framing computed from the points the server sent, never a fixed
// position. The opening pose has to be legible on its own: almost frontal, raised 15°.
//
// Ported from the original dashboard's `camera3d.mjs`.
import { OrthographicCamera, Vector3 } from '../vendor/three@0.180.0/three.module.min.js';

/** The opening pose: 15° above the plane of the columns. */
export const POSE = Object.freeze({ theta: 0, phi: Math.PI / 2 - (15 * Math.PI) / 180 });

const MARGIN = 1.04;

/** @param {{ theta: number, phi: number }} pose @returns {Vector3} */
export function directionOf(pose) {
  return new Vector3(
    Math.sin(pose.phi) * Math.sin(pose.theta),
    Math.cos(pose.phi),
    Math.sin(pose.phi) * Math.cos(pose.theta),
  ).normalize();
}

/**
 * Frames the REAL POINTS, not the corners of the bounding box: a layered graph leaves the
 * corners empty, and fitting them costs height for nothing. Fitting the bounding sphere
 * would be rotation-proof but would leave the graph much smaller than it could be — the
 * OPENING pose is what has to be legible; rotating is the reader's business.
 * @param {ReadonlyArray<readonly [number, number, number]>} points
 * @param {{ theta: number, phi: number }} [pose]
 * @returns {{ centre: Vector3, halfWidth: number, halfHeight: number }}
 */
export function frame(points, pose = POSE) {
  const axis = (/** @type {0 | 1 | 2} */ k) => {
    const values = points.map((point) => point[k]);
    return (Math.min(...values) + Math.max(...values)) / 2;
  };
  const centre = points.length === 0 ? new Vector3(0, 0, 0) : new Vector3(axis(0), axis(1), axis(2));
  const direction = directionOf(pose);
  const right = new Vector3().crossVectors(direction, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(right, direction).normalize();

  let halfWidth = 1;
  let halfHeight = 1;
  for (const point of points) {
    const offset = new Vector3(point[0], point[1], point[2]).sub(centre);
    halfWidth = Math.max(halfWidth, Math.abs(offset.dot(right)));
    halfHeight = Math.max(halfHeight, Math.abs(offset.dot(up)));
  }
  return { centre, halfWidth: halfWidth * MARGIN, halfHeight: halfHeight * MARGIN };
}

/**
 * @param {ReadonlyArray<readonly [number, number, number]>} points
 * @param {number} width @param {number} height
 * @returns {{ camera: OrthographicCamera, centre: [number, number, number], resize: (w: number, h: number) => void }}
 */
export function createCamera(points, width, height) {
  const { centre, halfWidth, halfHeight } = frame(points);
  // Generous near/far on an orthographic camera: rotating must never clip the graph
  // against a cutting plane.
  const camera = new OrthographicCamera(-1, 1, 1, -1, -20_000, 20_000);
  const resize = (/** @type {number} */ w, /** @type {number} */ h) => {
    const ratio = h === 0 ? 1 : w / h;
    const half = Math.max(halfHeight, halfWidth / ratio);
    camera.left = -half * ratio;
    camera.right = half * ratio;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
  };
  resize(width, height);
  const array = centre.toArray();
  return {
    camera,
    centre: [array[0] ?? 0, array[1] ?? 0, array[2] ?? 0],
    resize,
  };
}
