// audit-area.mjs — runs in the BROWSER. The AUDIT area: summary counts, a findings table with
// filters, and one button that asks the plugin to run.
//
// Everything about WHAT to show is in `../view/audit-view.mjs`, which is pure and tested. This
// module only builds nodes. Three things it is careful about:
//   the DETERMINISTIC label is in the markup from the start, so a finding can never arrive
//     looking like an opinion (and an advisor answer can never arrive looking like a finding);
//   UNAVAILABLE is rendered with its own word, symbol and dashed outline — never as a pass;
//   the button is the only interaction, it calls a read-only capability, and while it waits it
//     says so instead of leaving the old numbers on screen as if they were fresh.
import { el, errorNode, fieldNode, replace } from './dom.mjs';
import { describeProbe } from '../view/availability.mjs';
import {
  AUDIT_STATUSES, auditHeadline, filterRows, findingRows, scopeOptions, statusMark, summaryTiles,
} from '../view/audit-view.mjs';

/** @typedef {{ call: (cap: string, input?: unknown) => Promise<{ ok: true, value: unknown } | { ok: false, error: { code: string, message: string } }> }} Client */
/** @typedef {ReturnType<typeof findingRows>[number]} Row */

/** @param {ReturnType<typeof summaryTiles>[number]} tile @returns {HTMLElement} */
const tileNode = (tile) => el('div', { class: `tile ${tile.emphasis} audit-${tile.tone}`, attrs: { title: tile.meaning } }, [
  el('b', { text: String(tile.value) }),
  el('span', { class: 'tile-label' }, [
    el('span', { class: 'glyph', text: tile.symbol }),
    el('span', { text: ` ${tile.label}` }),
  ]),
]);

/** @param {Row} row @returns {HTMLElement} */
function rowNode(row) {
  const head = el('div', { class: 'finding-head' }, [
    el('span', { class: `verdict audit-${row.mark.tone}` }, [
      el('span', { class: 'glyph', text: row.mark.symbol }),
      el('span', { text: ` ${row.mark.label}` }),
    ]),
    el('b', { class: 'finding-rule', text: row.rule }),
    el('span', { class: 'finding-scope', text: row.scope }),
    el('code', { class: 'finding-id', text: row.id }),
  ]);
  const body = [head, el('p', { class: 'finding-why', text: row.explanation.text })];
  if (row.evidence.length > 0) {
    body.push(el('ul', { class: 'evidence' }, row.evidence.map((line) => el('li', {}, [
      el('code', { text: line }),
    ]))));
  }
  if (row.hasAction) {
    body.push(el('p', { class: 'finding-action' }, [
      el('span', { class: 'action-label', text: 'suggested: ' }),
      fieldNode(row.action),
    ]));
  }
  return el('li', { class: `finding audit-${row.mark.tone}`, attrs: { 'data-status': row.mark.key } }, body);
}

/** A labelled <select>, with "every" as the empty option: a filter that cannot be cleared is
 * a filter that hides things.
 * @param {string} id @param {string} label @param {ReadonlyArray<readonly [string, string]>} options
 * @returns {{ wrap: HTMLElement, select: HTMLSelectElement }} */
function selectNode(id, label, options) {
  const select = /** @type {HTMLSelectElement} */ (el('select', { class: 'filter', attrs: { id } }));
  for (const [value, text] of [/** @type {readonly [string, string]} */ (['', `every ${label}`]), ...options]) {
    const option = /** @type {HTMLOptionElement} */ (el('option', { text }));
    option.value = value;
    select.appendChild(option);
  }
  return {
    wrap: el('label', { class: 'filter-wrap' }, [el('span', { text: `${label} ` }), select]),
    select,
  };
}

/**
 * Renders the area and wires its button. Called once; the button re-renders the table in place.
 * @param {{ host: HTMLElement, key: string, client: Client }} spec
 */
export async function renderAuditArea({ host, key, client }) {
  host.setAttribute('data-origin', 'deterministic');
  const headline = el('p', { class: 'probe', text: 'reading the last audit…' });
  const tiles = el('div', { class: 'tiles audit-tiles' });
  const list = el('ul', { class: 'findings' });
  const status = selectNode('audit-status', 'status', AUDIT_STATUSES.map((value) => (
    /** @type {readonly [string, string]} */ ([value, `${statusMark(value).symbol} ${statusMark(value).label}`]))));
  const scope = selectNode('audit-scope', 'scope', []);
  const button = /** @type {HTMLButtonElement} */ (el('button', { class: 'control', text: 'run audit', attrs: { type: 'button' } }));

  replace(host, [
    el('header', { class: 'area-head' }, [
      el('h2', { text: 'Audit' }),
      el('span', { class: 'origin origin-deterministic', text: 'DETERMINISTIC' }),
    ]),
    el('p', { class: 'purpose' }, [
      el('span', {
        text: 'Every rule below is a deterministic check with its evidence attached. '
          + 'UNAVAILABLE means NOT MEASURED — it is never a pass. The three verification legs are '
          + 'read from an evidence record, because this plugin cannot run a process.',
      }),
    ]),
    el('p', { class: 'capability' }, [
      el('span', { text: 'capability ' }), el('code', { text: key }), el('span', { text: ' · run-audit' }),
    ]),
    el('div', { class: 'panel-head' }, [button, status.wrap, scope.wrap]),
    headline,
    tiles,
    list,
  ]);

  /** @type {Row[]} */
  let rows = [];

  const draw = () => {
    const shown = filterRows(rows, { status: status.select.value, scope: scope.select.value });
    replace(list, shown.length === 0
      ? [el('li', { class: 'finding empty', text: 'no finding matches this filter.' })]
      : shown.map(rowNode));
  };

  /** @param {unknown} value */
  const show = (value) => {
    const summary = /** @type {Record<string, unknown>} */ (value ?? {})['summary'];
    const described = auditHeadline(value);
    headline.textContent = described.text;
    headline.className = `probe probe-${described.ran ? 'available' : 'unknown'}`;
    replace(tiles, summaryTiles(summary).map(tileNode));
    rows = findingRows(/** @type {Record<string, unknown>} */ (value ?? {})['findings']);
    const options = scopeOptions(rows);
    const chosen = scope.select.value;
    replace(scope.select, [
      /** @type {HTMLElement} */ (el('option', { text: 'every scope' })),
      ...options.map((value2) => {
        const option = /** @type {HTMLOptionElement} */ (el('option', { text: value2 }));
        option.value = value2;
        return option;
      }),
    ]);
    scope.select.value = options.includes(chosen) ? chosen : '';
    draw();
  };

  /** @param {{ code: string, message: string }} failure */
  const fail = (failure) => {
    const described = describeProbe({ ok: false, error: failure });
    headline.textContent = described.text;
    headline.className = `probe probe-${described.state}`;
    host.setAttribute('data-state', described.state);
    replace(tiles, []);
    replace(list, [el('li', { class: 'finding empty' }, [errorNode(failure.code, failure.message)])]);
  };

  /** @param {string} cap */
  const load = async (cap) => {
    button.disabled = true;
    headline.textContent = cap === 'run-audit' ? 'auditing…' : 'reading the last audit…';
    const answer = await client.call(cap, {});
    button.disabled = false;
    if (answer.ok) show(answer.value);
    else fail(answer.error);
  };

  for (const select of [status.select, scope.select]) select.addEventListener('change', () => draw());
  button.addEventListener('click', () => { void load('run-audit'); });
  await load('findings');
}
