// operation-file.mjs — vault/state/operations/<slug>.md, MODEL ONLY (no command
// reads or writes it yet; see README, "Operation files"). The operation is the
// human's unit of attention: one finish line, frozen at opening, and one pack whose
// vocabulary is CLOSED. Both facts are mechanical here — a key outside the vocabulary
// is an error with a name, the finish line has a fingerprint — so a moved finish line
// becomes visible instead of arguable. PURE: no filesystem, clock or environment;
// `node:crypto` computes sha256 and is not an I/O port.
import { createHash } from 'node:crypto';
import { parseFields, oneLine } from './fields.mjs';
import { slugify } from './slug.mjs';

/** @typedef {import('./types.mjs').Operation} Operation */
/** @typedef {import('./types.mjs').Pack} Pack */
/** @typedef {import('./types.mjs').PackBatch} PackBatch */

/** What an empty field looks like in the file format. */
export const NONE = '—';
const FIELD_SEP = ' · ';
const LIST_SEP = ', ';
const BATCH_SEP = '; ';
const ARROW = '→';

/** The pack's CLOSED vocabulary: these six grants, nothing else.
 * @type {ReadonlyArray<string>} */
export const PACK_GRANTS = Object.freeze([
  'spend ceiling', 'publisher', 'batches', 'requires-yes', 'denied', 'max-active-cells',
]);

/** What a pack may never grant, however it is written: skipping a gate or a test, a
 * destructive operation, a protected-resource mutation. Explicit, so the invariant
 * is readable in code and not only in the method's prose. @type {ReadonlyArray<string>} */
export const PACK_FORBIDDEN_GRANTS = Object.freeze([
  'skip-gate', 'skip-gates', 'skip-test', 'skip-tests', 'skip-build', 'skip-typecheck',
  'destructive', 'destructive-operations', 'protected-resources',
  'protected-resource-mutation', 'force-push', 'delete-data', 'schema-change',
]);

const EMPTY_PACK = () => /** @type {Pack} */ ({
  spendCeiling: '', publisher: '', batches: [], requiresYes: [], denied: [], maxActiveCells: '',
});

/** @param {unknown} value @returns {string[]} */
function splitList(value, sep = /[,;]/) {
  const text = oneLine(value, '');
  if (text === '' || text === NONE) return [];
  return text.split(sep).map((t) => t.trim()).filter((t) => t !== '' && t !== NONE);
}

/** One field value, `—` when there is nothing. @param {unknown} v @returns {string} */
const field = (v) => oneLine(v, NONE);

/** `"deploy → 1 per day"` -> `{ op, limit }`. A batch without a limit is not a grant.
 * @param {string} token @returns {PackBatch} */
function parseBatch(token) {
  const hit = /^([^→]*?)(?:→|->)(.*)$/.exec(token);
  const op = (hit?.[1] ?? '').trim();
  const limit = (hit?.[2] ?? '').trim();
  if (op === '' || limit === '') throw new Error(`PACK_BATCH_WITHOUT_LIMIT: ${op || token}`);
  return { op, limit };
}

/** PURE. One `**Authorization pack:**` value -> a Pack. ` · ` separated `key: value`
 * pairs; `—` or empty grants nothing. Throws `PACK_FORBIDDEN_GRANT: <key>`,
 * `PACK_UNKNOWN_GRANT: <key>` (outside {@link PACK_GRANTS}) or
 * `PACK_BATCH_WITHOUT_LIMIT: <op>`. @param {unknown} value @returns {Pack} */
export function parsePack(value) {
  const pack = EMPTY_PACK();
  const text = oneLine(value, '');
  if (text === '' || text === NONE) return pack;
  for (const segment of text.split('·')) {
    const raw = segment.trim();
    if (raw === '' || raw === NONE) continue;
    const at = raw.indexOf(':');
    const name = (at < 0 ? raw : raw.slice(0, at)).toLowerCase().replace(/\s+/g, ' ').trim();
    const body = at < 0 ? '' : raw.slice(at + 1).trim();
    if (PACK_FORBIDDEN_GRANTS.includes(name)) throw new Error(`PACK_FORBIDDEN_GRANT: ${name}`);
    if (!PACK_GRANTS.includes(name)) throw new Error(`PACK_UNKNOWN_GRANT: ${name}`);
    if (name === 'spend ceiling') pack.spendCeiling = body;
    if (name === 'publisher') pack.publisher = body;
    if (name === 'batches') pack.batches = splitList(body, /;/).map(parseBatch);
    if (name === 'requires-yes') pack.requiresYes = splitList(body, /,/);
    if (name === 'denied') pack.denied = splitList(body, /,/);
    if (name === 'max-active-cells') pack.maxActiveCells = body;
  }
  return pack;
}

/** PURE. A Pack -> the one-line field value, grants in {@link PACK_GRANTS} order. An
 * empty grant is omitted; a pack with no grants renders `—`. @param {unknown} input
 * @returns {string} */
export function renderPack(input) {
  const pack = makePack(input);
  const batches = pack.batches.map((b) => `${b.op} ${ARROW} ${b.limit}`).join(BATCH_SEP);
  const parts = [
    pack.spendCeiling ? `spend ceiling: ${pack.spendCeiling}` : '',
    pack.publisher ? `publisher: ${pack.publisher}` : '',
    batches ? `batches: ${batches}` : '',
    pack.requiresYes.length ? `requires-yes: ${pack.requiresYes.join(LIST_SEP)}` : '',
    pack.denied.length ? `denied: ${pack.denied.join(LIST_SEP)}` : '',
    pack.maxActiveCells ? `max-active-cells: ${pack.maxActiveCells}` : '',
  ].filter((p) => p !== '');
  return parts.length === 0 ? NONE : parts.join(FIELD_SEP);
}

