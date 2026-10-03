// D22 — the initial framing of the 2D graph, and label legibility under zoom.
//
// Written BEFORE the fix. What it protects is a MEASUREMENT: with the 4-cell demo vault in
// a 1280-wide window the panel is 758x448 CSS px and the server's viewBox is 4920x960 user
// units, so `preserveAspectRatio` alone drew the labels at 26 * 0.154 = 4 CSS px. Both
// mechanisms below exist to stop that: a deterministic fit, and a label that does not
// shrink with the drawing.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  LABEL_FONT_UNITS, LABEL_GAP_PX, LABEL_PX, MAX_LABEL_RESERVE_PX, MAX_UNIT_SCALE, MIN_LABEL_PX,
  NODE_RADIUS_UNITS, FIT_PADDING_PX, fitTransform, fitUnitScale, intrinsicScale, labelReservePx,
  labelTransform, renderedLabelPx,
} from '../view/fit-2d.mjs';
import { longestName } from '../view/svg-2d.mjs';

/** The panels and viewBoxes that were actually measured in a headless browser. `labelChars`
 * is the longest cell name the drawing carries; `0` is the 500-cell case, where the level of
 * detail has already dropped every label. */
const CASES = [
  { name: 'demo vault, 1280x900 window', labelChars: 15, panel: { width: 758, height: 426 }, box: { minX: -2460, minY: -900, width: 4920, height: 960 } },
  { name: 'demo vault, 1280x1500 window', labelChars: 15, panel: { width: 758, height: 426 }, box: { minX: -2460, minY: -900, width: 4920, height: 960 } },
  { name: '500-cell fixture', labelChars: 0, panel: { width: 758, height: 426 }, box: { minX: -60, minY: -3660, width: 8600, height: 7320 } },
  { name: '320x640 window', labelChars: 15, panel: { width: 255, height: 192 }, box: { minX: -2460, minY: -900, width: 4920, height: 960 } },
];

describe('D22 · the initial view is a deterministic fit, not the raw viewBox mapping', () => {
  test('the drawing fits inside the panel with padding on both axes, aspect-correct', () => {
    for (const { name, panel, box, labelChars } of CASES) {
      const { unitScale, k } = fitTransform(panel, box, { labelChars });
      const clear = 2 * (FIT_PADDING_PX + labelReservePx(labelChars));
      assert.ok(Number.isFinite(k) && k > 0, `${name}: a finite scale`);
      assert.ok(box.width * unitScale <= panel.width - clear + 0.5, `${name}: width fits`);
      assert.ok(box.height * unitScale <= panel.height - clear + 0.5, `${name}: height fits`);
      // Aspect-correct: ONE scale for both axes, and it is the binding one.
      const tight = Math.min((panel.width - clear) / box.width, (panel.height - clear) / box.height);
      assert.equal(unitScale, Math.min(tight, MAX_UNIT_SCALE), `${name}: the binding axis decides`);
    }
  });

  test('a node at the edge keeps room for its LABEL, not only for its glyph', () => {
    const panel = { width: 758, height: 426 };
    const box = { minX: -2460, minY: -900, width: 4920, height: 960 };
    const bare = fitUnitScale(panel, box, { labelChars: 0 });
    const labelled = fitUnitScale(panel, box, { labelChars: 15 });
    assert.ok(labelled < bare, 'reserving room for a label has to cost scale, or it reserves nothing');
    // Half of the longest label must fit in the margin the fit left on each side.
    const margin = (panel.width - box.width * labelled) / 2;
    assert.ok(margin >= labelReservePx(15), `${margin.toFixed(1)} px of margin for a ${labelReservePx(15)} px half-label`);
    assert.equal(labelReservePx(0), 0, 'no label drawn, nothing to keep clear');
    assert.equal(labelReservePx(400), MAX_LABEL_RESERVE_PX, 'one very long name cannot shrink the graph without end');
    assert.equal(labelReservePx(Number.NaN), 0);
    // The number comes from the drawing itself, so the two modules agree on it.
    assert.equal(longestName([{ id: 'a', name: 'Markdown parser', x: 0, y: 0 }, { id: 'bb', x: 0, y: 0 }]), 15);
    assert.equal(longestName([]), 0);
  });

  test('the fit is not the identity: it is computed from the panel and the box', () => {
    const scales = CASES.map(({ panel, box, labelChars }) => fitTransform(panel, box, { labelChars }).k);
    assert.ok(scales.some((k) => Math.abs(k - 1) > 0.02),
      'a fit that always returns scale 1 is the bug this criterion exists for');
  });

  test('the content stays centred in the panel when the fit scales about the origin', () => {
    for (const { name, panel, box, labelChars } of CASES) {
      const { k, x, y } = fitTransform(panel, box, { labelChars });
      // The intrinsic mapping already centres the box; scaling by k about (0,0) must be
      // undone at the centre, or the drawing walks out of the panel.
      assert.ok(Math.abs((panel.width / 2) * k + x - panel.width / 2) < 0.001, `${name}: centred in x`);
      assert.ok(Math.abs((panel.height / 2) * k + y - panel.height / 2) < 0.001, `${name}: centred in y`);
    }
  });

  test('a tiny graph is framed, not blown up past the maximum scale', () => {
    const tiny = fitUnitScale({ width: 758, height: 448 }, { width: 200, height: 200 });
    assert.equal(tiny, MAX_UNIT_SCALE, 'one user unit per CSS pixel is as large as a drawing gets');
    assert.ok(MAX_UNIT_SCALE <= 1);
  });

  test('a panel with no area yields a finite transform rather than NaN', () => {
    for (const panel of [{ width: 0, height: 0 }, { width: Number.NaN, height: 448 }]) {
      const { k, x, y, unitScale } = fitTransform(panel, { width: 4920, height: 960 });
      for (const value of [k, x, y, unitScale]) assert.ok(Number.isFinite(value), `finite, got ${value}`);
    }
    assert.ok(Number.isFinite(intrinsicScale({ width: 758, height: 448 }, { width: 0, height: 0 })));
  });
});

