// availability.mjs — PURE. Turns a capability probe into the exact words the page shows
// about an area whose plugin may or may not exist.
//
// Three outcomes, and they are genuinely different things. "The plugin is not installed in
// this build" is a fact about the build. "The host is not answering" is UNKNOWN — it says
// nothing about whether the plugin exists. An empty panel that could be either teaches the
// reader nothing, which is why this returns a `state` AND a sentence rather than a boolean.

/** @typedef {{ ok: boolean, error?: { code: string } }} Probe */

/** PURE. @param {Probe} answer @returns {{ state: 'available' | 'absent' | 'unknown', text: string }} */
export function describeProbe(answer) {
  if (answer.ok) return { state: 'available', text: 'available' };
  const code = answer.error?.code ?? 'UNKNOWN';
  if (code === 'NOT_FOUND') {
    return { state: 'absent', text: 'not available in this build — the plugin is not installed' };
  }
  if (code === 'UPSTREAM_UNAVAILABLE' || code === 'UNREACHABLE') {
    return { state: 'unknown', text: 'unknown — the observer host is not answering' };
  }
  return { state: 'absent', text: `not available — the host answered ${code}` };
}
