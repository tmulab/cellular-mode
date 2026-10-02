// H1-H6, H8, H10 — what a caller can make this process do. Transport refusals and
// the dev UI are in transport.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PARAGRAPH } from '../plugins/fixture.mjs';
import { CAPABILITY, SAVE_REPORT, envelope, header, startHost } from './fixture.mjs';
import { HOST_ADDRESS } from './index.mjs';

/** @typedef {import('./fixture.mjs').Answer} Answer */
/** The public metadata of one plugin, as `/api/v1/plugins` publishes it.
 * @typedef {{ name: string, devUi?: unknown, inject?: unknown }} Listed */

/** Every response, whatever it is, carries these.
 * @param {Answer} answer @param {{ api?: boolean }} [options] */
function assertSecurityHeaders(answer, { api = true } = {}) {
  const { headers } = answer;
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('referrer-policy'), 'no-referrer');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('cache-control'), 'no-store');
  if (api) assert.match(header(answer, 'content-type'), /^application\/json/);
  for (const forbidden of ['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods']) {
    assert.equal(headers.get(forbidden), null, `${forbidden} must not exist: frontends proxy through their own server`);
  }
}

test('H1/H2/H8/H10 health, plugins, headers and a loopback socket', async () => {
  const h = await startHost();
  try {
    assert.match(h.url, new RegExp(`^http://${HOST_ADDRESS}:\\d+$`));

    const health = await h.call('/api/v1/health');
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, {
      ok: true,
      value: { status: 'ok', sdk: '1', devUi: false, plugins: ['text.report', 'text.stats'] },
    });
    assertSecurityHeaders(health);

    const listed = await h.call('/api/v1/plugins');
    assert.equal(listed.status, 200);
    const published = /** @type {Listed[]} */ (envelope(listed).value?.plugins);
    assert.deepEqual(published.map((p) => p.name).sort(), ['text.report', 'text.stats']);
    const stats = published.find((p) => p.name === 'text.stats');
    assert.deepEqual(stats?.devUi, { title: 'Text statistics' }, 'the dev-UI body never travels');
    assert.equal('apply' in (stats ?? {}), false, 'the executable never travels');
    assert.deepEqual(
      published.find((p) => p.name === 'text.report')?.inject,
      { 'text.stats': { required: true } },
    );
    assert.match(listed.text, /\n$/);
  } finally {
    await h.cleanup();
  }
});

test('H3 a capability call is a validated round trip', async () => {
  const h = await startHost();
  try {
    const ok = await h.post(CAPABILITY, { input: { text: PARAGRAPH } });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { ok: true, value: { words: 69 } });

    const empty = await h.post(CAPABILITY, {});
    assert.equal(empty.status, 400, 'an absent input is still validated against the schema');
    assert.equal(envelope(empty).error?.code, 'INPUT_INVALID');
    assert.deepEqual((envelope(empty).error?.details ?? []).map((d) => d.path), ['text']);
  } finally {
    await h.cleanup();
  }
});

test('H4 kernel codes map to statuses, and no stack ever travels', async () => {
  const h = await startHost();
  try {
    /** @type {Array<[string, Record<string, unknown>, number, string]>} */
    const cases = [
      [`/api/v1/plugins/text.stats/capabilities/count-words`, { input: { text: 1 } }, 400, 'INPUT_INVALID'],
      [`/api/v1/plugins/no.such/capabilities/count-words`, { input: {} }, 404, 'NOT_FOUND'],
      [`/api/v1/plugins/text.stats/capabilities/no-such-cap`, { input: {} }, 404, 'NOT_FOUND'],
      [SAVE_REPORT, { input: { name: 'x', text: 'a b' } }, 403, 'APPROVAL_REQUIRED'],
    ];
    for (const [path, payload, status, code] of cases) {
      const result = await h.post(path, payload);
      assert.equal(result.status, status, `${path}: ${result.text}`);
      assert.equal(envelope(result).ok, false);
      assert.equal(envelope(result).error?.code, code);
      assert.equal('stack' in (envelope(result).error ?? {}), false);
      assertSecurityHeaders(result);
    }
  } finally {
    await h.cleanup();
  }
});

test('H5 consequential over HTTP is fail-closed, then real with an approver', async () => {
  const closed = await startHost();
  try {
    const refused = await closed.post(SAVE_REPORT, { input: { name: 'daily', text: PARAGRAPH } });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error.code, 'APPROVAL_REQUIRED');
    assert.deepEqual(await readdir(closed.reportsDir), [], 'nothing may be written without a decision');
  } finally {
    await closed.cleanup();
  }

  const open = await startHost({ approver: async () => ({ approved: true, by: 'operator' }) });
  try {
    const saved = await open.post(SAVE_REPORT, { input: { name: 'daily', text: PARAGRAPH } });
    assert.equal(saved.status, 200, saved.text);
    assert.deepEqual(saved.body, { ok: true, value: { path: 'daily.json', words: 69, minutes: 1 } });
    assert.deepEqual(await readdir(open.reportsDir), ['daily.json']);
    const written = JSON.parse(await readFile(join(open.reportsDir, 'daily.json'), 'utf8'));
    assert.equal(written.words, 69);
    assert.equal(open.approvals.length, 1);
    assert.equal(/** @type {{ cap: string }} */ (open.approvals[0]).cap, 'save-report');

    const denied = await open.post(SAVE_REPORT, { input: { name: '../escape', text: 'a b' } });
    assert.equal(denied.status, 500, 'a contained plugin fault is a 500 without a stack');
    assert.equal(envelope(denied).error?.details?.[0]?.path, 'INPUT_INVALID');
    assert.deepEqual(await readdir(open.reportsDir), ['daily.json']);
  } finally {
    await open.cleanup();
  }
});

test('H6 an HTTP caller can never approve itself', async () => {
  const h = await startHost({ approver: () => ({ approved: true, by: 'operator' }) });
  try {
    const forged = await h.post(SAVE_REPORT, {
      input: { name: 'forged', text: 'a b' },
      approval: { approved: true, by: 'me, myself' },
    });
    assert.equal(forged.status, 403);
    assert.equal(envelope(forged).error?.code, 'APPROVAL_REQUIRED');
    assert.equal(envelope(forged).error?.details?.[0]?.path, 'approval');
    assert.deepEqual(h.approvals, [], 'the approver must not even be consulted');
    assert.deepEqual(await readdir(h.reportsDir), []);

    const extra = await h.post(CAPABILITY, { input: { text: 'a b' }, timeoutMs: 1 });
    assert.equal(extra.status, 400);
    assert.deepEqual((envelope(extra).error?.details ?? []).map((d) => d.path), ['timeoutMs']);
  } finally {
    await h.cleanup();
  }
});
