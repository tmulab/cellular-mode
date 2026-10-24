// operation-area.mjs — runs in the BROWSER. The OPERATION area: the operation the active
// cells belong to, its frozen finish line, its authorization pack, and the table of every
// 🔵 cell inside it.
//
// Everything about WHAT to show is in `../view/operation-view.mjs`, which is pure and
// tested. This module only builds nodes, and it is careful about one thing above all: when
// there is no operation the area is HIDDEN and emptied. A project worked one cell at a
// time is not missing anything, and an empty panel that says "no operation" would turn the
// optional layer into something the reader thinks they forgot.
import { el, fieldNode, replace } from './dom.mjs';
import { ACTIVE_COLUMNS, activeCellsRows, operationHeader } from '../view/operation-view.mjs';

/** @typedef {import('../view/fields.mjs').Field} Field */

/** @param {{ label: string, value: Field }} row @returns {HTMLElement} */
const rowNode = (row) => el('div', { class: 'operation-row' }, [
  el('span', { class: 'label', text: row.label }),
  fieldNode(row.value, 'span'),
]);

/** @param {Field} value @param {string} column @returns {HTMLElement} */
const cellNode = (value, column) => el('td', {
  class: value.recorded ? `col-${column}` : `col-${column} absent`,
  text: value.text,
});

/** The 🔵 cells of the operation, as a real table with header scopes — the same
 * accessible shape the cells table uses, for the same reasons.
 * @param {ReturnType<typeof activeCellsRows>} rows @param {(id: string) => void} onSelect */
function tableNode(rows, onSelect) {
  const head = el('tr', {}, ACTIVE_COLUMNS.map(([, label]) => el('th', {
    text: label, attrs: { scope: 'col' },
  })));
  const body = rows.map((row) => {
    const tr = el('tr', {
      class: `row status-${row.status.key}`,
      attrs: { 'data-id': row.id, tabindex: '0', role: 'button', 'aria-label': `open ${row.id}` },
    }, row.cells.map((value, index) => cellNode(value, ACTIVE_COLUMNS[index]?.[0] ?? String(index))));
    tr.addEventListener('click', () => onSelect(row.id));
    tr.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onSelect(row.id);
    });
    return tr;
  });
  return el('table', { class: 'cells active-cells' }, [
    el('caption', { text: `${rows.length} active cells in this operation` }),
    el('thead', {}, [head]),
    el('tbody', {}, body.length === 0
      ? [el('tr', {}, [el('td', {
        text: 'no active cell', attrs: { colspan: String(ACTIVE_COLUMNS.length) },
      })])]
      : body),
  ]);
}

/**
 * Renders the operation area. `overview.operation === null` hides it: nothing is drawn,
 * nothing is claimed, and the rest of the page is exactly what it always was.
 * @param {HTMLElement} host
 * @param {unknown} overview the whole `overview` payload
 * @param {(id: string) => void} onSelect
 */
export function renderOperationArea(host, overview, onSelect) {
  const value = /** @type {Record<string, unknown>} */ (overview ?? {});
  const header = operationHeader(value['operation']);
  if (header === null) {
    replace(host, []);
    host.hidden = true;
    return;
  }
  const rows = activeCellsRows(value['activeCells']);
  host.hidden = false;
  if (header.id === null) host.removeAttribute('data-operation');
  else host.setAttribute('data-operation', header.id);
  replace(host, [
    el('header', { class: 'area-head' }, [
      el('h3', { class: 'operation-name' }, [
        el('span', { class: 'glyph', text: header.status.text }),
        el('span', { text: ` ${header.name.text}` }),
      ]),
      el('span', { class: 'operation-state', text: header.state }),
    ]),
    el('h4', { text: 'Finish line (frozen)' }),
    el('ol', { class: 'finish-line' }, header.finishLine.length === 0
      ? [el('li', { class: 'empty', text: 'not recorded' })]
      : header.finishLine.map((item) => fieldNode(item, 'li'))),
    rowNode({ label: 'fingerprint', value: header.fingerprint }),
    el('div', { class: 'operation-fields' }, header.rows.map(rowNode)),
    el('h4', { text: 'Authorization pack' }),
    el('div', { class: 'operation-pack' }, header.pack.map(rowNode)),
    rowNode({ label: 'planned cells', value: header.plannedCells }),
    el('h4', { text: 'Active cells' }),
    tableNode(rows, onSelect),
  ]);
}
