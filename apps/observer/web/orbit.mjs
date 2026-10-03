// orbit.mjs — runs in the BROWSER. Our own camera controller instead of three's
// `examples/jsm/controls/OrbitControls.js`, which imports from the bare specifier 'three'
// and would need an import map the CSP does not allow (see ../vendor/VENDOR.md).
// Spherical coordinates: the same arithmetic, with no second dependency.
//
// With an ORTHOGRAPHIC camera the zoom is `camera.zoom`, not distance — moving the camera
// closer would bring nothing closer in a parallel projection.
//
// Ported from the original dashboard's `orbita.mjs`.

/**
 * @param {object} wiring
 * @param {import('../vendor/three@0.180.0/three.module.min.js').OrthographicCamera} wiring.camera
 * @param {HTMLElement} wiring.canvas
 * @param {[number, number, number]} wiring.target
 * @param {number} wiring.radius distance that only avoids clipping; it does not set scale
 * @param {{ theta: number, phi: number }} wiring.pose
 */
export function createOrbit({ camera, canvas, target, radius, pose }) {
  const state = { target: [...target], theta: pose.theta, phi: pose.phi, zoom: 1 };
  const initial = JSON.stringify(state);
  /** @type {'rotate' | 'pan' | null} */
  let dragging = null;
  let last = [0, 0];
  let spaceHeld = false;

  // SCREEN axes at the current orientation. A drag has to move the content towards where
  // the cursor goes, at any angle. Moving along world X/Y only coincides with the screen in
  // the opening pose; after a rotation the drag went the wrong way.
  const axes = () => {
    const st = Math.sin(state.theta);
    const ct = Math.cos(state.theta);
    const sf = Math.sin(state.phi);
    const cf = Math.cos(state.phi);
    return { right: [-ct, 0, st], up: [-st * cf, sf, -ct * cf] };
  };

  const apply = () => {
    const [ax = 0, ay = 0, az = 0] = state.target;
    camera.position.set(
      ax + radius * Math.sin(state.phi) * Math.sin(state.theta),
      ay + radius * Math.cos(state.phi),
      az + radius * Math.sin(state.phi) * Math.cos(state.theta),
    );
    camera.lookAt(ax, ay, az);
    camera.zoom = state.zoom;
    camera.updateProjectionMatrix();
  };

  /** World units per screen pixel at the current zoom. */
  const unitsPerPixel = () => (camera.top - camera.bottom) / (state.zoom * Math.max(1, canvas.clientHeight));

  /** @param {number} dx @param {number} dy */
  const panBy = (dx, dy) => {
    const scale = unitsPerPixel();
    const { right, up } = axes();
    for (let k = 0; k < 3; k += 1) {
      state.target[k] = (state.target[k] ?? 0) - (right[k] ?? 0) * dx * scale + (up[k] ?? 0) * dy * scale;
    }
  };

  // A real canvas: pan with the right button, the middle button OR a held space bar.
  addEventListener('keydown', (event) => {
    // Without preventDefault the space bar scrolls the page underneath the scene.
    if (event.code !== 'Space') return;
    event.preventDefault();
    spaceHeld = true;
    canvas.style.cursor = 'grab';
  });
  addEventListener('keyup', (event) => {
    if (event.code !== 'Space') return;
    spaceHeld = false;
    canvas.style.cursor = '';
  });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = (event.button === 2 || event.button === 1 || spaceHeld) ? 'pan' : 'rotate';
    if (dragging === 'pan') {
      event.preventDefault();
      canvas.style.cursor = 'grabbing';
    }
    last = [event.clientX, event.clientY];
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointerup', (event) => {
    dragging = null;
    canvas.style.cursor = spaceHeld ? 'grab' : '';
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener('pointermove', (event) => {
    if (dragging === null) return;
    const dx = event.clientX - (last[0] ?? 0);
    const dy = event.clientY - (last[1] ?? 0);
    last = [event.clientX, event.clientY];
    if (dragging === 'rotate') {
      state.theta -= dx * 0.005;
      state.phi = Math.min(Math.PI - 0.05, Math.max(0.05, state.phi - dy * 0.005));
    } else {
      panBy(dx, dy);
    }
    apply();
  });

  // Plain wheel zooms. Shift, or two fingers horizontally, pans — as in any canvas.
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      panBy(-(event.shiftKey ? event.deltaY : event.deltaX), 0);
      return apply();
    }
    state.zoom = Math.min(12, Math.max(0.2, state.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
    return apply();
  }, { passive: false });

  apply();
  return {
    apply,
    /** @param {readonly [number, number, number]} point @param {number} zoom */
    focus(point, zoom) {
      state.target = [...point];
      state.zoom = zoom;
      apply();
    },
    /** @param {number} dx @param {number} dy */
    rotateBy(dx, dy) {
      state.theta -= dx;
      state.phi = Math.min(Math.PI - 0.05, Math.max(0.05, state.phi - dy));
      apply();
    },
    reset() {
      Object.assign(state, JSON.parse(initial));
      apply();
    },
  };
}
