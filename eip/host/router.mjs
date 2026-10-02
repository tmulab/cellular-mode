// The routes. A thin edge over the kernel: it decides nothing about the domain,
// it translates HTTP into a capability call and a kernel result into a status.
//
// Routing is a PURE table (`routeOf`) so the contract can be tested without a
// socket, and so "which routes exist" is one readable list — the same list the
// OpenAPI test compares against api/openapi.json.
import { SDK_VERSION } from '../sdk/index.mjs';
import { MAX_BODY_BYTES, readCallEnvelope, readJsonBody } from './body.mjs';
import { failure, statusFor } from './errors.mjs';
import {
  DEV_CSP, DEV_CSS, DEV_SCRIPT, DEV_SCRIPT_PATH, DEV_STYLE_PATH, renderDevPage,
} from './dev-ui.mjs';

/** @typedef {import('../sdk/types.mjs').Manifest} Manifest */
/** @typedef {ReturnType<typeof import('../kernel/index.mjs').createKernel>} Kernel */
/**
 * A route, as a discriminated union: the `name` decides which params exist, so the
 * handler never has to ask whether a parameter it needs was actually matched.
 * @typedef {{ name: 'health' | 'plugins' | 'dev-script' | 'dev-style', methods: string[] }
 *   | { name: 'capability', methods: string[], params: { key: string, cap: string } }
 *   | { name: 'dev-page', methods: string[], params: { key: string } }} Route
 */

export const API_PREFIX = '/api/v1';

/** Headers every response carries. No CORS header exists here, by decision. */
const BASE_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
});

/** PURE. `{name, methods, params}` for a known path, or `null`.
 * @param {string} pathname @returns {Route | null} */
export function routeOf(pathname) {
  const parts = pathname.split('/').filter((part) => part !== '');
  let segments;
  try {
    segments = parts.map(decodeURIComponent);
  } catch {
    return null; // a malformed percent-escape is not a route
  }
  const [a, b, c, d, e, f] = segments;
  if (a === 'api' && b === 'v1') {
    if (segments.length === 3 && c === 'health') return { name: 'health', methods: ['GET'] };
    if (segments.length === 3 && c === 'plugins') return { name: 'plugins', methods: ['GET'] };
    // `d`/`f` are proved present by the length, and said so rather than assumed.
    if (segments.length === 6 && c === 'plugins' && e === 'capabilities'
      && d !== undefined && f !== undefined) {
      return { name: 'capability', methods: ['POST'], params: { key: d, cap: f } };
    }
    return null;
  }
  if (a === 'dev') {
    if (segments.length === 3 && b === 'plugins' && c !== undefined) {
      return { name: 'dev-page', methods: ['GET'], params: { key: c } };
    }
    if (pathname === DEV_SCRIPT_PATH) return { name: 'dev-script', methods: ['GET'] };
    if (pathname === DEV_STYLE_PATH) return { name: 'dev-style', methods: ['GET'] };
  }
  return null;
}

/** Every route this server answers, as the OpenAPI test reads it. */
export const ROUTE_TABLE = Object.freeze([
  { name: 'health', method: 'GET', template: '/api/v1/health' },
  { name: 'plugins', method: 'GET', template: '/api/v1/plugins' },
  { name: 'capability', method: 'POST', template: '/api/v1/plugins/{key}/capabilities/{cap}' },
]);

/** @type {(res: import('node:http').ServerResponse, status: number, type: string,
 *   payload: string, headers?: Record<string, string>) => void} */
function send(res, status, type, payload, headers = {}) {
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': type, ...headers });
  res.end(payload);
}

/** @type {(res: import('node:http').ServerResponse, status: number, body: unknown,
 *   headers?: Record<string, string>) => void} */
const sendJson = (res, status, body, headers = {}) => send(
  res, status, 'application/json; charset=utf-8', `${JSON.stringify(body)}\n`,
  { 'Cache-Control': 'no-store', ...headers },
);

/** @param {{ kernel: Kernel, plugins?: ReadonlyArray<Manifest>, devUi?: boolean }} wiring */
export function createRouter({ kernel, plugins = [], devUi = false }) {
  /** @type {(key: string) => Manifest | undefined} */
  const manifestOf = (key) => plugins.find((manifest) => manifest.name === key);
  /** @type {(res: import('node:http').ServerResponse, what: string) => void} */
  const notFound = (res, what) => sendJson(res, 404, failure('NOT_FOUND', what));

  /** @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {{ key: string, cap: string }} params */
  async function capability(req, res, { key, cap }) {
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    if (body.status !== undefined) return sendJson(res, body.status, body.body);
    const envelope = readCallEnvelope(body.value);
    if (envelope.status !== undefined) return sendJson(res, envelope.status, envelope.body);

    // No `approval` reaches `execute` from here: the kernel asks the host's
    // approver, and the host decides. The request cannot carry consent.
    const result = await kernel.execute(key, cap, envelope.value);
    if (result.ok) return sendJson(res, 200, result);
    return sendJson(res, statusFor(result.error.code), result);
  }

  /** @param {import('node:http').ServerResponse} res @param {{ key: string }} params */
  function devPage(res, { key }) {
    if (!devUi) return notFound(res, 'the dev UI is disabled; start the host with --dev-ui');
    const manifest = manifestOf(key);
    if (manifest === undefined) return notFound(res, `no plugin registered for key "${key}"`);
    if (manifest.devUi === undefined) return notFound(res, `"${key}" ships no dev UI`);
    const html = renderDevPage({ key, title: manifest.devUi.title, fragment: manifest.devUi.html });
    send(res, 200, 'text/html; charset=utf-8', html, {
      'Content-Security-Policy': DEV_CSP, 'Cache-Control': 'no-store',
    });
  }

  /** @param {import('node:http').ServerResponse} res @param {string} name */
  function devAsset(res, name) {
    if (!devUi) return notFound(res, 'the dev UI is disabled; start the host with --dev-ui');
    const [type, payload] = name === 'dev-script'
      ? ['text/javascript; charset=utf-8', DEV_SCRIPT]
      : ['text/css; charset=utf-8', DEV_CSS];
    send(res, 200, type, payload, { 'Content-Security-Policy': DEV_CSP, 'Cache-Control': 'no-store' });
  }

  /** @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res */
  return async function handle(req, res) {
    const pathname = (req.url ?? '/').split('?')[0] ?? '/';
    const method = req.method ?? '';
    const route = routeOf(pathname);
    if (route === null) return notFound(res, `no route for ${method} ${pathname}`);
    if (!route.methods.includes(method)) {
      // 405 with the kernel's own vocabulary: the path exists, the request is
      // malformed against the contract. A second error list would be worse.
      return sendJson(res, 405, failure('INPUT_INVALID',
        `method ${method} is not allowed on ${pathname}`,
        [{ path: 'method', message: `allowed: ${route.methods.join(', ')}` }]),
      { Allow: route.methods.join(', ') });
    }
    switch (route.name) {
      case 'health':
        return sendJson(res, 200, {
          ok: true,
          value: {
            status: 'ok', sdk: SDK_VERSION, devUi,
            plugins: kernel.list().map((m) => m.name).filter((key) => kernel.isLoaded(key)).sort(),
          },
        });
      case 'plugins':
        return sendJson(res, 200, { ok: true, value: { plugins: kernel.list() } });
      case 'capability':
        return capability(req, res, route.params);
      case 'dev-page':
        return devPage(res, route.params);
      default:
        return devAsset(res, route.name);
    }
  };
}
