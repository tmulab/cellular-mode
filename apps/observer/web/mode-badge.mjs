// mode-badge.mjs — runs in the BROWSER. The read-only badge in the header.
//
// Everything about WHAT to say is in `../view/mode-view.mjs`, which is pure and tested. This
// module only builds nodes, and is careful about three things:
//   it is READ-ONLY. There is no selector, no button and no form: a mode is declared by the
//     human at their own terminal or with their own command, never by a dashboard. The
//     capability it reads has no setter at all, so this is a property of the contract;
//   a mode nobody declared is NOT a state worth a pixel. The badge is `hidden`, and the page
//     looks exactly as it did before the adaptive module existed;
//   an EXPIRED or UNREADABLE declaration is shown, with the plugin's own sentence. Something
//     changed without anybody doing anything, and a dashboard that stays silent about that is
//     telling the reader the mode they declared is still in force.
import { el, replace } from './dom.mjs';
import { modeBadge } from '../view/mode-view.mjs';

/**
 * Renders the badge, or hides it. Total: any answer at all, including a refusal or `null`.
 * @param {HTMLElement} host @param {unknown} current the `adaptive.preferences#current` value
 * @returns {{ show: boolean, mode: string }} what was rendered, for the caller's own wiring
 */
export function renderModeBadge(host, current) {
  const badge = modeBadge(current);
  if (!badge.show) {
    host.hidden = true;
    host.removeAttribute('data-mode');
    host.removeAttribute('data-standing');
    replace(host, []);
    return { show: false, mode: badge.mode };
  }
  host.hidden = false;
  host.setAttribute('data-mode', badge.mode);
  host.setAttribute('data-standing', badge.standing);
  const nodes = [
    el('span', { class: 'label', text: 'declared mode' }),
    el('strong', { class: 'value', text: badge.text }),
  ];
  // `title` carries the provenance: which door the declaration came in by is auditable, and
  // it belongs next to the claim rather than in a log nobody opens.
  if (badge.source !== '') nodes[1]?.setAttribute('title', badge.source);
  if (badge.notice !== '') nodes.push(el('span', { class: 'mode-notice', text: badge.notice }));
  // "read-only" is said out loud, so nobody looks for the selector that is deliberately absent.
  nodes.push(el('span', { class: 'mode-readonly', text: 'read-only — set it yourself' }));
  replace(host, nodes);
  return { show: true, mode: badge.mode };
}
