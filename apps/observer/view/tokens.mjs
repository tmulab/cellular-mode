// tokens.mjs — the SINGLE source of colour for this application. The stylesheet, the
// 2D SVG projection and the 3D scene all read from here; the stylesheet does it by
// declaring the same values as custom properties on `:root`, and a test compares the
// two value for value (criterion D15). A duplicated palette is exactly how two views of
// one model start disagreeing about what they are showing.
//
// Restraint is a rule, not a taste: ONE accent hue outside the status palette and the
// neutrals. Three accents are three houses.
//
// Contrast is computed, not eyeballed: `contrastRatio` below is the sRGB relative
// luminance formula from WCAG 2.1, and the test asserts the tiers. A grey that looks
// good in a mock-up and cannot be read at 23:00 is a defect.

/** Neutral surfaces and type. @type {Readonly<Record<string, string>>} */
export const BASE = Object.freeze({
  background: '#0b0d14',
  surface: '#12141d',
  border: '#2e3449',
  text: '#e8eaf2',
  secondary: '#9aa3bb',
  tertiary: '#6b7490',
  accent: '#7c5cff',
});

/** One colour per cell status. The keys are the contract's status strings.
 * @type {Readonly<Record<string, string>>} */
export const STATUS_COLOUR = Object.freeze({
  done: '#3ddc97',
  active: '#4aa8ff',
  paused: '#f5a524',
  planned: '#8892ab',
  unknown: '#a0a8c0',
});

/** Every token, flattened to the custom-property names used by the stylesheet.
 * @type {Readonly<Record<string, string>>} */
export const CSS_VARIABLES = Object.freeze({
  ...Object.fromEntries(Object.entries(BASE).map(([key, value]) => [`--${key}`, value])),
  ...Object.fromEntries(
    Object.entries(STATUS_COLOUR).map(([key, value]) => [`--status-${key}`, value]),
  ),
});

/** Contrast tiers, as the criterion states them. Each entry is `[token, minimum]`.
 * `border` carries no information: it only has to be visible against the background.
 * @type {ReadonlyArray<readonly [string, number]>} */
export const CONTRAST_TIERS = Object.freeze([
  ...(/** @type {ReadonlyArray<readonly [string, number]>} */ ([
    ['text', 4.5], ['secondary', 4.5], ['tertiary', 3], ['accent', 3], ['border', 1.5],
  ])),
  ...Object.keys(STATUS_COLOUR).map((key) => /** @type {readonly [string, number]} */ ([`status-${key}`, 4.5])),
]);

/** PURE. `#rrggbb` → `[r, g, b]` in 0..255. Throws on anything else: a malformed token
 * must not quietly become black.
 * @param {string} hex @returns {[number, number, number]} */
export function rgbOf(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match === null || match[1] === undefined) throw new TypeError(`not a #rrggbb colour: ${hex}`);
  const digits = match[1];
  return [
    Number.parseInt(digits.slice(0, 2), 16),
    Number.parseInt(digits.slice(2, 4), 16),
    Number.parseInt(digits.slice(4, 6), 16),
  ];
}

/** PURE. WCAG 2.1 relative luminance.
 * @param {string} hex @returns {number} */
export function luminance(hex) {
  const channels = rgbOf(hex).map((value) => {
    const unit = value / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** PURE. Contrast ratio between two colours, lighter over darker.
 * @param {string} a @param {string} b @returns {number} */
export function contrastRatio(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** PURE. The token value behind a contrast-tier name.
 * @param {string} name @returns {string} */
export function tokenValue(name) {
  const direct = BASE[name];
  if (direct !== undefined) return direct;
  const status = STATUS_COLOUR[name.replace(/^status-/, '')];
  if (status !== undefined) return status;
  throw new TypeError(`unknown token: ${name}`);
}
