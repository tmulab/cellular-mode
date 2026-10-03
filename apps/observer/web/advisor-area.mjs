// advisor-area.mjs - runs in the BROWSER. The ADVISOR area: a question box, one button, a
// silent-mode toggle and a list of model-written recommendations.
//
// Everything about WHAT to show is in `../view/advisor-view.mjs`, which is pure and tested.
// This module only builds nodes, and it is careful about four things:
//   the area is marked `data-origin="ai"` BEFORE anything is loaded, so an answer can never
//     arrive looking like a measurement (the stylesheet makes that a different SHAPE);
//   every statement is set with `textContent` - a model's sentence may legitimately contain a
//     shell command, and no renderer here treats it as anything but text;
//   the disabled state is a sentence, not an empty panel: the advisor is optional;
//   nothing is asked on load. The area probes `status` (which consumes no call) and waits.
import { el, errorNode, fieldNode, replace } from './dom.mjs';
import { describeProbe } from '../view/availability.mjs';
import {
  AI_BANNER, adapterLine, adviceRows, advisorHeadline, disabledNotice, statusMeta, validationNotes,
} from '../view/advisor-view.mjs';

/** @typedef {{ call: (cap: string, input?: unknown) => Promise<{ ok: true, value: unknown } | { ok: false, error: { code: string, message: string } }> }} Client */
/** @typedef {ReturnType<typeof adviceRows>[number]} Row */

/** The question box. 500 is the contract's cap, enforced here so a refusal is not how a
 * reader finds out. @param {string} id */
function questionBox(id) {
  const input = /** @type {HTMLInputElement} */ (el('input', {
    class: 'question',
    attrs: { id, type: 'text', maxlength: '500', placeholder: 'optional question about the active cell' },
  }));
  return { wrap: el('label', { class: 'filter-wrap' }, [el('span', { text: 'question ' }), input]), input };
}

/** @param {Row} row @param {(id: string) => void} onSelect @returns {HTMLElement} */
function rowNode(row, onSelect) {
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

/**
 * Renders the area and wires its controls. Called once; the button re-renders the list.
 * @param {{ host: HTMLElement, key: string, origin: 'ai', client: Client,
 *   onSelect?: (id: string) => void }} spec
 */
export async function renderAdvisorArea({ host, key, origin, client, onSelect = () => {} }) {
  host.setAttribute('data-origin', origin);
  const headline = el('p', { class: 'probe', text: 'checking whether the advisor is loaded...' });
  const adapter = el('p', { class: 'capability advisor-adapter' });
  const notes = el('ul', { class: 'advisor-notes' });
  const list = el('ul', { class: 'findings advisor-list' });
  const question = questionBox('advisor-question');
  const ask = /** @type {HTMLButtonElement} */ (el('button', {
    class: 'control', text: 'ask the advisor', attrs: { type: 'button' },
  }));
  const silent = /** @type {HTMLInputElement} */ (el('input', {
    attrs: { id: 'advisor-silent', type: 'checkbox' },
  }));
  const controls = el('div', { class: 'panel-head' }, [
    ask,
    question.wrap,
    el('label', { class: 'filter-wrap' }, [
      silent, el('span', { text: ' silent mode (accumulate, do not interrupt)' }),
    ]),
  ]);

  replace(host, [
    el('header', { class: 'area-head' }, [
      el('h2', { text: 'Advisor' }),
      el('span', { class: 'origin origin-ai', text: 'AI-GENERATED' }),
    ]),
    el('p', { class: 'purpose' }, [
      el('span', {
        text: `${AI_BANNER}. Every sentence below was written by a model from a bounded`
          + ' context (the active cell, its declared dependencies, the recent log window and the'
          + ' last audit\'s verdicts). A label is the MODEL\'S OWN claim, checked only for being'
          + ' grounded in that evidence. Nothing here is executed, and nothing here is a measurement.',
      }),
    ]),
    el('p', { class: 'capability' }, [
      el('span', { text: 'capability ' }), el('code', { text: key }), el('span', { text: ' · advise' }),
    ]),
    controls,
    headline,
    adapter,
    notes,
    list,
  ]);

  /** @param {boolean} enabled */
  const enable = (enabled) => {
    for (const control of [ask, question.input, silent]) control.disabled = !enabled;
  };
  enable(false);

  /** @param {{ code: string, message: string }} failure */
  const fail = (failure) => {
    const described = disabledNotice(describeProbe({ ok: false, error: failure }));
    headline.textContent = described.text;
    headline.className = `probe probe-${described.state}`;
    host.setAttribute('data-state', described.state);
    enable(false);
    replace(list, [el('li', { class: 'finding empty' }, [errorNode(failure.code, failure.message)])]);
  };

  /** @param {unknown} value */
  const showStatus = (value) => {
    adapter.textContent = `adapter: ${adapterLine(statusMeta(value)).text}`;
  };

  /** @param {unknown} value */
  const showAdvice = (value) => {
    const record = /** @type {Record<string, unknown>} */ (value ?? {});
    const described = advisorHeadline(record, true);
    headline.textContent = described.text;
    headline.className = `probe probe-${described.tone}`;
    const meta = record['meta'];
    if (meta !== undefined) {
      const line = adapterLine(meta);
      adapter.textContent = `adapter: ${line.text}`;
    }
    replace(notes, validationNotes(meta).map((note) => el('li', { class: 'advisor-note', text: note })));
    const rows = adviceRows(record['recommendations']);
    replace(list, rows.length === 0
      ? [el('li', { class: 'finding empty', text: 'the model answered nothing this build could accept.' })]
      : rows.map((row) => rowNode(row, onSelect)));
  };

  const advise = async () => {
    enable(false);
    headline.textContent = 'asking the model...';
    const answer = await client.call('advise', {
      ...(question.input.value.trim() === '' ? {} : { question: question.input.value.trim() }),
      mode: silent.checked ? 'silent' : 'on-demand',
    });
    enable(true);
    if (!answer.ok) {
      // A refused call is not a disabled advisor: a limit answers INPUT_INVALID, and that
      // sentence is the one a reader needs.
      headline.textContent = `${answer.error.code}: ${answer.error.message}`;
      headline.className = 'probe probe-unknown';
      return;
    }
    showAdvice(answer.value);
    if (silent.checked) {
      const accumulated = await client.call('recommendations');
      if (accumulated.ok) {
        const count = /** @type {Record<string, unknown>} */ (accumulated.value ?? {})['count'];
        notes.appendChild(el('li', {
          class: 'advisor-note', text: `${String(count)} recommendation(s) accumulated in this session.`,
        }));
      }
    }
  };

  ask.addEventListener('click', () => { void advise(); });
  const probe = await client.call('status');
  if (!probe.ok) {
    fail(probe.error);
    return;
  }
  enable(true);
  showStatus(probe.value);
  const described = advisorHeadline({}, false);
  headline.textContent = described.text;
  headline.className = `probe probe-${described.tone}`;
  host.setAttribute('data-state', 'available');
}
