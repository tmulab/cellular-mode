// report-svg.mjs — the model as ONE SVG string. PURE: an object in, text out, no
// filesystem, no clock, no environment. Nothing here decides WHAT the map says; it decides
// only where the lines sit.
//
// Three deliberate limits, because this file is read offline by a human and diffed by a
// reviewer: a light background and no colour-only meaning (every state carries its word,
// not just its glyph), no external font — generic families only, so the file renders the
// same on a machine with no network — and no script, no image, no link. Every value that
// came from the vault goes through `escapeXml`, so a cell named `a < b & "c"` draws as text
// instead of breaking the document.
const WIDTH = 1400;
const PAD = 36;
const LINE = 22;
const INDENT = 22;
const GAP = 18;
/** What fits on one line at this width and font size, with room to spare. */
const MAX_CHARS = 186;
/** Status as a WORD as well as a glyph (constitution D8: never colour or shape alone).
 * @type {Record<string, string>} */
const STATE_WORDS = { '✔': 'done', '🔵': 'active', '⏸': 'paused', '📋': 'planned' };

/** The XML comment that carries the source fingerprint. `check-report.mjs` reads it back,
 * so the two sides of `map-stale` share one spelling. */
export const MARKER = 'cellmode-source: sha256:';

const STYLE = [
  '.bg { fill: #fbfbf9; }',
  'text { font-family: "DejaVu Sans", "Segoe UI", sans-serif; fill: #1b1b1b; }',
  '.h1 { font-size: 24px; font-weight: 700; }',
  '.h2 { font-size: 16px; font-weight: 700; fill: #333; }',
  '.h3 { font-size: 14px; font-weight: 700; fill: #444; }',
  '.row { font-size: 13px; }',
  '.dim { font-size: 13px; fill: #555; }',
  '.meta { font-size: 12px; fill: #666; }',
  '.rule { stroke: #d9d9d4; stroke-width: 1; }',
].join('\n  ');

/** PURE. XML text escape: the five characters that can leave text mode.
 * @param {unknown} value @returns {string} */
export function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** The fingerprint embedded in an existing map, or '' when there is none (a map written
 * before this marker existed, or by another hand). @param {unknown} svg @returns {string} */
export function embeddedFingerprint(svg) {
  const hit = new RegExp(`<!--\\s*${MARKER}([0-9a-f]{64})\\s*-->`).exec(String(svg ?? ''));
  return hit?.[1] ?? '';
}

/** @type {(value: unknown) => string} */
const fit = (value) => {
  const text = String(value ?? '');
  return text.length <= MAX_CHARS ? text : `${text.slice(0, MAX_CHARS - 1).trimEnd()}…`;
};

/** @type {(status: string) => string} */
const stated = (status) => `${status} ${STATE_WORDS[status] ?? ''}`.trim();

/** @typedef {ReturnType<typeof import('./report-model.mjs').reportModel>} ReportModel */

/**
 * PURE. The whole map as an SVG document. The height follows the content, so a vault with
 * forty cells is a taller file and never a clipped one.
 * @param {ReportModel} model @returns {string}
 */
export function renderMap(model) {
  /** @type {string[]} */
  const body = [];
  let y = PAD + 14;
  /** @type {(cls: string, text: string, x?: number) => void} */
  const at = (cls, text, x = PAD) => {
    body.push(`<text x="${x}" y="${y}" class="${cls}">${escapeXml(fit(text))}</text>`);
    y += LINE;
  };
  /** @type {(title: string) => void} */
  const section = (title) => {
    y += GAP;
    body.push(`<line x1="${PAD}" y1="${y - 14}" x2="${WIDTH - PAD}" y2="${y - 14}" class="rule" />`);
    at('h2', title);
  };

  at('h1', `Cellular Mode · ${model.project}`);
  at('meta', 'Generated from the vault — log.md, INDEX.md, operations/, cells/, '
    + 'parking-lot.md. Never written by hand.');
  at('meta', `Source fingerprint sha256:${model.fingerprint.slice(0, 16)}… `
    + '(the whole digest is in this file’s first comment)');

  section('Active operation');
  const op = model.operation;
  if (op === null) at('dim', 'No operation is 🔵 active.', PAD + INDENT);
  else {
    at('row', `${op.name} (${op.id}) · ${stated(op.status)} · opened ${op.opened} · `
      + `spend ${op.spend} / ceiling ${op.ceiling}`, PAD + INDENT);
    at('dim', `Finish line (frozen) · ${op.finishLine.length} item(s)`, PAD + INDENT);
    op.finishLine.forEach((item, i) => {
      at('row', `${i + 1}. ${stated(item.state)} · ${item.text}`, PAD + INDENT * 2);
    });
  }

  section('Cells by status · name · area — last fact');
  for (const group of model.groups.filter((g) => g.cells.length > 0)) {
    at('h3', `${group.status} ${group.label} (${group.cells.length})`, PAD + INDENT);
    for (const cell of group.cells) {
      at('row', `${cell.name} · ${cell.area} — ${cell.fact}`, PAD + INDENT * 2);
    }
  }

  section('Waiting on the human');
  if (model.waiting.length === 0) at('dim', 'Nothing is waiting on the human.', PAD + INDENT);
  for (const item of model.waiting) {
    at('row', `[${item.source}] ${item.label} — ${item.text}`, PAD + INDENT);
  }

  section('Totals');
  const t = model.totals;
  at('row', `Cells: ${t.active} 🔵 active · ${t.paused} ⏸ paused · ${t.planned} 📋 planned `
    + `· ${t.done} ✔ done`, PAD + INDENT);
  at('row', `Log entries: ${t.logEntries}`, PAD + INDENT);

  const height = y + PAD;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" `
      + `viewBox="0 0 ${WIDTH} ${height}" role="img" `
      + `aria-label="Cellular Mode map of ${escapeXml(model.project)}">`,
    `  <!-- ${MARKER}${model.fingerprint} -->`,
    `  <title>Cellular Mode map · ${escapeXml(model.project)}</title>`,
    `  <style>\n  ${STYLE}\n  </style>`,
    `  <rect class="bg" x="0" y="0" width="${WIDTH}" height="${height}" />`,
    ...body.map((line) => `  ${line}`),
    '</svg>',
    '',
  ].join('\n');
}
