// H7 and H9 — the transport layer and the dev UI. Split out of http.test.mjs to
// stay inside the 200-line budget: that file is about the API's answers, this one
// about what the server refuses to read and what it refuses to serve.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITY, envelope, header, startHost } from './fixture.mjs';
import { MAX_BODY_BYTES } from './body.mjs';

test('H7 the transport refuses what it does not understand', async () => {
  const h = await startHost();
  try {
    const wrongType = await h.call(CAPABILITY, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(wrongType.status, 415);
    assert.equal(wrongType.body.error.details[0].path, 'content-type');

    const tooBig = await h.call(CAPABILITY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { text: 'x'.repeat(MAX_BODY_BYTES + 100) } }),
    });
    assert.equal(tooBig.status, 413);
    assert.equal(tooBig.body.error.code, 'INPUT_INVALID');

    const malformed = await h.call(CAPABILITY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"input":' });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.details[0].path, 'body');

    const notAnObject = await h.post(CAPABILITY, [1, 2, 3]);
    assert.equal(notAnObject.status, 400);

    const wrongMethod = await h.call('/api/v1/health', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'GET');
    assert.equal(wrongMethod.body.error.details[0].path, 'method');

    const getOnCapability = await h.call(CAPABILITY);
    assert.equal(getOnCapability.status, 405);
    assert.equal(getOnCapability.headers.get('allow'), 'POST');

    for (const unknown of ['/', '/api/v1', '/api/v2/health', '/api/v1/plugins/text.stats', '/favicon.ico']) {
      const miss = await h.call(unknown);
      assert.equal(miss.status, 404, `${unknown} should be 404`);
      assert.equal(miss.body.error.code, 'NOT_FOUND');
    }
  } finally {
    await h.cleanup();
  }
});

test('H9 the dev UI is opt-in, same-origin and script-safe', async () => {
  const off = await startHost();
  try {
    for (const path of ['/dev/plugins/text.stats', '/dev/assets/dev-ui.js', '/dev/assets/dev-ui.css']) {
      const miss = await off.call(path);
      assert.equal(miss.status, 404, `${path} must not exist by default`);
      assert.equal(miss.body.error.code, 'NOT_FOUND');
    }
  } finally {
    await off.cleanup();
  }

  const on = await startHost({ devUi: true });
  try {
    assert.equal(envelope(await on.call('/api/v1/health')).value?.devUi, true);
    const page = await on.call('/dev/plugins/text.stats');
    assert.equal(page.status, 200);
    assert.match(header(page, 'content-type'), /^text\/html/);
    const csp = header(page, 'content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.equal(/unsafe-inline|unsafe-eval|\*/.test(csp), false, `a CSP with a wildcard is a comment: ${csp}`);
    assert.equal(/<script[^>]*>[^<]+<\/script>/.test(page.text), false, 'no inline script body');
    assert.equal(/\son[a-z]+\s*=/i.test(page.text), false, 'no inline handler');
    assert.equal(/https?:\/\//i.test(page.text), false, 'no third-party resource');
    assert.match(page.text, /src="\/dev\/assets\/dev-ui\.js"/);
    assert.match(page.text, /href="\/dev\/assets\/dev-ui\.css"/);
    assert.match(page.text, /data-api="\/api\/v1\/plugins\/text\.stats\/capabilities"/);

    const script = await on.call('/dev/assets/dev-ui.js');
    assert.equal(script.status, 200);
    assert.match(header(script, 'content-type'), /javascript/);
    assert.match(script.text, /fetch\(url/);
    assert.equal(/https?:\/\//i.test(script.text), false);
    assert.match(header(await on.call('/dev/assets/dev-ui.css'), 'content-type'), /^text\/css/);

    const noUi = await on.call('/dev/plugins/text.report');
    assert.equal(noUi.status, 404, 'a plugin without a dev UI has no page');
    assert.equal((await on.call('/dev/plugins/no.such')).status, 404);
  } finally {
    await on.cleanup();
  }
});
