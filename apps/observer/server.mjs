// server.mjs — the application server: an allowlist of static files plus one reverse
// proxy to the host's API. It is not a web server in the general sense and must not
// become one; everything it will ever hand out is listed in assets.mjs.
//
// Loopback only, with no option to change it (criterion D5). A flag that can expose a
// development observer to a network is a flag someone will set, and this process reads a
// project's whole vault. There is no such flag, and that absence is the feature.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS, assetFor, splitTarget } from './assets.mjs';
import { headersFor } from './headers.mjs';
import { createApiProxy, sendRefusal } from './proxy.mjs';

/** The only address this server binds. */
export const BIND_ADDRESS = '127.0.0.1';

/** This application's own directory. Derived from this module's location, never from a
 * request: the mapped file names in assets.mjs are joined onto THIS, and nothing else is
 * ever joined onto anything. */
export const APP_DIR = fileURLToPath(new URL('.', import.meta.url));

/** Methods a static asset answers. Everything else is 405, not 404: the resource exists,
 * the verb does not apply to it. */
const STATIC_METHODS = new Set(['GET', 'HEAD']);

/**
 * @param {object} options
 * @param {number} options.upstreamPort the host's internal loopback port
 * @param {string} [options.appDir] overridden only by the tests
 * @param {number} [options.maxBodyBytes]
 * @param {number} [options.timeoutMs]
 */
export function createAppServer({ upstreamPort, appDir = APP_DIR, maxBodyBytes, timeoutMs }) {
  const forward = createApiProxy({
    upstreamPort,
    ...(maxBodyBytes === undefined ? {} : { maxBodyBytes }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });

  const server = createServer((req, res) => {
    const target = splitTarget(req.url);
    if (target === null) {
      sendRefusal(res, 400, 'INPUT_INVALID', 'the request target is not a usable path');
      return;
    }
    const { pathname, query } = target;
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      forward(req, res, pathname, query).catch(() => {
        sendRefusal(res, 502, 'UPSTREAM_UNAVAILABLE', 'the observer host is not answering');
      });
      return;
    }
    const asset = assetFor(pathname);
    if (asset === null) {
      // One answer for "no such file", "that is a directory" and "nice try with `..`".
      // Distinguishing them would be a map of the filesystem, handed out for free.
      sendRefusal(res, 404, 'NOT_FOUND', 'this observer serves a fixed set of files');
      return;
    }
    if (!STATIC_METHODS.has(req.method ?? '')) {
      res.writeHead(405, headersFor('application/json; charset=utf-8', { Allow: 'GET, HEAD' }));
      res.end(`${JSON.stringify({ ok: false, error: { code: 'INPUT_INVALID', message: 'static assets answer GET and HEAD' } })}\n`);
      return;
    }
    /** @type {Buffer} */
    let bytes;
    try {
      bytes = readFileSync(join(appDir, asset.file));
    } catch {
      // An allowlisted file that is missing on disk is a packaging fault, reported as
      // such. It is never retried against another path.
      sendRefusal(res, 500, 'PLUGIN_ERROR', `the allowlisted asset "${asset.file}" is missing from this build`);
      return;
    }
    res.writeHead(200, headersFor(asset.type, { 'Content-Length': String(bytes.length) }));
    res.end(req.method === 'HEAD' ? undefined : bytes);
  });

  return Object.freeze({
    server,
    /** The number of files this process will ever serve. Printed by the launcher so the
     * surface is stated out loud at every start. */
    assetCount: Object.keys(ASSETS).length,
    /** `0` asks the OS for a free port, which is what the tests use.
     * @param {number} [port] @returns {Promise<{ port: number, url: string }>} */
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, BIND_ADDRESS, () => {
          const address = server.address();
          const bound = typeof address === 'object' && address !== null ? address.port : port;
          resolve({ port: bound, url: `http://${BIND_ADDRESS}:${bound}` });
        });
      });
    },
    close() {
      return new Promise((resolve) => { server.close(() => resolve(undefined)); });
    },
  });
}
