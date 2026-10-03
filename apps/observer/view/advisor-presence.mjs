// advisor-presence.mjs — PURE. Whether the ADVISOR area has a plugin to talk to at all,
// and what it should do about each answer. No DOM, so the whole decision is testable in
// node (criterion D23).
//
// The distinction this module carries: DISABLED is not BROKEN. The advisor is optional and
// off by default, and `health.plugins` is the host's own honest list of what was loaded. A
// key that is not in that list was never meant to answer, so calling it and rendering the
// resulting `404 NOT_FOUND` turns the documented default configuration into a diagnostic
// box — the reader is told something is missing when nothing is.
//
// A key that IS listed and still refuses is a different fact entirely, and keeps its error.
// And a list that could not be read at all is UNKNOWN: the area probes, exactly as before,
// because the one thing it must not do is invent a verdict about a build it cannot see.
import { describeProbe } from './availability.mjs';
import { DISABLED_NOTICE } from './advisor-view.mjs';

/** What the headline says while the probe is in flight. */
export const PROBING_NOTICE = 'checking whether the advisor is loaded...';

/** @typedef {'listed' | 'not-listed' | 'unknown'} Presence */

/** PURE. Everything the ADVISOR area needs to know before it renders: whether to call the
 * plugin at all, what to say, and whether what it says is an ERROR or a configuration fact.
 * @param {Presence} presence
 * @param {{ ok: boolean, error?: { code: string, message?: string } } | null} [probe]
 *   the `status` answer, or `null` when none has been made yet
 * @returns {{ probe: boolean, state: string, text: string, showError: boolean, enabled: boolean }} */
export function advisorAreaState(presence, probe = null) {
  if (presence === 'not-listed') {
    // The whole message, and nothing appended: there is no failure to describe.
    return { probe: false, state: 'disabled', text: DISABLED_NOTICE, showError: false, enabled: false };
  }
  if (probe === null) {
    return { probe: true, state: 'unknown', text: PROBING_NOTICE, showError: false, enabled: false };
  }
  if (probe.ok) return { probe: true, state: 'available', text: '', showError: false, enabled: true };
  const described = describeProbe(probe);
  return {
    probe: true,
    state: described.state,
    text: `${DISABLED_NOTICE} (${described.text})`,
    showError: true,
    enabled: false,
  };
}
