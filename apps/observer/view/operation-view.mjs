// operation-view.mjs — PURE. Turns the `operation` and `activeCells` of an
// `observer.state` overview into the rows the DOM module renders. No DOM here.
//
// Three decisions carry this module:
//   1. `operation: null` renders NOTHING. Outside an operation the page is exactly what
//      it was, so an empty area never has to explain itself — and the dashboard never
//      implies that the method requires an operation layer to be used.
//   2. the FINISH LINE is shown with its FINGERPRINT beside it. The finish line is frozen
//      at opening, so the one thing a reader needs is the evidence that it did not move;
//      a list without the fingerprint would be a claim, not a record.
//   3. every grant of the authorization pack is shown, including the empty ones, in the
//      pack's own closed order. A grant that disappears when empty teaches the reader
//      that absence is nothing — and the absent grant here is exactly the one nobody
//      authorized.
import { field, listField, nextStepField, statusDescriptor } from './view-model.mjs';

/** @typedef {import('./fields.mjs').Field} Field */

/** The symbol an ACTIVE operation carries. The operation statuses are not the cell
 * statuses, so the contract publishes the SYMBOL and this is the only place that
 * compares it. */
export const ACTIVE_OPERATION = '🔵';

/** The words this area uses for the two states of an operation's status. */
export const OPERATION_STATE = Object.freeze({ active: 'active', other: 'not active' });

/** The pack's six grants, in the closed order `parsePack` declares them, with the words a
 * human uses. `batches` is a list of pairs and is formatted below.
 * @type {ReadonlyArray<readonly [string, string]>} */
export const PACK_GRANTS = Object.freeze(/** @type {ReadonlyArray<readonly [string, string]>} */ ([
  ['spendCeiling', 'spend ceiling'], ['publisher', 'publisher'], ['batches', 'batches'],
  ['requiresYes', 'requires yes'], ['denied', 'denied'], ['maxActiveCells', 'max active cells'],
]).map((pair) => Object.freeze(pair)));

/** The operation's own fields, below the finish line, in reading order.
 * @type {ReadonlyArray<readonly [string, string]>} */
export const OPERATION_FIELDS = Object.freeze(/** @type {ReadonlyArray<readonly [string, string]>} */ ([
  ['fingerprint', 'finish-line fingerprint'], ['qualityBar', 'quality bar'],
  ['spendSoFar', 'spend so far'],
]).map((pair) => Object.freeze(pair)));

/** PURE. `{ op, limit }` -> `"deploy → 1 per day"`. A batch without both halves is not a
 * grant, and is said in words rather than rendered as half a sentence.
 * @param {unknown} batch @returns {string} */
function batchText(batch) {
  const record = /** @type {Record<string, unknown>} */ (batch ?? {});
  const op = field(record['op']);
  const limit = field(record['limit']);
  return `${op.text} → ${limit.text}`;
}

/** PURE. One grant of the pack as a Field. @param {Record<string, unknown>} pack
 * @param {string} key @returns {Field} */
function grantValue(pack, key) {
  if (key === 'batches') {
    const list = pack[key];
    return Array.isArray(list)
      ? listField(list.map(batchText), 'none authorized')
      : field(null);
  }
  if (key === 'requiresYes' || key === 'denied') return listField(pack[key], 'none listed');
  return field(pack[key]);
}

/**
 * PURE. The operation header, or `null` when there is no operation — which is the normal
 * state of a project that works one cell at a time.
 * @param {unknown} operation the `operation` field of an `overview` payload
 * @returns {null | { name: Field, id: string | null, status: Field, state: string,
 *   finishLine: Field[], fingerprint: Field, rows: Array<{ label: string, value: Field }>,
 *   pack: Array<{ label: string, value: Field }>, plannedCells: Field }}
 */
export function operationHeader(operation) {
  if (operation === null || typeof operation !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (operation);
  const pack = /** @type {Record<string, unknown>} */ (record['pack'] ?? {});
  const items = record['finishLine'];
  return {
    name: field(record['name']),
    id: typeof record['id'] === 'string' ? record['id'] : null,
    status: field(record['status']),
    state: record['status'] === ACTIVE_OPERATION ? OPERATION_STATE.active : OPERATION_STATE.other,
    // Numbered, because the finish line is an ordered list in the file and a reader who
    // says "item 3" must be looking at the same item 3.
    finishLine: Array.isArray(items) ? items.map((item, i) => {
      const value = field(item);
      return { text: `${i + 1}. ${value.text}`, recorded: value.recorded };
    }) : [],
    fingerprint: field(record['fingerprint']),
    rows: OPERATION_FIELDS.map(([key, label]) => ({ label, value: field(record[key]) })),
    pack: PACK_GRANTS.map(([key, label]) => ({ label, value: grantValue(pack, key) })),
    plannedCells: listField(record['plannedCells'], 'none planned'),
  };
}

/** The columns of the active-cells table, in one order. `CellSummary` carries more than
 * this; what an operation asks of a reader is WHO is active and WHAT each is doing next.
 * @type {ReadonlyArray<readonly [string, string]>} */
export const ACTIVE_COLUMNS = Object.freeze(/** @type {ReadonlyArray<readonly [string, string]>} */ ([
  ['name', 'cell'], ['area', 'area'], ['lastVisit', 'last visit'], ['nextStep', 'next step'],
]).map((pair) => Object.freeze(pair)));

/**
 * PURE. One row per 🔵 cell, nothing dropped and nothing summarised: inside an operation
 * several cells are legitimately active, and a dashboard that showed only the first one
 * would be hiding the others from the person responsible for all of them.
 * @param {unknown} cells the `activeCells` field of an `overview` payload
 * @returns {Array<{ id: string, status: ReturnType<typeof statusDescriptor>, cells: Field[] }>}
 */
export function activeCellsRows(cells) {
  const list = Array.isArray(cells) ? cells : [];
  return list.map((entry) => {
    const record = /** @type {Record<string, unknown>} */ (entry ?? {});
    const status = statusDescriptor(record['status']);
    return {
      id: typeof record['id'] === 'string' ? record['id'] : '',
      status,
      cells: ACTIVE_COLUMNS.map(([key]) => {
        if (key === 'nextStep') return nextStepField(record);
        return field(record[key]);
      }),
    };
  });
}
