// advisor-rows.mjs — runs in the BROWSER. The two node builders of the ADVISOR area: the
// question box and one recommendation row.
//
// Extracted from `advisor-area.mjs` when the mode-aware cap arrived and that file reached the
// 200-line rule. Nothing changed on the way out: the same functions, with the same care.
// Every statement is set with `textContent` — a model's sentence may legitimately contain a
// shell command, and no renderer here treats it as anything but text.
import { el, fieldNode } from './dom.mjs';
import { adviceRows } from '../view/advisor-view.mjs';

/** @typedef {ReturnType<typeof adviceRows>[number]} Row */

/** The question box. 500 is the contract's cap, enforced here so a refusal is not how a
 * reader finds out. @param {string} id */
export function questionBox(id) {
  const input = /** @type {HTMLInputElement} */ (el('input', {
    class: 'question',
    attrs: { id, type: 'text', maxlength: '500', placeholder: 'optional question about the active cell' },
  }));
  return { wrap: el('label', { class: 'filter-wrap' }, [el('span', { text: 'question ' }), input]), input };
}

/** @param {Row} row @param {(id: string) => void} onSelect @returns {HTMLElement} */
export function rowNode(row, onSelect) {
  const head = el('div', { class: 'finding-head' }, [
    el('span', { class: `badge advisor-${row.mark.tone}`, attrs: { title: row.mark.meaning } }, [
      el('span', { class: 'glyph', text: row.mark.symbol }),
      el('span', { text: ` ${row.mark.label}` }),
    ]),
    el('b', { class: 'finding-rule', text: row.kind }),
    el('code', { class: 'finding-id', text: row.id }),
  ]);
  const body = [head, fieldNode(row.statement, 'p')];
  body.push(el('p', { class: 'advisor-uncertainty' }, [
    el('span', { class: 'action-label', text: 'uncertainty: ' }),
    fieldNode(row.uncertainty),
  ]));
  body.push(el('p', { class: 'evidence-refs' }, [
    el('span', { class: 'action-label', text: 'grounded in: ' }),
    ...(row.hasRefs
      ? row.refs.map((ref) => {
        if (ref.cell === null) return el('code', { class: 'ref', text: ref.text });
        const link = /** @type {HTMLButtonElement} */ (el('button', {
          class: 'ref ref-cell', text: ref.text, attrs: { type: 'button' },
        }));
        link.addEventListener('click', () => onSelect(/** @type {string} */ (ref.cell)));
        return link;
      })
      : [el('span', { class: 'value absent', text: 'nothing in the supplied evidence' })]),
  ]));
  return el('li', {
    class: `finding advisor-rec advisor-${row.mark.tone}`,
    attrs: { 'data-label': row.mark.key },
  }, body);
}
