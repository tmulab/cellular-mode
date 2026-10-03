// advisor-area.mjs - runs in the BROWSER. The ADVISOR area: a question box, one button, a
// silent-mode toggle and a list of model-written recommendations.
//
// Everything about WHAT to show is in `../view/advisor-view.mjs` and `advisor-presence.mjs`,
// which are pure and tested. This module only builds nodes, and is careful about four things:
//   the area is marked `data-origin="ai"` BEFORE anything is loaded, so an answer can never
//     arrive looking like a measurement (the stylesheet makes that a different SHAPE);
//   every statement is set with `textContent` - a model's sentence may legitimately contain a
//     shell command, and no renderer here treats it as anything but text;
//   the disabled state is a sentence, not an empty panel, and when the host's plugin list does
//     not name the advisor that sentence is ALL there is: no probe, no 404 (criterion D23);
//   a declared `tired` mode caps the LIST at three, with a control that reveals the rest. A
//     recommendation is never a verdict and never a measurement, so there is nothing here
//     that must be shown — unlike the audit area, where a FAIL is never capped (AD28);
//   nothing is asked on load. The area probes `status` (which consumes no call) and waits.
import { el, errorNode, replace } from './dom.mjs';
import { PROBING_NOTICE, advisorAreaState } from '../view/advisor-presence.mjs';
import {
  AI_BANNER, adapterLine, adviceRows, advisorHeadline, statusMeta, validationNotes,
} from '../view/advisor-view.mjs';
import { capAdvice } from '../view/mode-view.mjs';
import { questionBox, rowNode } from './advisor-rows.mjs';

/** @typedef {{ call: (cap: string, input?: unknown) => Promise<{ ok: true, value: unknown } | { ok: false, error: { code: string, message: string } }> }} Client */

/**
 * Renders the area and wires its controls. Called once; the button re-renders the list.
 * @param {{ host: HTMLElement, key: string, origin: 'ai', client: Client,
 *   presence?: 'listed' | 'not-listed' | 'unknown', onSelect?: (id: string) => void,
 *   mode?: string }} spec
 */
export async function renderAdvisorArea({
  host, key, origin, client, presence = 'unknown', onSelect = () => {}, mode = 'ready',
}) {
  host.setAttribute('data-origin', origin);
  const headline = el('p', { class: 'probe', text: PROBING_NOTICE });
  const adapter = el('p', { class: 'capability advisor-adapter' });
  const notes = el('ul', { class: 'advisor-notes' });
  const list = el('ul', { class: 'findings advisor-list' });
  const cap = el('p', { class: 'mode-cap' });
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
    el('p', { class: 'purpose' }, [el('span', {
      text: `${AI_BANNER}. Every sentence below was written by a model from a bounded`
        + ' context (the active cell, its declared dependencies, the recent log window and the'
        + ' last audit\'s verdicts). A label is the MODEL\'S OWN claim, checked only for being'
        + ' grounded in that evidence. Nothing here is executed, and nothing here is a measurement.',
    })]),
    el('p', { class: 'capability' }, [
      el('span', { text: 'capability ' }), el('code', { text: key }), el('span', { text: ' · advise' }),
    ]),
    controls,
    headline,
    adapter,
    notes,
    cap,
    list,
  ]);

  // The reveal control, built once: a cap that cannot be lifted is a cap that hides things.
  const more = /** @type {HTMLButtonElement} */ (el('button', {
    class: 'control', text: 'show all', attrs: { type: 'button' },
  }));
  /** @type {() => void} */
  let showAllRequested = () => {};
  more.addEventListener('click', () => showAllRequested());

  /** @param {boolean} enabled */
  const enable = (enabled) => {
    for (const control of [ask, question.input, silent]) control.disabled = !enabled;
  };
  enable(false);

  /** @param {{ state: string, text: string }} said */
  const say = (said) => {
    headline.textContent = said.text;
    headline.className = `probe probe-${said.state}`;
    host.setAttribute('data-state', said.state);
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
    let showAll = false;
    const paint = () => {
      const limited = capAdvice(rows, mode, showAll);
      replace(cap, limited.hidden === 0 ? [] : [
        el('span', { text: `${limited.hidden} more recommendation(s), not shown in ${mode} mode.` }),
        more,
      ]);
      replace(list, limited.shown.length === 0
        ? [el('li', { class: 'finding empty', text: 'the model answered nothing this build could accept.' })]
        : limited.shown.map((row) => rowNode(row, onSelect)));
    };
    showAllRequested = () => { showAll = true; paint(); };
    paint();
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
      // sentence is the one a reader needs, verbatim.
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
  // The build's own plugin list decides whether there is anything to call. A capability the
  // host does not LIST was never meant to answer, so the area states the disabled sentence
  // and stops: probing it only to render its own 404 reports a configuration choice as a
  // fault. A capability that IS listed is probed, and a refusal from it keeps its error.
  const planned = advisorAreaState(presence);
  if (!planned.probe) {
    say(planned);
    return;
  }
  const probe = await client.call('status');
  if (!probe.ok) {
    say(advisorAreaState(presence, probe));
    replace(list, [el('li', { class: 'finding empty' }, [errorNode(probe.error.code, probe.error.message)])]);
    return;
  }
  enable(true);
  showStatus(probe.value);
  const described = advisorHeadline({}, false);
  headline.textContent = described.text;
  headline.className = `probe probe-${described.tone}`;
  host.setAttribute('data-state', 'available');
}
