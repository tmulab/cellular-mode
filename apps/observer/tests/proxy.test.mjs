// D4 — the reverse proxy. A stub upstream records every request it receives, so "the proxy
// never contacted the host" is asserted as a fact and not inferred from a status code.
import test, { describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { API_PREFIX, apiTargetFor } from '../proxy.mjs';
import { BIND_ADDRESS, createAppServer } from '../server.mjs';

/** @type {Array<{ method: string, url: string, body: string, type: string | undefined }>} */
let received = [];
/** @type {import('node:http').Server} */
let upstream;
/** @type {{ close: () => Promise<unknown> } | null} */
let app = null;
let port = 0;
/** Flips the stub into a server that never answers, for the timeout case. */
let silent = false;
let upstreamPort = 0;

/** @param {string} path @param {string} method @param {string} [body]
 * @returns {Promise<{ status: number, body: string }>} */
function call(path, method = 'POST', body = '{"input":{}}') {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      host: BIND_ADDRESS, port, path, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (answer) => {
      let text = '';
      answer.setEncoding('utf8');
      answer.on('data', (chunk) => { text += chunk; });
      answer.on('end', () => resolve({ status: answer.statusCode ?? 0, body: text }));
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

before(async () => {
  upstream = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received.push({ method: req.method ?? '', url: req.url ?? '', body, type: req.headers['content-type'] });
      if (silent) return;                       // answer nothing: exercises the timeout
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, value: { seen: req.url } }));
    });
  });
  upstreamPort = await new Promise((resolve) => {
    upstream.listen(0, BIND_ADDRESS, () => {
      const address = upstream.address();
      resolve(typeof address === 'object' && address !== null ? address.port : 0);
    });
  });
  // A realistic deadline for every ordinary case: a short one here made them answer 504 when the
  // whole suite ran under load (found by Article 8's final verification, 2026-10-03). The
  // timeout case gets its own server with the short deadline below.
  const server = createAppServer({ upstreamPort, maxBodyBytes: 256, timeoutMs: 10_000 });
  ({ port } = await server.listen(0));
  app = server;
});
after(async () => {
  await app?.close();
  await new Promise((resolve) => upstream.close(() => resolve(undefined)));
});

describe('D4 · only /api/v1/ is forwarded', () => {
  test('the allowed prefix is the whole rule, and a bare prefix is not a target', () => {
    assert.equal(API_PREFIX, '/api/v1/');
    assert.equal(apiTargetFor('/api/v1/health'), '/api/v1/health');
    assert.equal(apiTargetFor('/api/v1/plugins/observer.state/capabilities/overview'),
      '/api/v1/plugins/observer.state/capabilities/overview');
    for (const path of ['/api/v1/', '/api/v1', '/api/', '/api', '/api/v2/health',
      '/api/v10/health', '/apiv1/health', '/api/v1/../../etc', '/api/v1/./health', '']) {
      assert.equal(apiTargetFor(path), null, `${path} must not be forwarded`);
    }
    assert.equal(apiTargetFor(null), null);
  });

  test('a refused path never reaches the upstream at all', async () => {
    received = [];
    for (const path of ['/api/v2/health', '/api/plugins/x/capabilities/y', '/api']) {
      const answer = await call(path);
      assert.equal(answer.status, 404, `${path} answered ${answer.status}`);
      assert.match(answer.body, /"code":"NOT_FOUND"/);
    }
    assert.deepEqual(received, [], 'the upstream must not have been contacted');
  });
});

describe('D4 · method, body and query travel unchanged', () => {
  test('a POST with a JSON envelope arrives byte for byte', async () => {
    received = [];
    const body = JSON.stringify({ input: { id: 'observer-dashboard' } });
    const answer = await call('/api/v1/plugins/observer.state/capabilities/cell-detail', 'POST', body);
    assert.equal(answer.status, 200);
    assert.equal(received.length, 1);
    assert.equal(received[0]?.method, 'POST');
    assert.equal(received[0]?.body, body);
    assert.equal(received[0]?.type, 'application/json');
    assert.equal(received[0]?.url, '/api/v1/plugins/observer.state/capabilities/cell-detail');
  });

  test('a GET and a query string are forwarded as they came', async () => {
    received = [];
    await call('/api/v1/health?verbose=1', 'GET', '');
    assert.equal(received[0]?.method, 'GET');
    assert.equal(received[0]?.url, '/api/v1/health?verbose=1');
  });

  test("the upstream's own status is passed through", async () => {
    const answer = await call('/api/v1/health');
    assert.equal(answer.status, 200);
    assert.match(answer.body, /"ok":true/);
  });
});

describe('D4 · the limits are the edge, not the host', () => {
  test('a body over the limit is 413 and the upstream never sees it', async () => {
    received = [];
    const answer = await call('/api/v1/health', 'POST', JSON.stringify({ input: 'x'.repeat(400) }));
    assert.equal(answer.status, 413);
    assert.match(answer.body, /"code":"INPUT_INVALID"/);
    assert.deepEqual(received, []);
  });

  test('a silent upstream is 504 after the deadline, not a hung page', async () => {
    const short = createAppServer({ upstreamPort, maxBodyBytes: 256, timeoutMs: 300 });
    const saved = port;
    ({ port } = await short.listen(0));
    silent = true;
    try {
      const answer = await call('/api/v1/health');
      assert.equal(answer.status, 504);
      assert.match(answer.body, /"code":"UPSTREAM_TIMEOUT"/);
      assert.match(answer.body, /300 ms/, 'the short deadline is the one that fired');
    } finally {
      silent = false;
      port = saved;
      await short.close();
    }
  });

  test('an upstream that is not there at all is 502, with a code a reader can report', async () => {
    const orphan = createAppServer({ upstreamPort: 1 });
    const { port: orphanPort } = await orphan.listen(0);
    try {
      const answer = await new Promise((resolve, reject) => {
        const outgoing = request({ host: BIND_ADDRESS, port: orphanPort, path: '/api/v1/health', method: 'POST' }, (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { text += chunk; });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }));
        });
        outgoing.on('error', reject);
        outgoing.end('{"input":{}}');
      });
      assert.equal(/** @type {{ status: number }} */ (answer).status, 502);
      assert.match(/** @type {{ body: string }} */ (answer).body, /"code":"UPSTREAM_UNAVAILABLE"/);
    } finally {
      await orphan.close();
    }
  });
});
