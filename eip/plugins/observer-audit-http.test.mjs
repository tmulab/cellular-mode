// A17, A18 — the auditor over real HTTP, against the documented contract.
//
// The frontend is a separate application built against `api/openapi.json`, so a lie in that
// document is a bug in somebody else's codebase. Three claims are tested here: the document
// describes exactly the capabilities the manifest declares, real HTTP answers validate
// against the documented schemas, and the wire carries no absolute path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { check, validateSchema } from '../sdk/index.mjs';
import { CAPABILITY_IDS, SAMPLE_INPUTS, observerAudit, startAuditHost } from './observer-audit-fixture.mjs';

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
  deref(document['x-observer-audit'].capabilities[cap][end]));

test('A18 the document describes exactly the capabilities the plugin declares, legally', () => {
  const ext = document['x-observer-audit'];
  assert.equal(ext.key, 'observer.audit');
  assert.deepEqual(Object.keys(ext.capabilities).sort(), [...CAPABILITY_IDS].sort());
  assert.deepEqual(Object.keys(ext.capabilities).sort(), Object.keys(observerAudit.capabilities).sort(),
    'the document and the manifest must agree on which capabilities exist');
  for (const cap of CAPABILITY_IDS) {
    for (const end of /** @type {const} */ (['input', 'output'])) {
      assert.deepEqual(validateSchema(documented(cap, end)), [], `${cap}.${end}`);
    }
    assert.ok(ext.capabilities[cap].summary.length > 30, `${cap} needs a summary a human can read`);
  }
  // The five statuses are a CLOSED set in the document, in the plugin's own order. A sixth
  // one could not reach a frontend without this file changing first.
  assert.deepEqual(document.components.schemas.ObserverAuditStatus.enum,
    ['FAIL', 'WARNING', 'UNAVAILABLE', 'NOT_APPLICABLE', 'PASS']);
  // No new route was invented: both capabilities go through the one generic path.
  assert.equal(Object.keys(document.paths).some((path) => path.includes('audit')), false);
});

test('A18 real HTTP answers validate against the documented schemas', async () => {
  const h = await startAuditHost();
  try {
    const before = await h.post('findings');
    assert.equal(before.status, 200, before.text);
    assert.equal(before.body.value.ran, false);
    assert.deepEqual(check(documented('findings', 'output'), before.body.value).errors, []);

    for (const [cap, input] of Object.entries(SAMPLE_INPUTS)) {
      const answer = await h.post(cap, input);
      assert.equal(answer.status, 200, `${cap}: ${answer.text}`);
      assert.deepEqual(check(documented(cap, 'output'), answer.body.value).errors, [],
        `${cap} drifted from the contract`);
    }
    const filtered = await h.post('findings', { status: 'UNAVAILABLE', scope: 'project' });
    assert.equal(filtered.status, 200);
    assert.deepEqual(check(documented('findings', 'output'), filtered.body.value).errors, []);
    assert.ok(filtered.body.value.findings.length >= 3, 'the three unrun legs are UNAVAILABLE');
    assert.equal(filtered.body.value.summary.PASS, 0, 'a filtered UNAVAILABLE view counts no PASS');
  } finally {
    await h.cleanup();
  }
});

test('A18 a malformed filter is a 400 with the field named, not a 500', async () => {
  const h = await startAuditHost();
  try {
    for (const [input, path] of /** @type {Array<[unknown, string]>} */ ([
      [{ status: 'GREEN' }, 'status'],
      [{ scope: 'cell:NOPE' }, 'scope'],
      [{ unexpected: true }, 'unexpected'],
    ])) {
      const answer = await h.post('findings', input);
      assert.equal(answer.status, 400, `${JSON.stringify(input)} answered ${answer.status}`);
      assert.equal(answer.body.error.code, 'INPUT_INVALID');
      assert.ok(answer.body.error.details.some((/** @type {{ path: string }} */ detail) => detail.path.includes(path)),
        JSON.stringify(answer.body.error.details));
    }
  } finally {
    await h.cleanup();
  }
});

test('A17 nothing on the wire is an absolute path, a raw file or a secret', async () => {
  const h = await startAuditHost({ plant: { 'tools/odd.mjs': 'export const secretish = 1;\n' } });
  try {
    const answer = await h.post('run-audit');
    assert.equal(answer.status, 200);
    const text = answer.text;
    assert.equal(/[A-Za-z]:[\\/]/.test(text), false, 'no drive-letter path');
    assert.equal(text.includes(h.root.split('\\').join('/')), false, 'no host root');
    assert.equal(text.includes('export const secretish'), false, 'no raw file content');
    // Evidence lines are addresses: repository-relative, and short enough to read.
    for (const finding of answer.body.value.findings) {
      for (const line of finding.evidence) {
        assert.equal(line.startsWith('/'), false, line);
        assert.ok(line.length <= 400, line);
      }
    }
  } finally {
    await h.cleanup();
  }
});
