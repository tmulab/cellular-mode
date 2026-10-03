// timeline-list.mjs — runs in the BROWSER. The timeline comes from the log entries and
// from nothing else.
//
// The protocol records a pause and a completion. It does NOT record opening or resuming a
// cell, so those moments do not exist in the timeline — and the list says so, every time,
// in its own note. Inferring "it must have been opened here" would be the dashboard
// inventing history, which is the one thing a memory tool may never do.
import { el, fieldNode, replace } from './dom.mjs';
import { TIMELINE_NOTE, timelineRows } from '../view/view-model.mjs';
import { timelineCellOf } from '../view/mode-view.mjs';

/** @param {{ at: { text: string, recorded: boolean }, cell: { text: string, recorded: boolean }, kind: string, lines: Array<{ label: string, value: { text: string, recorded: boolean } }> }} row */
function eventNode(row) {
  return el('li', { class: `event kind-${row.kind}` }, [
    el('div', { class: 'event-head' }, [
      el('time', { class: 'at', text: row.at.text }),
      el('span', { class: `kind kind-${row.kind}`, text: row.kind }),
      el('span', { class: 'cell', text: row.cell.text }),
    ]),
    el('dl', { class: 'event-body' }, row.lines.flatMap((line) => [
      el('dt', { text: line.label }),
      el('dd', {}, [fieldNode(line.value)]),
    ])),
  ]);
}

/**
 * A declared `focus` mode narrows this list to the ACTIVE CELL by default — a presentation
 * default, never a claim about what was recorded: the control that restores the whole project
 * is always there, and the count of what it would add is stated before you click it.
 * @param {HTMLElement} host
 * @param {unknown} timeline
 * @param {{ mode?: string, activeCell?: string | null }} [presentation]
 */
export function renderTimeline(host, timeline, { mode = 'ready', activeCell = null } = {}) {
  const value = /** @type {Record<string, unknown>} */ (timeline ?? {});
  const events = timelineRows(value['events']);
  const notRecorded = Array.isArray(value['notRecorded']) ? value['notRecorded'].map(String) : ['open', 'resume'];
  const only = timelineCellOf(mode, activeCell);
  const list = el('ol', { class: 'timeline' });
  const cap = el('p', { class: 'mode-cap' });
  const all = /** @type {HTMLButtonElement} */ (el('button', {
    class: 'control', text: 'show the whole project', attrs: { type: 'button' },
  }));
  let filtering = only !== null;
  const draw = () => {
    const shown = filtering && only !== null ? events.filter((row) => row.cell.text === only) : events;
    const hidden = events.length - shown.length;
    replace(cap, hidden === 0 ? [] : [
      el('span', { text: `${hidden} more entry/entries from other cells, not shown in ${mode} mode.` }),
      all,
    ]);
    replace(list, shown.length === 0
      ? [el('li', { class: 'empty', text: 'no entries recorded' })]
      : shown.map(eventNode));
  };
  all.addEventListener('click', () => { filtering = false; draw(); });
  replace(host, [
    el('p', { class: 'protocol-note' }, [
      el('b', { text: `${notRecorded.join('/')} ` }),
      el('span', { text: TIMELINE_NOTE.replace(/^open\/resume /, '') }),
    ]),
    cap,
    list,
  ]);
  draw();
}
