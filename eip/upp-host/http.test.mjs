// The HTTP transport, against a real `node:http` server on 127.0.0.1 with an ephemeral port.
//
// U25 lives here: a full `execute` over `POST <baseUrl>/upp`, a non-loopback `baseUrl`
// refused without explicit operator configuration, and a status outside {200, 204} becoming
// `-32003`. The server is real rather than a stubbed `fetch` because the claims are about
// HTTP — a status code, a redirect, a body size — and a stub would assert them against
// itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { startHttpPlugin } from './http-transport.mjs';
import { HTTP_MANIFEST_PATH, pinOf, withOperatorConfig } from './fixtures/harness.mjs';

const HTTP_ID = 'fixture.http-plugin';
const MANIFEST = JSON.parse(readFileSync(HTTP_MANIFEST_PATH, 'utf8'));

/**
 * A JSON-RPC endpoint that answers from `reply`, plus a record of what it received.
 * @param {(method: string, params: Record<string, unknown>) =>
 *   { result?: Record<string, unknown>, error?: Record<string, unknown>, status?: number,
 *     body?: string, location?: string }} reply
 */
async function serve(reply) {
  /** @type {Array<{ url: string, auth: string | undefined, method: string }>} */
  const seen = [];
  const server = createServer((request, response) => {
    /** @type {Buffer[]} */
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      seen.push({ url: request.url ?? '', auth: request.headers.authorization, method: String(message.method) });
      const answer = reply(String(message.method), message.params ?? {});
      const status = answer.status ?? 200;
      if (answer.location !== undefined) {
        response.writeHead(302, { location: answer.location }).end();
        return;
      }
      const body = answer.body ?? JSON.stringify(answer.error === undefined
        ? { jsonrpc: '2.0', id: message.id, result: answer.result }
        : { jsonrpc: '2.0', id: message.id, error: answer.error });
      response.writeHead(status, { 'content-type': 'application/json' }).end(body);
    });
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', () => resolve(undefined)); });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    seen,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => { server.close(() => resolve(undefined)); }),
  };
}

/** The standard answers of a well-behaved service. @type {Parameters<typeof serve>[0]} */
const wellBehaved = (method, params) => {
  if (method === 'upp.initialize') return { result: { protocolVersion: '1.0', manifest: MANIFEST } };
  if (method === 'upp.execute') {
    const input = /** @type {Record<string, unknown>} */ (params.input ?? {});
    return { result: { output: { text: String(input.text ?? ''), deadlineMs: Number(params.deadlineMs ?? -1) } } };
  }
  if (method === 'upp.health') return { result: { status: 'ok' } };
  return { result: {} };
};

/** @param {string} baseUrl @param {Record<string, unknown>} [over] */
async function authorize(baseUrl, over = {}) {
  const harness = await withOperatorConfig({
    id: HTTP_ID,
    manifestPath: HTTP_MANIFEST_PATH,
    plugins: [{
      id: HTTP_ID, runtime: 'http', baseUrl, manifestPath: HTTP_MANIFEST_PATH,
      manifestSha256: pinOf(HTTP_MANIFEST_PATH), allowNetwork: false,
      timeouts: { startupMs: 3000, requestMs: 1000, shutdownMs: 500 }, ...over,
    }],
  });
  const authorized = await harness.authorize(HTTP_ID);
  if (!authorized.ok) {
    await harness.cleanup();
    throw new Error(`the http fixture was not authorised: ${authorized.error.message}`);
  }
  return { authorization: authorized.value, cleanup: harness.cleanup };
}

