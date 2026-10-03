// project-area.mjs — runs in the BROWSER. The top of the PROJECT area: the counts, the
// active cell, the warnings and the recent activity.
//
// Weight follows ACTION, not volume: the active cell and a non-zero paused count are
// large because they ask something of you now; 47 completed cells are history and are
// rendered as a footnote. That ordering is in `overviewTiles`, which is a pure function,
// so "what the dashboard shouts about" is a tested decision rather than a CSS accident.
import { el, errorNode, fieldNode, replace } from './dom.mjs';
import { activeCellLine, field, overviewTiles, statusDescriptor } from '../view/view-model.mjs';

/** @param {{ key: string, label: string, value: number, emphasis: string }} tile */
function tileNode(tile) {
  const status = statusDescriptor(tile.key);
  return el('div', { class: `tile ${tile.emphasis} status-${status.key}` }, [
    el('b', { text: String(tile.value) }),
    el('span', { class: 'tile-label' }, [
      el('span', { class: 'glyph', text: status.symbol }),
      el('span', { text: ` ${tile.label}` }),
    ]),
  ]);
}

/** @param {unknown} warning @returns {HTMLElement} */
function warningNode(warning) {
  const record = /** @type {Record<string, unknown>} */ (warning ?? {});
  const cell = field(record['cell']);
  return el('li', { class: 'warning' }, [
    el('b', { text: String(record['code'] ?? 'WARNING') }),
    el('span', { text: ` ${String(record['message'] ?? '')}` }),
    el('span', { class: 'warning-cell', text: cell.recorded ? ` — ${cell.text}` : '' }),
  ]);
}

/** @param {unknown} event @returns {HTMLElement} */
function activityNode(event) {
  const record = /** @type {Record<string, unknown>} */ (event ?? {});
  const facts = field(record['facts']);
  return el('li', { class: 'activity' }, [
    el('span', { class: 'at', text: field(record['at']).text }),
    el('span', { class: `kind kind-${String(record['kind'] ?? 'unknown')}`, text: String(record['kind'] ?? 'unknown') }),
    el('span', { class: 'cell', text: field(record['cell']).text }),
    fieldNode(facts, 'span'),
  ]);
}

/** Renders the overview into its four hosts.
 * @param {{ tiles: HTMLElement, active: HTMLElement, warnings: HTMLElement, activity: HTMLElement, integrity: HTMLElement }} hosts
 * @param {unknown} overview
 */
export function renderOverview(hosts, overview) {
  const value = /** @type {Record<string, unknown>} */ (overview ?? {});
  const counts = /** @type {Record<string, unknown>} */ (value['counts'] ?? {});
  replace(hosts.tiles, overviewTiles(counts).map(tileNode));

  const active = activeCellLine(value['active']);
  replace(hosts.active, [
    el('span', { class: 'label', text: 'active cell' }),
    el('strong', { class: active.recorded ? 'value' : 'value absent', text: active.text }),
  ]);
  if (active.id === null) hosts.active.removeAttribute('data-cell');
  else hosts.active.setAttribute('data-cell', active.id);

  const warnings = Array.isArray(value['warnings']) ? value['warnings'] : [];
  replace(hosts.warnings, warnings.length === 0
    ? [el('li', { class: 'empty', text: 'no warnings' })]
    : warnings.map(warningNode));

  const recent = Array.isArray(value['recent']) ? value['recent'] : [];
  replace(hosts.activity, recent.length === 0
    ? [el('li', { class: 'empty', text: 'no activity recorded' })]
    : recent.map(activityNode));

  // Integrity is the vault's own check, reported verbatim. A dashboard that summarises
  // "looks fine" over a list of findings is a dashboard that hides them.
  const integrity = /** @type {Record<string, unknown>} */ (value['integrity'] ?? {});
  const findings = Array.isArray(integrity['findings']) ? integrity['findings'] : [];
  replace(hosts.integrity, [
    el('span', { class: integrity['ok'] === true ? 'ok' : 'not-ok', text: integrity['ok'] === true ? 'integrity: ok' : 'integrity: findings' }),
    ...findings.map((finding) => {
      const record = /** @type {Record<string, unknown>} */ (finding ?? {});
      return el('span', { class: 'finding', text: `${String(record['code'] ?? '')} ${String(record['message'] ?? '')}` });
    }),
  ]);
}

/** @param {HTMLElement} host @param {{ code: string, message: string }} error */
export function renderOverviewFailure(host, error) {
  replace(host, [errorNode(error.code, error.message)]);
}