describe('D22 · a label keeps a readable size at every scale the view can reach', () => {
  test('at the fitted scale of every measured case the label renders at least the minimum', () => {
    for (const { name, panel, box, labelChars } of CASES) {
      const { unitScale } = fitTransform(panel, box, { labelChars });
      const label = labelTransform(unitScale);
      const px = renderedLabelPx(unitScale, label.scale);
      assert.ok(px >= MIN_LABEL_PX, `${name}: ${px.toFixed(2)} px is below the ${MIN_LABEL_PX} px floor`);
      assert.ok(Math.abs(px - LABEL_PX) < 0.01, `${name}: ${px.toFixed(2)} px should be the target ${LABEL_PX}`);
    }
  });

  test('zooming in and out does not change the label size on screen', () => {
    for (const zoom of [0.3, 0.5, 1, 2.4, 8]) {
      const unitScale = 0.1541 * zoom;
      const px = renderedLabelPx(unitScale, labelTransform(unitScale).scale);
      assert.ok(Math.abs(px - LABEL_PX) < 0.01, `zoom ${zoom}: ${px.toFixed(2)} px`);
    }
  });

  test('the label keeps a constant gap below the node glyph, so it never sits on it', () => {
    for (const unitScale of [0.0294, 0.0546, 0.1443, 0.37, 1.2]) {
      const { drop } = labelTransform(unitScale);
      const gap = drop * unitScale - NODE_RADIUS_UNITS * unitScale;
      assert.ok(Math.abs(gap - LABEL_GAP_PX) < 0.01,
        `at scale ${unitScale} the gap is ${gap.toFixed(2)} px, not ${LABEL_GAP_PX}`);
    }
  });

  test('the counter-scale is stated in the same font unit the stylesheet authors', () => {
    assert.equal(LABEL_FONT_UNITS, 26, 'app.css authors .node .name at 26 user units');
    assert.equal(renderedLabelPx(1, 1), LABEL_FONT_UNITS);
    const degenerate = labelTransform(0);
    assert.ok(Number.isFinite(degenerate.scale) && Number.isFinite(degenerate.drop));
  });

  test('the transform string is the attribute the browser module writes', () => {
    const label = labelTransform(0.1443);
    assert.match(label.transform, /^translate\(0,[0-9.]+\) scale\([0-9.]+\)$/);
  });
});
