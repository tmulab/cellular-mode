// view-model.mjs — PURE. Turns an `observer.state` payload into the rows, labels and
// shapes the DOM modules render. No DOM here, so every rule below is testable in node,
// which is the only reason the browser code can stay thin enough to review by eye.
//
// Two decisions carry the whole module:
//   1. a `null` from the API means THE PROTOCOL DID NOT RECORD IT, and that is rendered
//      as the literal words — never as an empty cell, a dash, or a plausible guess;
//   2. a status is a SHAPE and a WORD before it is a colour. Colour alone fails for a
//      colour-blind reader, in high contrast mode, and on a printed page.

/** The one phrasing for "the vault does not have this". */
export const NOT_RECORDED = 'not recorded';

/** The note the timeline must always carry (the protocol logs pause and completion). */
export const TIMELINE_NOTE = 'open/resume not recorded by the protocol';

/** @typedef {{ text: string, recorded: boolean }} Field */

/** PURE. A nullable contract value as a field. Empty strings count as absent: a field
 * the writer left blank is not a fact either.
 * @param {unknown} value @returns {Field} */
export function field(value) {
  if (value === null || value === undefined) return { text: NOT_RECORDED, recorded: false };
  const text = typeof value === 'string' ? value.trim() : String(value);
  if (text === '') return { text: NOT_RECORDED, recorded: false };
  return { text, recorded: true };
}

/** PURE. A list as a field: an empty list is recorded as the explicit absence of edges.
 * @param {unknown} value @param {string} [emptyText] @returns {Field} */
export function listField(value, emptyText = 'none declared') {
  if (!Array.isArray(value)) return field(null);
  if (value.length === 0) return { text: emptyText, recorded: true };
  return { text: value.map((item) => String(item)).join(', '), recorded: true };
}

/** Status → the shape and word that carry it without colour.
 * @type {Readonly<Record<string, { shape: string, label: string, symbol: string }>>} */
export const STATUS_SHAPES = Object.freeze({
  planned: { shape: 'square', label: 'planned', symbol: '[ ]' },
  active: { shape: 'circle', label: 'active', symbol: '( )' },
  paused: { shape: 'diamond', label: 'paused', symbol: '< >' },
  done: { shape: 'hexagon', label: 'done', symbol: '<+>' },
});

/** What an unrecognised status renders as. Reported, never silently mapped to a known
 * one: a status this build does not know about is information, not noise. */
export const UNKNOWN_STATUS = Object.freeze({
  key: 'unknown', shape: 'triangle', label: 'unknown status', symbol: '/?\\',
});

/** PURE. @param {unknown} status
 * @returns {{ key: string, shape: string, label: string, symbol: string }} */
export function statusDescriptor(status) {
  const key = typeof status === 'string' ? status : '';
  const known = STATUS_SHAPES[key];
  if (known === undefined) return UNKNOWN_STATUS;
  return { key, ...known };
}

/** The four counts, in the order the page shows them: what asks something of you now
 * comes first. `emphasis` is weight, not colour — 47 done cells are history.
 * @type {ReadonlyArray<string>} */
export const COUNT_ORDER = Object.freeze(['active', 'paused', 'planned', 'done']);

/** PURE. @param {Record<string, unknown>} counts
 * @returns {Array<{ key: string, label: string, value: number, emphasis: 'strong' | 'quiet' }>} */
export function overviewTiles(counts) {
  const source = counts ?? {};
  return COUNT_ORDER.map((key) => {
    const raw = source[key];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    const strong = key === 'active' || (key === 'paused' && value > 0);
    return { key, label: statusDescriptor(key).label, value, emphasis: strong ? 'strong' : 'quiet' };
  });
}

/** PURE. The active-cell headline. No active cell is a legitimate state of the method
 * (everything paused, or nothing opened yet) and is said plainly.
 * @param {unknown} active @returns {{ text: string, recorded: boolean, id: string | null }} */
export function activeCellLine(active) {
  if (active === null || typeof active !== 'object') {
    return { text: 'no active cell', recorded: false, id: null };
  }
  const record = /** @type {Record<string, unknown>} */ (active);
  const name = field(record['name']);
  const id = typeof record['id'] === 'string' ? record['id'] : null;
  return { text: name.text, recorded: name.recorded, id };
}

/** The textual alternative to the graph: every field of `CellSummary`, in one order.
 * @type {ReadonlyArray<readonly [string, string]>} */
