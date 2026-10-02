// A zero-dependency client for the EIP host API.
//
// It exists to prove a claim: the API is consumable by any application, in any
// stack, with no shared code and no framework — only `api/openapi.json` and
// `fetch`. Node built-ins only; it would run unchanged in a browser-side runtime
// if the host allowed cross-origin calls, which it deliberately does not.
//
// The envelope is uniform: `{ok:true,value}` or `{ok:false,error:{code,message,
// details?}}`. This client NEVER throws on a 4xx — an error code is information,
// not an exception. It throws only when it cannot speak to the host at all.

/** The failure envelope this API answers with. No stack ever travels in it.
 * @typedef {{ code: string, message: string,
 *   details?: ReadonlyArray<{ path: string, message: string }> }} ApiError */
/** @typedef {{ ok: true, value: unknown } | { ok: false, error: ApiError }} Envelope */

export class EipApiError extends Error {
  /** @param {number} status @param {ApiError} error */
  constructor(status, error) {
    super(`${error.code}: ${error.message}`);
    this.name = 'EipApiError';
    this.status = status;
    this.code = error.code;
    this.details = error.details ?? [];
  }
}

/**
 * @param {string} [baseUrl] e.g. `http://127.0.0.1:3100`
 * @param {{ fetch?: typeof globalThis.fetch, timeoutMs?: number }} [options]
 */
export function createClient(baseUrl = 'http://127.0.0.1:3100', options = {}) {
  const doFetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10000;
  const root = baseUrl.replace(/\/+$/, '');

  /** @param {string} path @param {RequestInit} [init]
   * @returns {Promise<{ status: number, payload: Envelope }>} */
  async function request(path, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(`${root}${path}`, { ...init, signal: controller.signal });
      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`host answered ${response.status} with a non-JSON body`);
      }
      return { status: response.status, payload: /** @type {Envelope} */ (payload) };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Unwrap or raise: for callers that prefer exceptions at their own boundary.
   * @type {(answer: { status: number, payload: Envelope }) => unknown} */
  const unwrap = ({ status, payload }) => {
    if (payload.ok === true) return payload.value;
    throw new EipApiError(status, payload.error);
  };

  return {
    /** `{status, ok, plugins, devUi}` — no unwrapping, health should never throw. */
    async health() {
      const { status, payload } = await request('/api/v1/health');
      return { status, ...payload };
    },

    /** Public metadata of every plugin: manifests without the executable. */
    async plugins() {
      const value = /** @type {{ plugins?: unknown }} */ (unwrap(await request('/api/v1/plugins')));
      return value.plugins;
    },

    /**
     * Call a capability. Returns the raw envelope so the caller can branch on
     * `error.code` — `APPROVAL_REQUIRED` is a normal answer, not a failure.
     * @param {string} key @param {string} cap @param {unknown} input
     */
    async call(key, cap, input) {
      const path = `/api/v1/plugins/${encodeURIComponent(key)}/capabilities/${encodeURIComponent(cap)}`;
      const { status, payload } = await request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      return { status, ...payload };
    },

    /** Same call, exceptions instead of envelopes.
     * @param {string} key @param {string} cap @param {unknown} input */
    async callOrThrow(key, cap, input) {
      const { status, ...payload } = await this.call(key, cap, input);
      return unwrap({ status, payload: /** @type {Envelope} */ (payload) });
    },
  };
}

// Demo: `node examples/api-client/client.mjs [baseUrl]` against a running host.
if (process.argv[1] && process.argv[1].endsWith('client.mjs')) {
  const client = createClient(process.argv[2]);
  const health = await client.health();
  process.stdout.write(`health: ${JSON.stringify(health)}\n`);
  const counted = await client.call('text.stats', 'count-words', { text: 'four words right here' });
  process.stdout.write(`count-words: ${JSON.stringify(counted)}\n`);
  const saved = await client.call('text.report', 'save-report', { name: 'demo', text: 'four words right here' });
  process.stdout.write(`save-report: ${JSON.stringify(saved)}\n`);
}
