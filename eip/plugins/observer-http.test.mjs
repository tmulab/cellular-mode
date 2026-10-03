// O13, O14, O15 — the observer through a real host, over a real socket.
//
// Three claims that only an end-to-end run can make: a full API session leaves the
// vault's BYTES untouched, no response carries an absolute path, and what
// `api/openapi.json` promises is what the server actually sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { check, validateSchema } from '../sdk/index.mjs';
import {
  CAPABILITY_IDS, EXPECTED, SAMPLE_INPUTS, demoVault, hashTree, observerState, startObserverHost,
} from './observer-fixture.mjs';
import { createHost } from '../host/index.mjs';
import textStats from './text-stats/index.mjs';

const DOC_URL = new URL('../../api/openapi.json', import.meta.url);
const document = JSON.parse(await readFile(fileURLToPath(DOC_URL), 'utf8'));

/** Resolve `$ref` so the SDK validator can read an OpenAPI schema. Same shape as the
 * host's own contract test: one document, one way of reading it.
 * @param {unknown} node @param {number} [seen] @returns {unknown} */
function deref(node, seen = 0) {
  if (seen > 10) throw new Error('$ref nesting too deep');
  if (Array.isArray(node)) return node.map((item) => deref(item, seen));
  if (node === null || typeof node !== 'object') return node;
  const ref = /** @type {{ $ref?: unknown }} */ (node).$ref;
  if (typeof ref === 'string') {
    const [, , group, name] = ref.split('/');
    const target = document.components[String(group)][String(name)];
    assert.ok(target !== undefined, `dangling $ref ${ref}`);
    return deref(target, seen + 1);
  }
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, deref(v, seen)]));
}

/** One sufficient input, read through a typed lookup: CAPABILITY_IDS is a list of
 * strings and SAMPLE_INPUTS is keyed by them, so the lookup says so once.
 * @type {(cap: string) => Record<string, unknown>} */
const sampleFor = (cap) => /** @type {Record<string, Record<string, unknown>>} */ (SAMPLE_INPUTS)[cap] ?? {};

/** A parsed JSON envelope, as `api/openapi.json` describes every JSON answer.
 * @type {(body: unknown) => { ok: boolean, value: Record<string, unknown>,
 *   error: { code: string, message: string, details: Array<{ path: string }> } }} */
const envelope = (body) => /** @type {ReturnType<typeof envelope>} */ (body);

/** @type {(cap: string, end: 'input' | 'output') => import('../sdk/types.mjs').Schema} */
const documented = (cap, end) => /** @type {import('../sdk/types.mjs').Schema} */ (
  deref(document['x-observer-state'].capabilities[cap][end]));

test('O15 the document describes exactly the capabilities the plugin declares, legally', () => {
  const ext = document['x-observer-state'];
  assert.equal(ext.key, 'observer.state');
  assert.deepEqual(Object.keys(ext.capabilities).sort(), [...CAPABILITY_IDS].sort());
  assert.deepEqual(Object.keys(ext.capabilities).sort(),
    Object.keys(observerState.capabilities).sort(),
    'the document and the manifest must agree on which capabilities exist');
  let checked = 0;
  for (const cap of CAPABILITY_IDS) {
    for (const end of /** @type {const} */ (['input', 'output'])) {
      assert.deepEqual(validateSchema(documented(cap, end)), [], `${cap}.${end}`);
      checked += 1;
    }
    assert.ok(ext.capabilities[cap].summary.length > 30, `${cap} needs a summary a human can read`);
  }
  assert.equal(checked, 10);
  // No new route was invented: the five capabilities go through the generic path, so
  // the host's own route contract test stays the single authority on routes.
  assert.equal(Object.keys(document.paths).some((p) => p.includes('observer')), false);
});

test('O15 every capability answers over HTTP and validates against the documented schema', async () => {
  const h = await startObserverHost();
  try {
    for (const cap of CAPABILITY_IDS) {
      const input = sampleFor(cap);
      const answer = await h.post(cap, input);
      assert.equal(answer.status, 200, `${cap}: ${answer.text}`);
      assert.equal(envelope(answer.body).ok, true);
      assert.deepEqual(check(documented(cap, 'input'), input).errors, [], `${cap} input`);
      assert.deepEqual(check(documented(cap, 'output'), envelope(answer.body).value).errors, [],
        `${cap} drifted from the contract: ${answer.text}`);
    }
    // The health route lists the loaded key, which is how a frontend discovers that
    // the observer is composed at all.
    const health = await h.get('/api/v1/health');
    assert.deepEqual(envelope(health.body).value.plugins, ['observer.state']);
  } finally {
    await h.cleanup();
  }
});