export const CELL_COLUMNS = Object.freeze([
  /** @type {readonly [string, string]} */ (['id', 'id']),
  /** @type {readonly [string, string]} */ (['name', 'name']),
  /** @type {readonly [string, string]} */ (['area', 'area']),
  /** @type {readonly [string, string]} */ (['status', 'status']),
  /** @type {readonly [string, string]} */ (['lastVisit', 'last visit']),
  /** @type {readonly [string, string]} */ (['nextStep', 'next step']),
  /** @type {readonly [string, string]} */ (['dependencies', 'dependencies']),
]);

/** PURE. One row per cell, one cell per row, nothing dropped.
 * @param {unknown} cells
 * @returns {Array<{ id: string, status: ReturnType<typeof statusDescriptor>, cells: Field[] }>} */
export function cellsTableRows(cells) {
  const list = Array.isArray(cells) ? cells : [];
  return list.map((entry) => {
    const record = /** @type {Record<string, unknown>} */ (entry ?? {});
    const status = statusDescriptor(record['status']);
    return {
      id: typeof record['id'] === 'string' ? record['id'] : '',
      status,
      cells: CELL_COLUMNS.map(([key]) => {
        if (key === 'dependencies') return listField(record[key]);
        if (key === 'status') return { text: `${status.symbol} ${status.label}`, recorded: true };
        return field(record[key]);
      }),
    };
  });
}

/** Every field of `cell-detail`, in reading order. The panel shows all of them, always:
 * a field that disappears when empty teaches the reader that absence is nothing.
 * @type {ReadonlyArray<readonly [string, string]>} */
export const DETAIL_FIELDS = Object.freeze(/** @type {ReadonlyArray<readonly [string, string]>} */ ([
  ['name', 'name'], ['status', 'status'], ['area', 'area'], ['objective', 'objective'],
  ['boundary.in', 'boundary — in'], ['boundary.out', 'boundary — out'],
  ['inputs', 'inputs'], ['outputs', 'outputs'],
  ['allowedOperations', 'allowed operations'], ['prohibitedOperations', 'prohibited operations'],
  ['dependencies', 'dependencies'], ['doneCriterion', 'done criterion'],
  ['lastFact', 'last fact'], ['build', 'build'], ['decisions', 'decisions'],
  ['openIssues', 'open issues'], ['minimalContext', 'minimal context'],
  ['nextStep', 'next step'],
]).map((pair) => Object.freeze(pair)));

/** PURE. `a.b` lookup, one level deep, which is all the contract uses.
 * @param {Record<string, unknown>} source @param {string} path @returns {unknown} */
function at(source, path) {
  const [head, tail] = path.split('.');
  if (head === undefined) return undefined;
  const first = source[head];
  if (tail === undefined) return first;
  if (first === null || typeof first !== 'object') return null;
  return /** @type {Record<string, unknown>} */ (first)[tail];
}

/** PURE. @param {unknown} detail
 * @returns {{ rows: Array<{ label: string, value: Field }>, evidence: Array<{ label: string, value: Field }>, unavailable: string[] }} */
export function detailRows(detail) {
  const record = /** @type {Record<string, unknown>} */ (detail ?? {});
  const evidenceSource = /** @type {Record<string, unknown>} */ (record['evidence'] ?? {});
  return {
    rows: DETAIL_FIELDS.map(([path, label]) => ({
      label,
      value: path === 'dependencies' ? listField(at(record, path)) : field(at(record, path)),
    })),
    evidence: [
      { label: 'log entries', value: field(evidenceSource['logEntries']) },
      { label: 'last status', value: field(evidenceSource['lastStatus']) },
      { label: 'last build', value: field(evidenceSource['lastBuild']) },
    ],
    unavailable: Array.isArray(record['unavailable']) ? record['unavailable'].map(String) : [],
  };
}

/** PURE. One timeline entry, flattened for a list item.
 * @param {unknown} events
 * @returns {Array<{ at: Field, cell: Field, kind: string, lines: Array<{ label: string, value: Field }> }>} */
export function timelineRows(events) {
  const list = Array.isArray(events) ? events : [];
  return list.map((entry) => {
    const record = /** @type {Record<string, unknown>} */ (entry ?? {});
    const kind = typeof record['kind'] === 'string' ? record['kind'] : 'unknown';
    return {
      at: field(record['at']),
      cell: field(record['cell']),
      kind,
      lines: [
        { label: 'status', value: field(record['status']) },
        { label: 'facts', value: field(record['facts']) },
        { label: 'decisions', value: field(record['decisions']) },
        { label: 'build', value: field(record['build']) },
        { label: 'next step', value: field(record['nextStep']) },
      ],
    };
  });
}
