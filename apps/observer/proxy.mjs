// proxy.mjs — the /api reverse proxy, so the page and the API are ONE origin.
//
// Why a proxy at all: same origin means the strict CSP of headers.mjs can say
// `connect-src 'self'` and mean it, and the host never needs a CORS header — which is
// the only reason the host can stay a loopback service with no cross-origin surface.
//
// What it will forward: `/api/v1/...`, and nothing else. Not `/api/`, not `/api/v2/`,
// not `/api/v1` without a trailing segment. The allowed prefix is a constant compared
// against the decoded path; a request that does not match never reaches a socket
// (criterion D4).
import { request } from 'node:http';
import { headersFor } from './headers.mjs';

/** The only prefix that is ever forwarded. */
export const API_PREFIX = '/api/v1/';

/** A request body larger than this is refused before the upstream is contacted.
 * The host has its own limit; this one exists so a hostile body is dropped at the edge
 * instead of being relayed. */
export const MAX_BODY_BYTES = 64 * 1024;

/** How long the upstream gets to answer before the proxy gives up. */
export const UPSTREAM_TIMEOUT_MS = 10_000;

/** @typedef {import('node:http').IncomingMessage} Req */
/** @typedef {import('node:http').ServerResponse} Res */

/** PURE. The upstream path for a request path, or `null` when it must not be forwarded.
 * @param {unknown} pathname @returns {string | null} */
export function apiTargetFor(pathname) {
  if (typeof pathname !== 'string') return null;
  if (!pathname.startsWith(API_PREFIX)) return null;
  if (pathname.length === API_PREFIX.length) return null;
  // Defence in depth: the path is already decoded, so a traversal segment here would be
  // a literal `..` and the host would reject it — but the proxy refuses to be the thing
  // that carried it.
  if (pathname.split('/').some((segment) => segment === '..' || segment === '.')) return null;
  return pathname;
}

/** PURE. The JSON refusal envelope, in the host's vocabulary so a caller needs one
 * error shape rather than two.
 * @param {string} code @param {string} message @returns {string} */
export function refusal(code, message) {
  return `${JSON.stringify({ ok: false, error: { code, message } })}\n`;
}

/** @param {Res} res @param {number} status @param {string} code @param {string} message
 * @returns {void} */
export function sendRefusal(res, status, code, message) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, headersFor('application/json; charset=utf-8'));
  res.end(refusal(code, message));
}

/** Reads the request body with a hard cap. Resolves `null` when the cap is exceeded —
 * the caller answers 413 and the upstream is never contacted.
 * @param {Req} req @param {number} limit @returns {Promise<Buffer | null>} */
export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    // Once the cap is passed the chunks are DISCARDED but the stream is left running:
    // destroying the socket here is what turns a clean 413 into a connection reset the
    // caller cannot read. Nothing accumulates, so an oversized body costs no memory.
    /** @type {Buffer[]} */
    let chunks = [];
    let size = 0;
    let over = false;
    req.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += buffer.length;
      if (size > limit) {
        if (!over) {
          over = true;
          chunks = [];
          resolve(null);
        }
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => { if (!over) resolve(Buffer.concat(chunks)); });
    req.on('error', (cause) => { if (!over) reject(cause); });
  });
}

/**
 * @param {object} options
 * @param {number} options.upstreamPort the host's internal loopback port
 * @param {string} [options.upstreamHost] always loopback; present for the tests only
 * @param {number} [options.maxBodyBytes]
 * @param {number} [options.timeoutMs]
 * @returns {(req: Req, res: Res, pathname: string, query: string) => Promise<void>}
 */
export function createApiProxy({ upstreamPort, upstreamHost = '127.0.0.1', maxBodyBytes = MAX_BODY_BYTES, timeoutMs = UPSTREAM_TIMEOUT_MS }) {
  return async function forward(req, res, pathname, query) {
    const target = apiTargetFor(pathname);
    if (target === null) {
      return sendRefusal(res, 404, 'NOT_FOUND', `the observer proxy forwards ${API_PREFIX}… only`);
    }
    const body = await readBody(req, maxBodyBytes);
    if (body === null) {
      return sendRefusal(res, 413, 'INPUT_INVALID', `the request body exceeds ${maxBodyBytes} bytes`);
    }
    /** @type {Record<string, string>} */
    const outgoing = { 'Content-Length': String(body.length) };
    const contentType = req.headers['content-type'];
    if (typeof contentType === 'string') outgoing['Content-Type'] = contentType;
    const accept = req.headers['accept'];
    if (typeof accept === 'string') outgoing['Accept'] = accept;

    await new Promise((resolve) => {
      const upstream = request({
        host: upstreamHost,
        port: upstreamPort,
        method: req.method ?? 'GET',
        path: query === '' ? target : `${target}?${query}`,
        headers: outgoing,
      }, (answer) => {
        // The upstream's own status and content type are passed through; the security
        // headers are OURS and are reapplied, so a header the host forgets cannot
        // weaken the page's policy.
        const type = answer.headers['content-type'] ?? 'application/json; charset=utf-8';
        res.writeHead(answer.statusCode ?? 502, headersFor(String(type)));
        answer.pipe(res);
        answer.on('end', resolve);
        answer.on('error', () => { res.end(); resolve(undefined); });
      });
      upstream.setTimeout(timeoutMs, () => {
        upstream.destroy();
        sendRefusal(res, 504, 'UPSTREAM_TIMEOUT', `the host did not answer within ${timeoutMs} ms`);
        resolve(undefined);
      });
      upstream.on('error', () => {
        sendRefusal(res, 502, 'UPSTREAM_UNAVAILABLE', 'the observer host is not answering');
        resolve(undefined);
      });
      upstream.end(body);
    });
    return undefined;
  };
}
