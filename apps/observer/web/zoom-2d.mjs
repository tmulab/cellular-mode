// zoom-2d.mjs — runs in the BROWSER. Gives the 2D projection the SAME gestures as the 3D
// view: drag moves, wheel zooms, "fit" returns to the start. Two views of one model must
// not ask the hand to learn two grammars.
//
// Ported from the original dashboard's `zoom2d.mjs`. The zoom state lives HERE, outside the
// SVG, because the drawing is replaced whenever the model is refetched and the
// magnification must not be lost when the data refreshes.
const THRESHOLD = 4;          // pixels of movement before a press becomes a drag
const MIN_SCALE = 0.3;
const MAX_SCALE = 8;

/** @param {HTMLElement} host */
export function createZoom2d(host) {
  const state = { x: 0, y: 0, k: 1 };
  let dragging = false;
  /** @type {{ id: number, x: number, y: number } | null} */
  let pending = null;
  let last = [0, 0];

  const apply = () => {
    const svg = host.querySelector('svg');
    if (svg === null) return;
    const style = /** @type {SVGElement} */ (svg).style;
    style.transformOrigin = '0 0';
    style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.k})`;
  };

  // The pointer is NOT captured on pointerdown: with capture active the following `click`
  // targets the container instead of the node's own group, and clicking a cell stopped
  // finding the cell. A drag only begins after 4 px of movement; a plain click never
  // captures.
  host.addEventListener('pointerdown', (event) => {
    pending = { id: event.pointerId, x: event.clientX, y: event.clientY };
    last = [event.clientX, event.clientY];
  });

  /** @param {PointerEvent} event */
  const release = (event) => {
    if (dragging) {
      // Mark that a drag happened, so the click right behind it does not select a node.
      host.dataset['dragged'] = '1';
      setTimeout(() => { delete host.dataset['dragged']; }, 0);
    }
    dragging = false;
    pending = null;
    host.style.cursor = '';
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
  };
  host.addEventListener('pointerup', release);
  host.addEventListener('pointercancel', release);

  host.addEventListener('pointermove', (event) => {
    if (pending !== null && !dragging) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < THRESHOLD) return;
      dragging = true;
      host.setPointerCapture(pending.id);
      host.style.cursor = 'grabbing';
    }
    if (!dragging) return;
    state.x += event.clientX - (last[0] ?? 0);
    state.y += event.clientY - (last[1] ?? 0);
    last = [event.clientX, event.clientY];
    apply();
  });

  // Zoom anchored on the cursor: the point under the pointer stays where it is, which is
  // what the hand expects.
  host.addEventListener('wheel', (event) => {
    event.preventDefault();
    const box = host.getBoundingClientRect();
    const cx = event.clientX - box.left;
    const cy = event.clientY - box.top;
    const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.k * (event.deltaY > 0 ? 0.9 : 1.1)));
    const factor = k / state.k;
    state.x = cx - (cx - state.x) * factor;
    state.y = cy - (cy - state.y) * factor;
    state.k = k;
    apply();
  }, { passive: false });

  return {
    apply,
    fit() { state.x = 0; state.y = 0; state.k = 1; apply(); },

    /** Keyboard equivalents of the gestures, so the view is usable without a pointer.
     * @param {number} dx @param {number} dy */
    nudge(dx, dy) { state.x += dx; state.y += dy; apply(); },
    /** @param {number} factor */
    scaleBy(factor) {
      state.k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.k * factor));
      apply();
    },

    /** Brings a MODEL point (viewBox units) to the centre — the 2D equivalent of the 3D
     * `orbit.focus`, which is what makes clicking a node behave the same in both views.
     * @param {number} ux @param {number} uy @param {number} [k] */
    focus(ux, uy, k = 2.4) {
      const svg = host.querySelector('svg');
      if (svg === null || !Number.isFinite(ux)) return;
      const viewBox = svg.getAttribute('viewBox');
      if (viewBox === null) return;
      const [minX = 0, minY = 0, boxW = 1, boxH = 1] = viewBox.trim().split(/\s+/).map(Number);
      const box = host.getBoundingClientRect();
      // The SVG fills the host, but the DRAWING inside it is scaled by the smaller factor
      // and centred (preserveAspectRatio="meet"), leaving letterbox margins. Ignoring that
      // slack is what made the focus land beside the node and the zoom look broken.
      const scale = Math.min(box.width / boxW, box.height / boxH);
      const padX = (box.width - boxW * scale) / 2;
      const padY = (box.height - boxH * scale) / 2;
      state.k = k;
      state.x = box.width / 2 - (padX + (ux - minX) * scale) * k;
      state.y = box.height / 2 - (padY + (uy - minY) * scale) * k;
      apply();
    },
  };
}
