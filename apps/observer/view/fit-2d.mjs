// fit-2d.mjs — PURE. How the 2D projection is FRAMED, and how big a label is on screen.
// No DOM here, so the framing of the default view is testable in node (criterion D22).
//
// The problem this module exists for, measured rather than guessed: the server's layout
// spaces cells 600 user units apart while a node glyph is 26 units across, so a four-cell
// vault arrives as a viewBox 4920x960 units wide. Dropped into a 758x448 px panel by
// `preserveAspectRatio="xMidYMid meet"` alone, that is one scale — 0.154 — and a label
// authored at 26 units rendered at FOUR CSS pixels. The drawing was not wrong; it was
// unreadable, which for a reading tool is the same thing.
//
// Two separable decisions, so each can be tested on its own:
//   `fitTransform` — WHERE the drawing sits: aspect-correct, padded, centred, clamped.
//   `labelTransform` — HOW BIG a label is: a constant number of CSS pixels at any zoom,
//     counter-scaled against the drawing instead of riding it down to nothing.
// THE SCENE STILL COMPUTES NOTHING: every x/y is the server's. This is magnification.

/** The font size `app.css` authors for `.node .name`, in SVG user units. */
export const LABEL_FONT_UNITS = 26;
/** The node glyph radius `svg-2d.mjs` draws, in SVG user units. */
export const NODE_RADIUS_UNITS = 26;
/** What a node label measures on screen, in CSS px, at every zoom level. */
export const LABEL_PX = 12;
/** The floor the criterion names. `LABEL_PX` must never be allowed below it. */
export const MIN_LABEL_PX = 11;
/** CSS px between the edge of the glyph and the top of its label, at every zoom level. */
export const LABEL_GAP_PX = 14;
/** CSS px of breathing room between the drawing and the panel edge, so a label at the
 * margin is not sliced in half by `overflow: hidden`. */
export const FIT_PADDING_PX = 24;
/** One user unit per CSS pixel is as large as a fit ever gets: a two-cell vault must not
 * be inflated into a pair of wall-sized rings. Zooming past this is the reader's choice. */
export const MAX_UNIT_SCALE = 1;
/** A floor that only guards against a degenerate box producing zero or NaN. */
export const MIN_UNIT_SCALE = 1 / 4096;
/** How wide an average character is, as a fraction of the font size. A rough number on
 * purpose: it reserves ROOM for a label, it does not measure one. */
export const LABEL_CHAR_RATIO = 0.55;
/** However long a cell's name is, a label never pushes the drawing smaller than this. */
export const MAX_LABEL_RESERVE_PX = 60;

/** @typedef {{ width: number, height: number }} Size */

/** @param {unknown} value @param {number} fallback @returns {number} */
function positive(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** @param {number} value @returns {number} */
function round(value) {
  return Math.round(value * 1e4) / 1e4;
}

/** PURE. The scale the browser itself applies through `preserveAspectRatio="xMidYMid meet"`:
 * the smaller of the two ratios, which is also what centres the drawing. Everything else
 * here is expressed RELATIVE to this, because the CSS transform on the `<svg>` composes
 * with it rather than replacing it.
 * @param {Size} panel @param {Size} box @returns {number} */
export function intrinsicScale(panel, box) {
  const width = positive(panel.width, 1);
  const height = positive(panel.height, 1);
  return Math.min(width / positive(box.width, 1), height / positive(box.height, 1));
}

/** PURE. CSS px to keep clear beyond the node bounds so that the LABEL of a node at the
 * edge is framed too, not sliced in half by `overflow: hidden`. A label is centred on its
 * node, so half of the longest one is what has to fit. Characters rather than glyphs: the
 * fit must stay pure, and reserving slightly too much costs a little scale, while measuring
 * nothing costs the reader the name. `0` characters (above the label limit) reserves `0`.
 * @param {number} chars @param {number} [labelPx] @returns {number} */
export function labelReservePx(chars, labelPx = LABEL_PX) {
  const count = positive(chars, 0);
  return Math.min(MAX_LABEL_RESERVE_PX, (count * labelPx * LABEL_CHAR_RATIO) / 2);
}

/** PURE. The user-units-to-CSS-pixels scale the fit wants: the whole drawing inside the
 * panel, the same scale on both axes, with `padding` kept clear on every side, and never
 * magnified past `maxScale`.
 * @param {Size} panel @param {Size} box
 * @param {{ padding?: number, maxScale?: number, labelChars?: number }} [options]
 * @returns {number} */
export function fitUnitScale(panel, box, options = {}) {
  const padding = (options.padding ?? FIT_PADDING_PX) + labelReservePx(options.labelChars ?? 0);
  const maxScale = options.maxScale ?? MAX_UNIT_SCALE;
  const width = Math.max(1, positive(panel.width, 1) - 2 * padding);
  const height = Math.max(1, positive(panel.height, 1) - 2 * padding);
  const raw = Math.min(width / positive(box.width, 1), height / positive(box.height, 1));
  return Math.min(maxScale, Math.max(MIN_UNIT_SCALE, raw));
}

/** PURE. The transform the view applies on top of the intrinsic mapping, with
 * `transform-origin: 0 0`. The translate is exactly the displacement that scaling about the
 * origin introduces at the panel centre — the intrinsic mapping already centred the box, so
 * undoing that displacement keeps it centred at any scale.
 * @param {Size} panel @param {Size} box
 * @param {{ padding?: number, maxScale?: number, labelChars?: number }} [options]
 * @returns {{ unitScale: number, k: number, x: number, y: number }} */
export function fitTransform(panel, box, options = {}) {
  const unitScale = fitUnitScale(panel, box, options);
  const k = unitScale / intrinsicScale(panel, box);
  return {
    unitScale,
    k,
    x: round((1 - k) * positive(panel.width, 1) / 2),
    y: round((1 - k) * positive(panel.height, 1) / 2),
  };
}

/** PURE. What a label measures on screen: the authored font, times the drawing's scale,
 * times the label's own counter-scale.
 * @param {number} unitScale @param {number} labelScale @returns {number} */
export function renderedLabelPx(unitScale, labelScale) {
  return LABEL_FONT_UNITS * unitScale * labelScale;
}

/** PURE. The transform a node's label group carries so that it renders at `labelPx` CSS
 * pixels and sits `gapPx` CSS pixels clear of the glyph, WHATEVER the drawing's scale is.
 * Both are counter-scaled: a label that only counter-scaled its size would climb onto the
 * glyph as the reader zoomed in.
 * @param {number} unitScale
 * @param {{ labelPx?: number, gapPx?: number, radius?: number }} [options]
 * @returns {{ scale: number, drop: number, labelPx: number, transform: string }} */
export function labelTransform(unitScale, options = {}) {
  const labelPx = Math.max(MIN_LABEL_PX, options.labelPx ?? LABEL_PX);
  const gapPx = options.gapPx ?? LABEL_GAP_PX;
  const radius = options.radius ?? NODE_RADIUS_UNITS;
  const scale = positive(unitScale, MIN_UNIT_SCALE);
  const counter = labelPx / (LABEL_FONT_UNITS * scale);
  const drop = radius + gapPx / scale;
  return {
    scale: counter,
    drop,
    labelPx,
    transform: `translate(0,${round(drop)}) scale(${round(counter)})`,
  };
}
