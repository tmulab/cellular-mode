// conflicts.mjs — the MECHANICAL half of "opening a cell beside another" (docs/02): it
// crosses one cell against every OTHER 🔵 cell of the active operation and answers one
// word per cell — `overlap` (the same path inside both boundaries, a refusal), `shared`
// (a declared resource or dependency in common, a warning to record) or `none`. NOT the
// SEMANTIC half: no crossing of fields sees "A rewrites the JSON B reads", so the
// orchestrator still says that in words. PURE but for its last two functions, which
// compose `state.mjs`.
import { slugify } from './slug.mjs';
import { oneLine } from './fields.mjs';
import { parseDependencies } from './deps.mjs';
import { renderFinishLine, NONE } from './operation-file.mjs';
import { readCell, appendLogText } from './state.mjs';

/** @typedef {import('./types.mjs').Operation} Operation */
/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** A cell reduced to what can be crossed mechanically; `holes` is its `NOT in:` half.
 * @typedef {{ name: string, slug: string, paths: string[], holes: string[],
 *   resources: string[], deps: string[] }} Party */
/** One table row: this other cell, and the verdict against it. @typedef {{ cell: string, slug: string, paths: string[], shared: string[],
 *   verdict: 'overlap' | 'shared' | 'none' }} Crossing */

/** PURE. One path as compared: `\` becomes `/`, a leading `./` and duplicate or trailing
 * slashes go, the result is LOWERCASED (the vault is hand-written), and brace lists
 * (`{a,b}.mjs`) are NOT expanded — they match literally. @param {unknown} value */