/** A Pack from a Pack-shaped object or a field value. @param {unknown} input @returns {Pack} */
export function makePack(input) {
  if (typeof input === 'string' || input === undefined || input === null) return parsePack(input);
  const raw = /** @type {Record<string, unknown>} */ (input);
  const pack = EMPTY_PACK();
  pack.spendCeiling = oneLine(raw.spendCeiling, '');
  pack.publisher = oneLine(raw.publisher, '');
  pack.maxActiveCells = oneLine(raw.maxActiveCells, '');
  pack.requiresYes = Array.isArray(raw.requiresYes) ? splitList(raw.requiresYes.join(','), /,/) : [];
  pack.denied = Array.isArray(raw.denied) ? splitList(raw.denied.join(','), /,/) : [];
  const batches = Array.isArray(raw.batches) ? raw.batches : [];
  pack.batches = batches.map((b) => parseBatch(typeof b === 'string' ? b
    : `${oneLine(/** @type {PackBatch} */ (b).op, '')} ${ARROW} ${oneLine(/** @type {PackBatch} */ (b).limit, '')}`));
  return pack;
}

/** `"1. ship · 2. doc"` -> `['ship', 'doc']`. @param {unknown} value @returns {string[]} */
export function parseFinishLine(value) {
  return splitList(value, /·/).map((t) => t.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
}

/** A list -> the numbered one-line field value. @param {unknown} value @returns {string} */
export function renderFinishLine(value) {
  const items = Array.isArray(value) ? value.map((v) => oneLine(v, '')).filter(Boolean)
    : parseFinishLine(value);
  return items.length === 0 ? NONE : items.map((t, i) => `${i + 1}. ${t}`).join(FIELD_SEP);
}

/** PURE. sha256 over the NORMALIZED finish line, hex. Normalization, in order:
 * drop the `N.` numbering, collapse whitespace runs to one space, trim, lowercase,
 * drop empty items, SORT. So renumbering, reordering, re-indenting or recasing the
 * same items keeps the fingerprint; adding, removing or rewording an item changes
 * it — which is exactly "the finish line moved".
 * @param {unknown} value a list, or the field value as written
 * @returns {string} 64 lowercase hex characters */
export function fingerprintFinishLine(value) {
  const items = Array.isArray(value) ? value.map((v) => oneLine(v, '')) : parseFinishLine(value);
  const normalized = items.map((t) => t.replace(/^\d+[.)]\s*/, '').replace(/\s+/g, ' ').trim()
    .toLowerCase()).filter((t) => t !== '' && t !== NONE).sort();
  return createHash('sha256').update(normalized.join('\n'), 'utf8').digest('hex');
}

/** A complete Operation from a partial one. An absent `fingerprint` is COMPUTED from
 * the finish line. @param {Record<string, unknown>} [patch] @returns {Operation} */
export function makeOperation(patch = {}) {
  const name = oneLine(patch.name, '');
  const id = oneLine(patch.id, '');
  const finishLine = Array.isArray(patch.finishLine)
    ? patch.finishLine.map((v) => oneLine(v, '')).filter(Boolean)
    : parseFinishLine(patch.finishLine);
  const planned = Array.isArray(patch.plannedCells)
    ? patch.plannedCells.join(',') : patch.plannedCells;
  return /** @type {Operation} */ ({
    name,
    id: id === '' || id === NONE ? slugify(name) : id,
    opened: field(patch.opened),
    status: oneLine(patch.status, '🔵'),
    finishLine,
    fingerprint: oneLine(patch.fingerprint, '') || fingerprintFinishLine(finishLine),
    pack: makePack(patch.pack),
    qualityBar: field(patch.qualityBar),
    plannedCells: splitList(planned, /,/).map((t) => slugify(t)),
    spendSoFar: field(patch.spendSoFar),
  });
}

/** @param {Record<string, unknown> | Operation} [input] @returns {string} */
export function renderOperationFile(input) {
  const op = makeOperation(input);
  return [
    `# Operation: ${oneLine(op.name, 'unnamed')}`,
    `**ID:** ${field(op.id)}${FIELD_SEP}**Opened:** ${field(op.opened)}${FIELD_SEP}**Status:** ${op.status}`,
    `**Finish line (frozen):** ${renderFinishLine(op.finishLine)}`,
    `**Fingerprint:** ${field(op.fingerprint)}`,
    `**Authorization pack:** ${renderPack(op.pack)}`,
    `**Quality bar:** ${field(op.qualityBar)}`,
    `**Planned cells:** ${op.plannedCells.length ? op.plannedCells.join(LIST_SEP) : NONE}`,
    `**Spend so far:** ${field(op.spendSoFar)}`,
    '',
  ].join('\n');
}

/** @param {unknown} text @returns {Operation | null} */
export function parseOperationFile(text) {
  const src = String(text ?? '');
  const title = src.split('\n').find((l) => l.trim().startsWith('# Operation:'));
  if (!title) return null;
  const v = parseFields(src);
  return makeOperation({
    name: title.trim().slice('# Operation:'.length).trim(),
    id: v.ID, opened: v.Opened, status: v.Status, fingerprint: v.Fingerprint,
    finishLine: parseFinishLine(v['Finish line (frozen)'] ?? ''),
    pack: v['Authorization pack'], qualityBar: v['Quality bar'],
    plannedCells: v['Planned cells'], spendSoFar: v['Spend so far'],
  });
}
