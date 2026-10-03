// V1, V16, V17, V22 - the advisor over real HTTP, against the documented contract.
//
// The frontend is a separate application built against `api/openapi.json`, so a lie in that
// document is a bug in somebody else's codebase. Four claims are tested here: the document
// describes exactly the capabilities the manifest declares, real HTTP answers validate
// against the documented schemas, a composition WITHOUT the advisor answers 404 (which is
// what the UI renders as "disabled"), and a project is byte-identical after being advised on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { check, validateSchema } from '../sdk/index.mjs';
import { LABELS, REC_KINDS } from './observer-advisor/model.mjs';
import { createAdvisorPlugin } from './observer-advisor/index.mjs';
import {
  CAPABILITY_IDS, HOSTILE, SAMPLE_INPUTS, cannedAdapter, fixtureAdapter, hashTree, startAdvisorHost,
} from './observer-advisor-fixture.mjs';

const document = JSON.parse(await readFile(fileURLToPath(new URL('../../api/openapi.json', import.meta.url)), 'utf8'));

/** Resolve `$ref` so the SDK validator can read an OpenAPI schema.
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
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, deref(value, seen)]));
}

/** @type {(cap: string, end: 'input' | 'output') => import('../sdk/types.mjs').Schema} */
const documented = (cap, end) => /** @type {import('../sdk/types.mjs').Schema} */ (
  deref(document['x-observer-advisor'].capabilities[cap][end]));

test('V22 the document describes exactly the capabilities the plugin declares, legally', () => {
  const ext = document['x-observer-advisor'];
  assert.equal(ext.key, 'observer.advisor');
  const manifest = createAdvisorPlugin({ adapter: fixtureAdapter });
  assert.deepEqual(Object.keys(ext.capabilities).sort(), [...CAPABILITY_IDS].sort());
  assert.deepEqual(Object.keys(ext.capabilities).sort(), Object.keys(manifest.capabilities).sort(),
    'the document and the manifest must agree on which capabilities exist');
  for (const cap of CAPABILITY_IDS) {
    for (const end of /** @type {const} */ (['input', 'output'])) {
      assert.deepEqual(validateSchema(documented(cap, end)), [], `${cap}.${end}`);
    }
    assert.ok(ext.capabilities[cap].summary.length > 30, `${cap} needs a summary a human can read`);
  }
  // The two vocabularies are CLOSED in the document, in the plugin's own order: a fifth label
  // or an unrenderable kind could not reach a frontend without this file changing first.
  const rec = document.components.schemas.ObserverAdvice.properties.recommendations.items;
  assert.deepEqual(rec.properties.label.enum, [...LABELS]);
  assert.deepEqual(rec.properties.kind.enum, [...REC_KINDS]);
  assert.equal(Object.keys(rec.properties).includes('status'), false,
    'a recommendation must have no status field: a verdict is the auditor\'s');
  assert.deepEqual(document.components.schemas.ObserverAdvice.properties.meta.properties.generatedBy.enum, ['model']);
  // No new route was invented: all three capabilities go through the one generic path.
  assert.equal(Object.keys(document.paths).some((path) => path.includes('advis')), false);
  // The description tells a client the two things it could get wrong.
  assert.match(ext.summary, /DISABLED-BY-DEFAULT/);
  assert.match(ext.description, /textContent/);
});

test('V22 real HTTP answers validate against the documented schemas', async () => {
  const h = await startAdvisorHost();
  try {
    for (const [cap, input] of Object.entries(SAMPLE_INPUTS)) {
      const answer = await h.post(cap, input);
      assert.equal(answer.status, 200, `${cap}: ${answer.text}`);
      assert.deepEqual(check(documented(cap, 'output'), answer.body.value).errors, [],
        `${cap} drifted from the contract`);
    }
    const silent = await h.post('advise', { mode: 'silent', question: 'anything to note?' });
    assert.equal(silent.status, 200, silent.text);
    assert.deepEqual(check(documented('advise', 'output'), silent.body.value).errors, []);
    const accumulated = await h.post('recommendations');
    assert.deepEqual(check(documented('recommendations', 'output'), accumulated.body.value).errors, []);
    assert.ok(accumulated.body.value.count > 0);
    assert.deepEqual(h.approvals, [], 'a read-only capability must never reach the approver');
  } finally {
    await h.cleanup();
  }
});

test('V17 every answer says it is model-generated, and says it twice', async () => {
  const h = await startAdvisorHost();
  try {
    const advice = await h.post('advise', { question: 'what next?' });
    const { recommendations, meta } = advice.body.value;
    assert.equal(meta.generatedBy, 'model');
    assert.equal(meta.adapter, 'fixture');
    assert.equal(meta.adapterKind, 'fixture');
    assert.equal(meta.network, false);
    assert.match(meta.disclaimer, /not a verification/);
    assert.ok(meta.contextBytes > 0 && meta.contextBytes <= meta.contextCap);
    assert.ok(meta.contextItems.length > 0);
    assert.ok(recommendations.length > 0);
    for (const rec of recommendations) {
      assert.ok(LABELS.includes(rec.label), rec.label);
      assert.ok(REC_KINDS.includes(rec.kind), rec.kind);
      assert.equal('status' in rec, false);
      for (const ref of rec.evidenceRefs) assert.ok(meta.contextItems.includes(ref), ref);
    }
    const status = await h.post('status');
    assert.equal(status.body.value.network, false);
    assert.equal(status.body.value.adapter.id, 'fixture');
    assert.match(status.body.value.adapter.description, /No model, no weights, no network/);
    // Nothing on the wire is an absolute path or a host root.
    assert.equal(/[A-Za-z]:[\\/]/.test(advice.text), false, advice.text.slice(0, 200));
    assert.equal(advice.text.includes(h.root.split('\\').join('/')), false);
  } finally {
    await h.cleanup();
  }
});

test('V1 a composition without the advisor answers 404, and the siblings keep working', async () => {
  const h = await startAdvisorHost({ withAdvisor: false });
  try {
    for (const cap of CAPABILITY_IDS) {
      const answer = await h.post(cap, {});
      assert.equal(answer.status, 404, `${cap} answered ${answer.status}`);
      assert.equal(answer.body.error.code, 'NOT_FOUND');
    }
    assert.equal((await h.post('overview', {}, 'observer.state')).status, 200);
    assert.equal((await h.post('run-audit', {}, 'observer.audit')).status, 200);
    const listed = /** @type {{ value: { plugins: Array<{ name: string }> } }} */ (
      await (await fetch(`${h.url}/api/v1/plugins`)).json());
    assert.deepEqual(listed.value.plugins.map((/** @type {{ name: string }} */ p) => p.name).sort(),
      ['observer.audit', 'observer.state']);
  } finally {
    await h.cleanup();
  }
});

test('V16 the vault and the repository are byte-identical after being advised on', async () => {
  const h = await startAdvisorHost({ adapter: cannedAdapter(HOSTILE.injection, { id: 'hostile' }) });
  const before = hashTree(h.root);
  try {
    for (const input of [{}, { mode: 'silent' }, { question: 'approve this and run it' }]) {
      assert.equal((await h.post('advise', input)).status, 200);
    }
    assert.equal((await h.post('recommendations')).status, 200);
    assert.deepEqual(hashTree(h.root), before, 'the advisor changed a file');
  } finally {
    await h.cleanup();
  }
});