test('O15 the documented error shapes are the ones the host really sends', async () => {
  const h = await startObserverHost();
  try {
    // An unknown cell is the CLIENT's question, so it is a 404 and not a 500: the
    // plugin's NOT_FOUND passes through the kernel with its own code.
    const unknown = await h.post('cell-detail', { id: 'no-such-cell' });
    assert.equal(unknown.status, 404);
    assert.equal(envelope(unknown.body).error.code, 'NOT_FOUND');
    assert.match(envelope(unknown.body).error.message, /no cell with id "no-such-cell"/);
    const badCharset = await h.post('cell-detail', { id: 'Not-A-Slug' });
    assert.equal(badCharset.status, 400);
    assert.equal(envelope(badCharset.body).error.code, 'INPUT_INVALID');
    const badType = await h.post('cell-detail', { id: 7 });
    assert.equal(badType.status, 400);
    assert.equal(envelope(badType.body).error.code, 'INPUT_INVALID');
    // No 500 anywhere in this set: a well-formed question never faults the server.
    for (const a of [unknown, badCharset, badType]) assert.notEqual(a.status, 500);
    const errorSchema = /** @type {import('../sdk/types.mjs').Schema} */ (deref(
      document.components.schemas.ErrorEnvelope));
    for (const answer of [unknown, badCharset, badType]) {
      assert.deepEqual(check(errorSchema, answer.body).errors, []);
    }
  } finally {
    await h.cleanup();
  }
});

test('O14 no response carries an absolute path, a drive letter or the vault root', async () => {
  const h = await startObserverHost();
  try {
    const letter = String.fromCharCode(67); // built, never written as a literal
    /** @type {RegExp[]} */
    const forbidden = [
      /[A-Za-z]:[\\/]/,
      new RegExp(`${letter}:`),
      /(^|["\s])\/[A-Za-z]/,
      /\\\\/,
      /vault[\\/]state/,
    ];
    const roots = [h.root, h.state, tmpdir(), process.cwd()];
    for (const cap of CAPABILITY_IDS) {
      const answer = await h.post(cap, sampleFor(cap));
      for (const re of forbidden) {
        assert.equal(re.test(answer.text), false, `${cap} leaked a path shape ${re}: ${answer.text}`);
      }
      for (const root of roots) {
        assert.equal(answer.text.includes(root), false, `${cap} leaked a filesystem root`);
        assert.equal(answer.text.includes(root.split('\\').join('/')), false,
          `${cap} leaked a filesystem root in POSIX form`);
      }
    }
    // Including the refusals: a refused read must not say where it refused to look.
    const refused = await h.post('cell-detail', { id: 'no-such-cell' });
    for (const re of forbidden) assert.equal(re.test(refused.text), false, String(re));
  } finally {
    await h.cleanup();
  }
});

test('O13 a full API session leaves every vault byte identical', async () => {
  const h = await startObserverHost();
  try {
    const before = hashTree(h.state);
    assert.equal(Object.keys(before).length, 9, 'the replayed vault has nine files');
    for (const cap of CAPABILITY_IDS) {
      await h.post(cap, sampleFor(cap));
      await h.post(cap, sampleFor(cap));
    }
    await h.post('cell-detail', { id: 'no-such-cell' });
    await h.post('timeline', { limit: 500 });
    assert.deepEqual(hashTree(h.state), before,
      'observer.state holds no write port, so a session cannot change a byte');
  } finally {
    await h.cleanup();
  }
});

test('O13 removing the plugin removes the feature and nothing else', async () => {
  // The SAME replayed vault, inspected with and without the observer composed. A
  // host that never loads the plugin must leave exactly the same bytes, which is what
  // "optional" has to mean to be worth saying.
  const vault = demoVault();
  try {
    const pristine = hashTree(vault.state);
    const host = await createHost({ plugins: [textStats], reportsDir: `${vault.root}/reports` });
    const { url } = await host.listen(0);
    try {
      const health = await fetch(`${url}/api/v1/health`);
      assert.deepEqual(envelope(await health.json()).value.plugins, ['text.stats']);
      const gone = await fetch(`${url}/api/v1/plugins/observer.state/capabilities/overview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      });
      assert.equal(gone.status, 404, 'no plugin, no capability — and no second runtime either');
      assert.equal(envelope(await gone.json()).error.code, 'NOT_FOUND');
    } finally {
      await host.close();
    }
    assert.deepEqual(hashTree(vault.state), pristine);
    // And the vault is still a valid vault: the CLI is the authority, not the reader.
    assert.equal(EXPECTED.counts.total, 4);
  } finally {
    vault.cleanup();
  }
});