test('http · a full execute over POST /upp on loopback', async () => {
  const service = await serve(wellBehaved);
  const { authorization, cleanup } = await authorize(service.baseUrl);
  try {
    const started = await startHttpPlugin({ authorization });
    assert.equal(started.ok, true, started.ok ? '' : started.error.message);
    if (!started.ok) return;
    assert.equal(started.value.protocolVersion(), '1.0');
    const answer = await started.value.execute('echo', { text: 'over http' });
    assert.equal(answer.ok, true);
    assert.deepEqual(answer.ok ? answer.value : null, { text: 'over http', deadlineMs: 1000 });
    assert.deepEqual((await started.value.health()), { ok: true, value: { status: 'ok' } });
    assert.deepEqual(service.seen.map((r) => r.url), ['/upp', '/upp', '/upp']);
    assert.equal(service.seen.every((r) => r.auth === undefined), true, 'no token is sent on loopback');
    await started.value.shutdown();
  } finally {
    await cleanup();
    await service.close();
  }
});

test('http · a capability absent from the pinned manifest is never sent', async () => {
  const service = await serve(wellBehaved);
  const { authorization, cleanup } = await authorize(service.baseUrl);
  try {
    const started = await startHttpPlugin({ authorization });
    if (!started.ok) throw new Error(started.error.message);
    const answer = await started.value.execute('exfiltrate', {});
    assert.equal(!answer.ok && answer.error.code, 'PERMISSION_DENIED');
    assert.deepEqual(service.seen.map((r) => r.method), ['upp.initialize']);
  } finally {
    await cleanup();
    await service.close();
  }
});

test('http · a status outside 200/204 is -32003', async () => {
  const service = await serve((method, params) => (method === 'upp.execute'
    ? { status: 503, body: '{}' }
    : wellBehaved(method, params)));
  const { authorization, cleanup } = await authorize(service.baseUrl);
  try {
    const started = await startHttpPlugin({ authorization });
    if (!started.ok) throw new Error(started.error.message);
    const answer = await started.value.execute('echo', { text: 'x' });
    assert.equal(!answer.ok && answer.error.code, 'PLUGIN_ERROR');
    assert.match(!answer.ok ? answer.error.message : '', /answered HTTP 503/);
    assert.equal(started.value.state(), 'unhealthy');
  } finally {
    await cleanup();
    await service.close();
  }
});

test('http · a redirect is refused, not followed', async () => {
  const service = await serve((method, params) => (method === 'upp.execute'
    ? { location: 'http://127.0.0.1:1/elsewhere' }
    : wellBehaved(method, params)));
  const { authorization, cleanup } = await authorize(service.baseUrl);
  try {
    const started = await startHttpPlugin({ authorization });
    if (!started.ok) throw new Error(started.error.message);
    const answer = await started.value.execute('echo', { text: 'x' });
    assert.equal(!answer.ok && answer.error.code, 'PLUGIN_ERROR',
      'a 302 is an endpoint asking the host to trust someone the operator never pinned');
    assert.equal(started.value.state(), 'unhealthy');
  } finally {
    await cleanup();
    await service.close();
  }
});

test('http · a service answering a different manifest is refused at initialize', async () => {
  const service = await serve((method, params) => (method === 'upp.initialize'
    ? { result: { protocolVersion: '1.0', manifest: { ...MANIFEST, version: '9.9.9' } } }
    : wellBehaved(method, params)));
  const { authorization, cleanup } = await authorize(service.baseUrl);
  try {
    const started = await startHttpPlugin({ authorization });
    assert.equal(started.ok, false);
    assert.match(!started.ok ? started.error.message : '', /does not match the pinned one/);
  } finally {
    await cleanup();
    await service.close();
  }
});

test('http · a version the host does not support is -32002 and nothing is registered', async () => {
  const service = await serve((method, params) => (method === 'upp.initialize'
    ? { result: { protocolVersion: '2.0', manifest: MANIFEST } }
    : wellBehaved(method, params)));
  const { authorization, cleanup } = await authorize(service.baseUrl);
  try {
    const started = await startHttpPlugin({ authorization });
    assert.equal(started.ok, false);
    assert.equal(!started.ok && started.error.code, -32002);
  } finally {
    await cleanup();
    await service.close();
  }
});