export function normalizePath(value) {
  return String(value ?? '').trim().replace(/\\/g, '/').replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** PURE. One half of a `**Boundary:**` field -> the paths it names. Split on `,` ONLY: a
 * boundary half is one list of paths, `;` does not separate them, `—` is none.
 * @param {unknown} value @returns {string[]} */
export function parsePaths(value) {
  const text = oneLine(value, '');
  if (text === '' || text === NONE) return [];
  return [...new Set(text.split(',').map(normalizePath)
    .filter((path) => path !== '' && path !== NONE))];
}

const isGlob = (/** @type {string} */ p) => p.includes('*') || p.includes('?');

/** A glob -> a regexp. `**` crosses `/`, `*` and `?` do not, and a trailing `/**` also
 * matches the directory itself (`apps/**` matches `apps`). @param {string} pattern */
function toRegex(pattern) {
  const deep = pattern.endsWith('/**');
  const body = deep ? pattern.slice(0, -3) : pattern;
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = /** @type {string} */ (body[i]);
    if (ch === '*' && body[i + 1] === '*') { out += '.*'; i += 1; continue; }
    if (ch === '*') { out += '[^/]*'; continue; }
    if (ch === '?') { out += '[^/]'; continue; }
    out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}${deep ? '(?:/.*)?' : ''}$`);
}

/** PURE. Does `outer` CONTAIN `inner`? Equal paths, a directory prefix AT A SEGMENT
 * BOUNDARY (`src` contains `src/a.ts`, never `srcx`), or a glob that matches. One-
 * directional on purpose: it is also the `NOT in:` rule, and `NOT in: src/a/legacy`
 * carves a hole in `src/a` rather than removing it.
 * @param {unknown} outer @param {unknown} inner @returns {boolean} */
export function covers(outer, inner) {
  const x = normalizePath(outer);
  const y = normalizePath(inner);
  if (x === '' || y === '') return false;
  return x === y || y.startsWith(`${x}/`) || (isGlob(x) && toRegex(x).test(y));
}

/** PURE. The overlap rule, and the whole of it: two paths overlap when either contains
 * the other. @type {(a: unknown, b: unknown) => boolean} */
export const pathsOverlap = (a, b) => covers(a, b) || covers(b, a);

/** PURE. What is really inside a boundary: the `in:` paths MINUS every one its own
 * `NOT in:` half COVERS. What the hole only bites into stays — the bite is taken during
 * the crossing instead, by {@link crossOne}.
 * @param {{ boundaryIn?: unknown, boundaryOut?: unknown }} cell @returns {string[]} */
export function inPathsOf(cell) {
  const holes = parsePaths(cell.boundaryOut);
  return parsePaths(cell.boundaryIn).filter((p) => !holes.some((h) => covers(h, p)));
}

/** PURE. The resources a cell DECLARES: every `,`/`;` token of its `Inputs` and `Outputs`
 * fields, lowercased. Those two fields are the whole source — a resource nobody wrote
 * down is not shared, it is unknown.
 * @param {{ inputs?: unknown, outputs?: unknown }} cell @returns {string[]} */
export function resourcesOf(cell) {
  const written = `${oneLine(cell.inputs, '')},${oneLine(cell.outputs, '')}`;
  return [...new Set(written.split(/[,;]/).map((t) => t.trim().toLowerCase())
    .filter((token) => token !== '' && token !== NONE))];
}

/** The operation's declared shared resources: its `batches` grants' operations; a shared
 * one is marked `(pack)`, two cells spending one grant. @param {Operation | null} op */
export const packResources = (op) => (op?.pack.batches ?? []).map((b) => b.op.toLowerCase());

/** One cell, existing or ABOUT to exist, as a crossable party. @param {unknown} name
 * @param {string} slug @param {Record<string, unknown>} [cell] @returns {Party} */
export const partyOf = (name, slug, cell = {}) => ({
  name: oneLine(name, 'unnamed'),
  slug,
  paths: inPathsOf(cell),
  holes: parsePaths(cell.boundaryOut),
  resources: resourcesOf(cell),
  deps: parseDependencies(cell.dependencies),
});

/** PURE. The target against ONE other cell. Two overlapping paths are NOT a conflict when
 * either cell's own `NOT in:` half covers the other's path — a hole is not held. A
 * dependency declared either way is a crossing too, and a declared one is `shared`, never
 * a refusal. @param {Party} target @param {Party} other
 * @param {string[]} [pack] @returns {Crossing} */
export function crossOne(target, other, pack = []) {
  /** @type {(p: string, q: string) => boolean} */
  const held = (p, q) => !other.holes.some((h) => covers(h, p))
    && !target.holes.some((h) => covers(h, q));
  const paths = target.paths
    .filter((p) => other.paths.some((q) => pathsOverlap(p, q) && held(p, q)));
  const shared = other.resources.filter((r) => target.resources.includes(r))
    .map((r) => (pack.includes(r) ? `${r} (pack)` : r));
  if (target.deps.includes(other.slug)) shared.push(`dependency: ${other.slug}`);
  if (other.deps.includes(target.slug)) shared.push(`dependency: ${target.slug}`);
  /** @type {Crossing['verdict']} */
  const verdict = paths.length ? 'overlap' : (shared.length ? 'shared' : 'none');
  return { cell: other.name, slug: other.slug, paths, shared, verdict };
}

/** PURE. The worst verdict in the table — the one `open` acts on. @param
 * {ReadonlyArray<Crossing>} rows @returns {'overlap' | 'shared' | 'none'} */
export function worst(rows) {
  if (rows.some((r) => r.verdict === 'overlap')) return 'overlap';
  return rows.some((r) => r.verdict === 'shared') ? 'shared' : 'none';
}

/** PURE. @param {ReadonlyArray<Crossing>} rows @returns {string[]} */
export function renderTable(rows) {
  /** @type {(list: ReadonlyArray<string>) => string} */
  const cell = (list) => (list.length ? list.join(', ') : NONE);
  return ['| Cell | Overlapping paths | Shared resources | Verdict |', '|---|---|---|---|',
    ...rows.map((r) => `| ${r.cell} | ${cell(r.paths)} | ${cell(r.shared)} | ${r.verdict} |`)];
}

/** PURE. The one line the record keeps, in the three forms the method names. @param
 * {ReadonlyArray<Crossing>} rows @returns {string} */
export function conflictsField(rows) {
  const verdict = worst(rows);
  const only = rows.filter((r) => r.verdict === verdict);
  if (verdict === 'overlap') {
    return `**Conflicts:** ${only.map((r) => `overlap with ${r.cell}: ${r.paths.join(', ')}`)
      .join('; ')} — accepted by human`;
  }
  if (verdict === 'shared') {
    return `**Conflicts:** ${only
      .map((r) => `shared ${r.shared.join(', ')} with ${r.cell}`).join('; ')}`;
  }
  return '**Conflicts:** none';
}

/** Every OTHER 🔵 cell, as parties; a 🔵 row with no cell file crosses with nothing rather
 * than being guessed at. @param {string} root @param {ReadonlyArray<IndexRow>} rows
 * @param {string} skip @returns {Party[]} */
export function otherParties(root, rows, skip) {
  /** @type {Party[]} */
  const out = [];
  for (const row of rows) {
    const slug = row.slug || slugify(row.name);
    if (row.status !== '🔵' || slug === skip) continue;
    const cell = /** @type {Record<string, unknown>} */ (readCell(root, slug) ?? {});
    out.push(partyOf(row.name, slug, cell));
  }
  return out;
}

/** The whole crossing of one cell against the state on disk. @param {string} root @param
 * {ReadonlyArray<IndexRow>} rows @param {Operation | null} op @param {unknown} name
 * @param {string} slug @param {Record<string, unknown>} cell @returns {Crossing[]} */
export function crossState(root, rows, op, name, slug, cell) {
  const target = partyOf(name, slug, cell);
  const pack = packResources(op);
  return otherParties(root, rows, slug).map((other) => crossOne(target, other, pack));
}

/** The record of the crossing: its own entry under the same `## <stamp> · Operation:
 * <name>` heading as every operation entry, so `parseLog` and `check` keep ignoring it,
 * repeating the frozen finish line and its fingerprint as an amendment does. @param
 * {string} root @param {Operation} op @param {string} cell @param {string} field
 * @param {string} stamp */
export function recordConflicts(root, op, cell, field, stamp) {
  appendLogText(root, `\n${[
    '---',
    `## ${stamp} · Operation: ${oneLine(op.name, 'unnamed')}`,
    `**Status:** ${oneLine(op.status, '🔵')}`,
    `**Cell opened:** ${cell}`,
    field,
    `**Finish line:** ${renderFinishLine(op.finishLine)}`,
    `**Fingerprint:** ${oneLine(op.fingerprint, NONE)}`,
    '',
  ].join('\n')}`);
}
