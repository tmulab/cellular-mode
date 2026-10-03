// data-client.mjs — runs in the BROWSER. The ONLY module that talks to the network, and
// it talks to one origin: this page's own server, which proxies `/api/v1/` to the host.
// Relative URLs throughout — an absolute URL here would be the first external URL in the
// build and would break criterion D6.
//
// The envelope is the host's existing one and is not re-invented:
//   POST /api/v1/plugins/<key>/capabilities/<cap>   body {"input": {...}}
//   200  {"ok": true,  "value": ...}
//   4xx  {"ok": false, "error": {"code", "message", "details"?}}
// Every answer is normalised to `{ ok, value, error }` so no caller has to know whether
// the refusal came from the host, the proxy or the browser.

/** @typedef {{ ok: true, value: unknown } | { ok: false, error: { code: string, message: string } }} Answer */

export const STATE_KEY = 'observer.state';
export const AUDIT_KEY = 'observer.audit';
export const ADVISOR_KEY = 'observer.advisor';

/** PURE. The capability URL. Keys and capability names are contract constants, not user
 * text, and are encoded anyway: building a URL by concatenation is how a path becomes an
 * injection point.
 * @param {string} key @param {string} cap @returns {string} */
export function capabilityUrl(key, cap) {
  return `/api/v1/plugins/${encodeURIComponent(key)}/capabilities/${encodeURIComponent(cap)}`;
}

/** PURE. Normalises anything that came back into the answer shape.
 * @param {unknown} payload @param {number} status @returns {Answer} */
export function normalise(payload, status) {
  const body = /** @type {Record<string, unknown>} */ (payload ?? {});
  if (body['ok'] === true) return { ok: true, value: body['value'] ?? null };
  const error = /** @type {Record<string, unknown>} */ (body['error'] ?? {});
  const code = typeof error['code'] === 'string' ? error['code'] : `HTTP_${status}`;
  const message = typeof error['message'] === 'string' ? error['message'] : 'the host refused the call';
  return { ok: false, error: { code, message } };
}

/** The live client: one POST per capability call.
 * @param {string} key @returns {{ call: (cap: string, input?: unknown) => Promise<Answer> }} */
export function createApiClient(key) {
  return {
    async call(cap, input = {}) {
      let response;
      try {
        response = await fetch(capabilityUrl(key, cap), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input }),
        });
      } catch (cause) {
        return { ok: false, error: { code: 'UNREACHABLE', message: `the observer server did not answer: ${String(cause)}` } };
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        return { ok: false, error: { code: 'MALFORMED_ANSWER', message: 'the answer was not JSON' } };
      }
      return normalise(payload, response.status);
    },
  };
}

/** The fixture client: the SAME interface, reading a recorded contract fixture. It exists
 * so the interface can be reviewed (and the 500-cell case measured) with no vault at all.
 * It never falls back to fixtures when the API fails — a dashboard that invents data when
 * the backend is down is worse than one that says the backend is down.
 * @param {string} url @returns {{ call: (cap: string, input?: unknown) => Promise<Answer> }} */
export function createFixtureClient(url) {
  /** @type {Promise<Record<string, unknown>> | null} */
  let loading = null;
  const load = () => {
    if (loading === null) loading = fetch(url).then((response) => response.json());
    return loading;
  };
  return {
    async call(cap, input = {}) {
      const fixture = await load();
      const section = fixture[cap];
      if (section === undefined) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `the fixture records no "${cap}"` } };
      }
      if (cap !== 'cell-detail') return { ok: true, value: section };
      const id = /** @type {Record<string, unknown>} */ (input ?? {})['id'];
      const detail = /** @type {Record<string, unknown>} */ (section)[String(id)];
      if (detail === undefined) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `the fixture records no detail for "${String(id)}"` } };
      }
      return { ok: true, value: detail };
    },
  };
}

/** PURE. Which client the page should use, from its own query string. Fixture mode is
 * opt-in through the URL and is announced on the page by the caller.
 * @param {string} search @returns {'api' | 'fixture'} */
export function sourceFrom(search) {
  return new URLSearchParams(search).get('source') === 'fixture' ? 'fixture' : 'api';
}

/** PURE. Which recorded fixture to read. `?size=500` is the level-of-detail review case
 * from MANUAL-CHECKS.md; anything else is the small contract fixture.
 * @param {string} search @returns {string} */
export function fixtureUrlFrom(search) {
  return new URLSearchParams(search).get('size') === '500'
    ? '/fixtures/observer-state-500.json'
    : '/fixtures/observer-state.json';
}
