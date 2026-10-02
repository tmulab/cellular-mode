// fields.mjs — pure reader for the `**Key:** value` markdown field style used by
// cell files and log entries. Linear scan, no regex over free input values: the
// pattern only matches the bold key, the value is whatever lies between two keys.
// This lets one physical line carry several fields
// (`**Opened:** 2026-10-02 · **Status:** 🔵`).
const KEY = /\*\*([^*:]+):\*\*/g;

/** @param {unknown} text @returns {Record<string, string>} */
export function parseFields(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of String(text ?? '').split('\n')) {
    const hits = [...line.matchAll(KEY)];
    for (let i = 0; i < hits.length; i += 1) {
      const hit = hits[i];
      if (hit === undefined) continue;
      const key = (hit[1] ?? '').trim();
      const from = hit.index + hit[0].length;
      const to = hits[i + 1]?.index ?? line.length;
      const value = line.slice(from, to).trim().replace(/[·|]+$/, '').trim();
      if (!(key in out)) out[key] = value;
    }
  }
  return out;
}

// Body of a `## <marker>` section: every line until the next heading.
/** @param {unknown} text @param {string} marker @returns {string} */
export function parseSection(text, marker) {
  const lines = String(text ?? '').split('\n');
  const start = lines.findIndex((l) => l.trim().startsWith(marker));
  if (start < 0) return '';
  /** @type {string[]} */
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trim();
    if (line.startsWith('#')) break;
    body.push(line);
  }
  return body.join(' ').replace(/\s+/g, ' ').trim();
}

/** @param {unknown} value @param {string} [fallback] @returns {string} */
export function oneLine(value, fallback = '—') {
  const text = String(value ?? '').replace(/\s*\n\s*/g, ' ').trim();
  return text === '' ? fallback : text;
}
