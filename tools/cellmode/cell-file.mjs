// cell-file.mjs — vault/state/cells/<slug>.md. A projection of the log: the
// complete state of ONE cell, plus the one thing that makes returning cheap,
// the NEXT STEP. Original fields first; fields marked (addition) are ours.
import { parseFields, parseSection, oneLine } from './fields.mjs';
import { slugify } from './slug.mjs';

/** @typedef {import('./types.mjs').Cell} Cell */

export const NEXT_HEADING = '## ➜ NEXT STEP (doable in <5 min, without thinking)';

const DEFAULTS = {
  name: '', id: '', area: '—', opened: '—', status: '🔵',
  objective: '—', boundaryIn: '—', boundaryOut: '—',
  inputs: '—', outputs: '—', allowed: '—', prohibited: '—',
  dependencies: '—', doneCriterion: '—', lastFact: '—',
  build: '—', decisions: '—', openIssues: '—', minimalContext: '—',
  nextStep: '—',
};

/** @param {Record<string, unknown>} [patch] @returns {Cell} */
export function makeCell(patch = {}) {
  /** @type {Record<string, string>} */
  const cell = { ...DEFAULTS };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    if (!(k in DEFAULTS)) continue;
    cell[k] = typeof v === 'string' ? v : String(v);
  }
  if (!cell.name) cell.name = typeof patch.name === 'string' ? patch.name : '';
  if (!cell.id) cell.id = slugify(cell.name);
  // Every key came from DEFAULTS and every value was coerced to a string, so the
  // assertion records what the loop above has just finished guaranteeing.
  return /** @type {Cell} */ (cell);
}

/** @param {Record<string, unknown> | Cell} [input] @returns {string} */
export function renderCellFile(input) {
  const c = makeCell(input);
  /** @type {(v: unknown) => string} */
  const f = (v) => oneLine(v, '—');
  return [
    `# Cell: ${oneLine(c.name, 'unnamed')}`,
    `**ID:** ${f(c.id)}`,
    `**Area:** ${f(c.area)}`,
    `**Opened:** ${f(c.opened)} · **Status:** ${c.status}`,
    `**Objective:** ${f(c.objective)}`,
    `**Boundary:** in: ${f(c.boundaryIn)} | NOT in: ${f(c.boundaryOut)}`,
    `**Inputs:** ${f(c.inputs)} · **Outputs:** ${f(c.outputs)}`,
    `**Allowed operations:** ${f(c.allowed)} · **Prohibited operations:** ${f(c.prohibited)}`,
    `**Dependencies:** ${f(c.dependencies)}`,
    `**Done criterion (binary):** ${f(c.doneCriterion)}`,
    `**Last fact:** ${f(c.lastFact)}`,
    `**Build/typecheck:** ${f(c.build)}`,
    `**Decisions:** ${f(c.decisions)}`,
    `**Open issues:** ${f(c.openIssues)}`,
    `**Minimal context (≤5 lines):** ${f(c.minimalContext)}`,
    '',
    NEXT_HEADING,
    f(c.nextStep),
    '',
  ].join('\n');
}

/** @type {(value: string) => { boundaryIn: string, boundaryOut: string }} */
function splitBoundary(value) {
  const at = value.indexOf('| NOT in:');
  if (at < 0) return { boundaryIn: value.replace(/^in:\s*/, '').trim() || '—', boundaryOut: '—' };
  return {
    boundaryIn: value.slice(0, at).replace(/^in:\s*/, '').trim() || '—',
    boundaryOut: value.slice(at + '| NOT in:'.length).trim() || '—',
  };
}

/** @param {unknown} text @returns {Cell | null} */
export function parseCellFile(text) {
  const src = String(text ?? '');
  const titleLine = src.split('\n').find((l) => l.trim().startsWith('# Cell:'));
  if (!titleLine) return null;
  const f = parseFields(src);
  return makeCell({
    name: titleLine.trim().slice('# Cell:'.length).trim(),
    id: f.ID,
    area: f.Area,
    opened: f.Opened,
    status: f.Status,
    objective: f.Objective,
    ...splitBoundary(f.Boundary ?? ''),
    inputs: f.Inputs,
    outputs: f.Outputs,
    allowed: f['Allowed operations'],
    prohibited: f['Prohibited operations'],
    dependencies: f.Dependencies,
    doneCriterion: f['Done criterion (binary)'],
    lastFact: f['Last fact'],
    build: f['Build/typecheck'],
    decisions: f.Decisions,
    openIssues: f['Open issues'],
    minimalContext: f['Minimal context (≤5 lines)'],
    nextStep: parseSection(src, '## ➜') || '—',
  });
}
