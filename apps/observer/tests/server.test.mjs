// D2, D3, D5 — the static half of the server: what it will hand out, what headers it sends,
// and where it listens. Run against a real socket, because "it binds loopback" is not a
// claim a pure function can make.
import test, { describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { ASSETS, assetFor, splitTarget } from '../assets.mjs';
import { CSP, SECURITY_HEADERS } from '../headers.mjs';
import { BIND_ADDRESS, createAppServer } from '../server.mjs';

/** @type {{ close: () => Promise<unknown> } | null} */
let app = null;
let port = 0;

/** @param {string} path @param {string} [method] @returns {Promise<{ status: number, headers: Record<string, string | string[] | undefined>, body: string }>} */
function fetchRaw(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const call = request({ host: BIND_ADDRESS, port, path, method }, (answer) => {
      let body = '';
      answer.setEncoding('utf8');
      answer.on('data', (chunk) => { body += chunk; });
      answer.on('end', () => resolve({ status: answer.statusCode ?? 0, headers: answer.headers, body }));
    });
    call.on('error', reject);
    call.end();
  });
}

before(async () => {
  // Upstream port 1: nothing listens there, which is correct for a static-only test.
  const server = createAppServer({ upstreamPort: 1 });
  ({ port } = await server.listen(0));
  app = server;
});
after(async () => { await app?.close(); });

describe('D2 · an allowlist, not a filesystem', () => {
  test('every allowlisted path answers 200 with its declared type', async () => {
    for (const [url, asset] of Object.entries(ASSETS)) {
      const answer = await fetchRaw(url);
      assert.equal(answer.status, 200, `${url} must be served`);
      assert.equal(answer.headers['content-type'], asset.type, `${url} type`);
    }
  });

  test('an unknown path is 404, with no hint about what exists', async () => {
    for (const path of ['/nope', '/web', '/web/', '/package.json', '/favicon.ico']) {
      const answer = await fetchRaw(path);
      assert.equal(answer.status, 404, `${path} must be 404`);
      assert.doesNotMatch(answer.body, /web\/|vendor|\.mjs/, `${path} must not list anything`);
    }
  });

  test('a directory is 404 and never a listing', async () => {
    for (const path of ['/web/', '/vendor/', '/fixtures/', '/view/', '/..']) {
      const answer = await fetchRaw(path);
      assert.equal(answer.status, 404);
      assert.ok(!answer.body.includes('index.html'), `${path} must not reveal a directory`);
    }
  });

  test('traversal in every spelling is refused', async () => {
    const attempts = [
      '/../package.json', '/web/../../package.json', '/%2e%2e/package.json',
      '/%2e%2e%2fpackage.json', '/..%5cpackage.json', '/web/..%2f..%2fLICENSE',
      '/web/main.mjs/../../../LICENSE', '//etc/passwd', '/web/%00main.mjs',
      '/vendor/three@0.180.0/../../../LICENSE',
    ];
    for (const path of attempts) {
      const answer = await fetchRaw(path);
      assert.ok(answer.status === 404 || answer.status === 400, `${path} answered ${answer.status}`);
      assert.doesNotMatch(answer.body, /Apache License|"name": "cellular-mode"/, `${path} leaked a file`);
    }
  });

  test('the lookup is a comparison: nothing is ever joined to the request text', () => {
    const text = readFileSync(new URL('../assets.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(text, /\bjoin\(/, 'assets.mjs must not join paths at all');
    assert.equal(assetFor('/../package.json'), null);
    assert.equal(assetFor('/web/main.mjs/'), null);
    assert.equal(assetFor(Object.prototype.toString), null);
    // A prototype key must not resolve to an asset: `hasOwnProperty` is the whole defence.
    assert.equal(assetFor('__proto__'), null);
    assert.equal(assetFor('constructor'), null);
  });

  test('a malformed percent-escape is not a path', () => {
    assert.equal(splitTarget('/%zz'), null);
    assert.equal(splitTarget('nope'), null);
    assert.equal(splitTarget('/web/%00x'), null);
    assert.deepEqual(splitTarget('/a?b=1#c'), { pathname: '/a', query: 'b=1' });
  });

  test('a method other than GET or HEAD is 405, not a silent 200', async () => {
    const answer = await fetchRaw('/web/app.css', 'DELETE');
    assert.equal(answer.status, 405);
    assert.equal(answer.headers['allow'], 'GET, HEAD');
  });
});

describe('D3 · the same strict headers on every answer', () => {
  test('success and refusal both carry the full set', async () => {
    for (const path of ['/', '/nope', '/web/app.css']) {
      const { headers } = await fetchRaw(path);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        assert.equal(headers[name.toLowerCase()], value, `${path} must send ${name}`);
      }
    }
  });

  test('the CSP is exactly the declared policy — every directive, no unsafe anything', async () => {
    const { headers } = await fetchRaw('/');
    assert.equal(headers['content-security-policy'], CSP);
    for (const directive of [
      "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self'",
      "connect-src 'self'", "object-src 'none'", "base-uri 'none'",
      "frame-ancestors 'none'", "form-action 'none'",
    ]) {
      assert.ok(CSP.includes(directive), `the CSP must contain ${directive}`);
    }
    assert.doesNotMatch(CSP, /unsafe-inline|unsafe-eval|\*|data:|https?:/);
  });

  test('no CORS header exists anywhere: the app and the API are one origin', async () => {
    for (const path of ['/', '/web/main.mjs', '/nope', '/api/v1/health']) {
      const { headers } = await fetchRaw(path);
      for (const name of Object.keys(headers)) {
        assert.doesNotMatch(name, /^access-control-/, `${path} sent ${name}`);
      }
    }
  });

  test('the page itself has no inline script and no inline style', () => {
    const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'no inline <script>');
    assert.doesNotMatch(html, /<style/, 'no inline <style>');
    assert.doesNotMatch(html, /\sstyle="/, 'no style attribute');
    assert.doesNotMatch(html, /\son[a-z]+="/, 'no inline event handler');
  });
});

describe('D5 · loopback, with no way to change it', () => {
  test('the bound address is 127.0.0.1', () => {
    assert.equal(BIND_ADDRESS, '127.0.0.1');
  });

  test('neither the server nor the launcher offers a host option or flag', () => {
    const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(server, /0\.0\.0\.0|::|--host/, 'no alternative bind address may exist');
    assert.equal(server.match(/server\.listen\(/g)?.length, 1, 'exactly one listen call');
    assert.match(server, /server\.listen\(port, BIND_ADDRESS/, 'and it binds the constant');
    const cli = readFileSync(new URL('../cli.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(cli, /--host|--bind|0\.0\.0\.0/, 'the launcher must offer no such flag');
  });
});
