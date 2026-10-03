// cell-detail.mjs — runs in the BROWSER. The panel for one cell: EVERY field of the
// `cell-detail` contract, always all of them, with `not recorded` in place of each null.
//
// Why every field, including the empty ones: a panel that hides what is missing teaches
// the reader that nothing is missing. In a method whose first rule is "recorded or it did
// not happen", the empty fields are the most actionable thing on the screen.
import { el, errorNode, fieldNode, replace } from './dom.mjs';
import { detailRows, statusDescriptor } from '../view/view-model.mjs';

/** @param {{ label: string, value: { text: string, recorded: boolean } }} row @returns {HTMLElement} */
function rowNode(row) {
  return el('div', { class: row.value.recorded ? 'detail-row' : 'detail-row absent-row' }, [
    el('dt', { text: row.label }),
    el('dd', {}, [fieldNode(row.value)]),
  ]);
}

/**
 * @param {HTMLElement} host
 * @param {unknown} detail
 * @param {() => void} onClose
 */
export function renderCellDetail(host, detail, onClose) {
  const record = /** @type {Record<string, unknown>} */ (detail ?? {});
  const { rows, evidence, unavailable } = detailRows(detail);
  const status = statusDescriptor(record['status']);
  const close = el('button', { class: 'close', text: 'close', attrs: { type: 'button' } });
  close.addEventListener('click', onClose);
  replace(host, [
    el('header', { class: 'detail-head' }, [
      el('h3', { text: String(record['name'] ?? record['id'] ?? 'cell') }),
      el('p', { class: `meta status-${status.key}` }, [
        el('span', { class: 'glyph', text: status.symbol }),
        el('span', { text: ` ${status.label} · ${String(record['id'] ?? '')}` }),
      ]),
      close,
    ]),
    el('dl', { class: 'detail' }, rows.map(rowNode)),
    el('h4', { text: 'evidence' }),
    el('dl', { class: 'detail evidence' }, evidence.map(rowNode)),
    ...(unavailable.length === 0 ? [] : [el('p', { class: 'unavailable' }, [
      el('b', { text: 'unavailable: ' }),
      el('span', { text: unavailable.join(', ') }),
      el('span', { class: 'note', text: ' — the host could not read these, so they are not shown as values' }),
    ])]),
  ]);
  host.hidden = false;
  close.focus();
}

/** @param {HTMLElement} host @param {{ code: string, message: string }} error */
export function renderDetailFailure(host, error) {
  replace(host, [errorNode(error.code, error.message)]);
  host.hidden = false;
}

/** @param {HTMLElement} host */
export function hideCellDetail(host) {
  host.hidden = true;
  replace(host, []);
}
