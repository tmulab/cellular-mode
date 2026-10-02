// H12 — api/openapi.json is the contract, not a brochure.
//
// Documentation drift is the failure mode here: an independent frontend is built
// against this file, so a lie in it is a production bug in someone else's codebase.
// Three claims are tested: the document describes exactly the routes the server
// answers, its schemas are legal in the SDK subset, and REAL responses validate
// against them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CODES, check, validateSchema } from '../sdk/index.mjs';
import { ROUTE_TABLE } from './router.mjs';
import { CAPABILITY, SAVE_REPORT, startHost } from './fixture.mjs';

const DOC_URL = new URL('../../api/openapi.json', import.meta.url);
const document = JSON.parse(await readFile(fileURLToPath(DOC_URL), 'utf8'));

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
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, deref(v, seen)]));
}

/** @type {(template: string, method: string, status: number) => import('../sdk/types.mjs').Schema} */
const schemaFor = (template, method, status) => /** @type {import('../sdk/types.mjs').Schema} */ (deref(
  document.paths[template][method.toLowerCase()].responses[String(status)].content['application/json'].schema,
));

test('H12 the document describes exactly the routes the server answers', () => {
  assert.match(document.openapi, /^3\.1\./);
  const documented = [];
  for (const [template, operations] of Object.entries(document.paths)) {
    for (const method of Object.keys(operations)) documented.push(`${method.toUpperCase()} ${template}`);
  }
  const served = ROUTE_TABLE.map((route) => `${route.method} ${route.template}`);
  assert.deepEqual(documented.sort(), served.sort());
  // The dev UI is diagnostics, not API: documenting it would invite production use.
  assert.equal(Object.keys(document.paths).some((path) => path.startsWith('/dev')), false);
});

test('H12 every documented schema is legal in the SDK subset, and the code enum is the closed list', () => {
  let checked = 0;
  for (const [template, operations] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      for (const [status, response] of Object.entries(operation.responses)) {
        const schema = deref(response.content['application/json'].schema);
        assert.deepEqual(validateSchema(schema), [], `${method} ${template} ${status}`);
        checked += 1;
      }
      const body = operation.requestBody?.content['application/json'].schema;
      if (body !== undefined) assert.deepEqual(validateSchema(deref(body)), []);
    }
  }
  assert.ok(checked >= 13, `expected the error statuses to be documented, saw ${checked}`);
  const enumerated = document.components.schemas.ErrorEnvelope
    .properties.error.properties.code.enum;
  assert.deepEqual([...enumerated].sort(), [...CODES].sort());
});

test('H12 real responses validate against the documented schemas', async () => {
  const h = await startHost({ devUi: true, approver: async () => ({ approved: true, by: 'operator' }) });
  const CAP = '/api/v1/plugins/{key}/capabilities/{cap}';
  try {
    /** @type {Array<[string, string, string, number, Record<string, unknown> | undefined]>} */
    const cases = [
      ['/api/v1/health', 'GET', '/api/v1/health', 200, undefined],
      ['/api/v1/plugins', 'GET', '/api/v1/plugins', 200, undefined],
      [CAPABILITY, 'POST', CAP, 200, { input: { text: 'four words right here' } }],
      [CAPABILITY, 'POST', CAP, 400, { input: { text: 7 } }],
      ['/api/v1/plugins/no.such/capabilities/x', 'POST', CAP, 404, { input: {} }],
      [SAVE_REPORT, 'POST', CAP, 403, { input: { name: 'a', text: 'b c' }, approval: { approved: true } }],
      [SAVE_REPORT, 'POST', CAP, 500, { input: { name: '../escape', text: 'b c' } }],
    ];
    for (const [path, method, template, status, payload] of cases) {
      const response = method === 'GET' ? await h.call(path) : await h.post(path, payload);
      assert.equal(response.status, status, `${method} ${path}: ${response.text}`);
      const verdict = check(schemaFor(template, method, status), response.body);
      assert.deepEqual(verdict.errors, [], `${method} ${path} ${status} drifted from the contract`);
    }
    // 405 and 415 are documented too, so they are exercised against their schema.
    const wrongMethod = await h.call('/api/v1/health', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(wrongMethod.status, 405);
    assert.deepEqual(check(schemaFor('/api/v1/health', 'GET', 405), wrongMethod.body).errors, []);
    const wrongType = await h.call(CAPABILITY, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(wrongType.status, 415);
    assert.deepEqual(check(schemaFor(CAP, 'POST', 415), wrongType.body).errors, []);
  } finally {
    await h.cleanup();
  }
});

test('H12 every documented route is actually answered (no documented-only route)', async () => {
  const h = await startHost();
  try {
    for (const route of ROUTE_TABLE) {
      const path = route.template
        .replace('{key}', 'text.stats')
        .replace('{cap}', 'count-words');
      const response = route.method === 'GET'
        ? await h.call(path)
        : await h.post(path, { input: { text: 'a b' } });
      assert.equal(response.status, 200, `${route.method} ${path} answered ${response.status}`);
    }
  } finally {
    await h.cleanup();
  }
});
