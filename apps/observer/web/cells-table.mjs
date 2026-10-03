// cells-table.mjs — runs in the BROWSER. The cells table IS the accessible alternative to
// the graph, and it is not a reduced version of it: every field of every `CellSummary`,
// every cell, in a real `<table>` with a caption and header scopes.
//
// It is also the fallback that always works — no WebGL, no pointer, no colour vision, 500
// cells, a screen reader, a 320 px phone. The drawing is the optional view; this is the
// one that must never be the thing that broke.
import { el, replace } from './dom.mjs';
import { CELL_COLUMNS, cellsTableRows } from '../view/view-model.mjs';

/** @param {{ text: string, recorded: boolean }} value @param {string} column @returns {HTMLElement} */
function cellNode(value, column) {
  return el('td', {
    class: value.recorded ? `col-${column}` : `col-${column} absent`,
    text: value.text,
  });
}

/**
 * @param {HTMLElement} host
 * @param {unknown} cells
 * @param {(id: string) => void} onSelect
 */
export function renderCellsTable(host, cells, onSelect) {
  const rows = cellsTableRows(cells);
  const head = el('tr', {}, CELL_COLUMNS.map(([, label]) => el('th', { text: label, attrs: { scope: 'col' } })));
  const body = rows.map((row) => {
    const tr = el('tr', {
      class: `row status-${row.status.key}`,
      attrs: { 'data-id': row.id, tabindex: '0', role: 'button', 'aria-label': `open ${row.id}` },
    }, row.cells.map((value, index) => cellNode(value, CELL_COLUMNS[index]?.[0] ?? String(index))));
    tr.addEventListener('click', () => onSelect(row.id));
    tr.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onSelect(row.id);
    });
    return tr;
  });
  const table = el('table', { class: 'cells' }, [
    el('caption', { text: `${rows.length} cells — the complete textual reading of the graph` }),
    el('thead', {}, [head]),
    el('tbody', {}, body.length === 0 ? [el('tr', {}, [el('td', { text: 'no cells recorded', attrs: { colspan: String(CELL_COLUMNS.length) } })])] : body),
  ]);
  replace(host, [table]);
}

/** Moves the visible selection without re-rendering: the table keeps its scroll position
 * while the graph and the table agree on what is selected.
 * @param {HTMLElement} host @param {string | null} id */
export function markSelectedRow(host, id) {
  for (const row of host.querySelectorAll('tr.row')) {
    const selected = id !== null && row.getAttribute('data-id') === id;
    row.classList.toggle('selected', selected);
    if (selected) row.setAttribute('aria-current', 'true');
    else row.removeAttribute('aria-current');
  }
}
