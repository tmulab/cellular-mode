// U5 · the published JSON schemas and the JS validator agree, and the committed files are
// exactly what the generator produces.
//
// The honest half of this criterion is the second test: the SDK subset has no `oneOf`, no
// `patternProperties` and no `pattern`, so a published schema states the SHAPE and the
// CONDITIONAL rules stay in `eip/upp/manifest.mjs`. The two are not the same strength, and a
// test that pretended otherwise would be the dangerous artefact. So the asymmetry is asserted
// in both directions: shape-level verdicts must agree, and every conditional case must be one
// the JSON schema accepts and the JS validator refuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSchema, validateValue } from '../eip/sdk/index.mjs';
import {
  MANIFEST_SCHEMA, METHODS, PARAMS_SCHEMA_BY_METHOD, PUBLISHED_SCHEMAS,
  RESULT_SCHEMA_BY_METHOD, manifestSchemaDocument, messageSchemaDocument,
  renderSchemaFile, validateUppManifest,
} from '../eip/upp/index.mjs';
import { ROOT } from './helpers.mjs';

/** @type {(file: string) => string} */
const committed = (file) => readFileSync(join(ROOT, 'upp', 'schemas', file), 'utf8');
/** @type {(patch?: Record<string, unknown>) => Record<string, unknown>} */
const manifest = (patch = {}) => ({
  upp: '1.0',
  id: 'text.stats',
  version: '1.0.0',
  description: 'Counts words.',
  type: 'capability',
  runtime: 'process',
  entry: { command: ['python', 'plugin.py'] },
  capabilities: {
    'count-words': { description: 'Count words.', consequential: false, input: {}, output: {} },
  },
  ...patch,
});

test('upp schemas · the committed files are exactly what the generator produces', () => {
  // Nothing that WRITES is imported here, on purpose: a test that loaded the writer would
  // regenerate the files it was checking and could never go red.
  assert.equal(PUBLISHED_SCHEMAS.length, 2);
  for (const { file, document } of PUBLISHED_SCHEMAS) {
    assert.equal(committed(file), renderSchemaFile(document()),
      `${file} is stale - run: node upp/schemas/generate.mjs`);
  }
});

test('upp schemas · each published file is valid JSON and says it is generated', () => {
  for (const { file } of PUBLISHED_SCHEMAS) {
    const parsed = JSON.parse(committed(file));
    assert.equal(parsed.upp, '1.0');
    assert.match(String(parsed.$comment), /GENERATED from eip\/upp\/schemas\.mjs/);
    assert.match(String(parsed.$comment), /SHAPE only/,
      'the file must state its own limit, or somebody will read it as the whole contract');
  }
});

test('upp schemas · every published schema is itself legal in the SDK subset', () => {
  assert.deepEqual(validateSchema(MANIFEST_SCHEMA, 'manifest'), []);
  for (const method of METHODS) {
    const params = /** @type {Record<string, unknown>} */ (PARAMS_SCHEMA_BY_METHOD)[method];
    assert.deepEqual(validateSchema(params, `params.${method}`), [], method);
  }
  for (const [method, result] of Object.entries(RESULT_SCHEMA_BY_METHOD)) {
    assert.deepEqual(validateSchema(result, `result.${method}`), [], method);
  }
});

test('upp schemas · the manifest document carries the field list and the schema', () => {
  const doc = manifestSchemaDocument();
  assert.deepEqual(doc.schema, MANIFEST_SCHEMA);
  assert.ok(Array.isArray(doc.fields) && doc.fields.includes('extensions'));
  const message = messageSchemaDocument();
  assert.equal(message.jsonrpc, '2.0');
  assert.deepEqual(message.methods, [...METHODS]);
  assert.deepEqual(message.notifications, ['upp.cancel', 'upp.exit']);
});

test('upp schemas · U5 SHAPE verdicts agree with the JS validator, case by case', () => {
  /** Shape-level cases: what the published schema can express, it must agree about.
   * @type {Array<[string, Record<string, unknown>, boolean]>} */
  const cases = [
    ['the minimal manifest', manifest(), true],
    ['an unknown top-level field', manifest({ sdk: '1' }), false],
    ['a bad upp version', manifest({ upp: '9.9' }), false],
    ['a non-string id', manifest({ id: 7 }), false],
    ['an empty description', manifest({ description: '' }), false],
    ['an unknown type', manifest({ type: 'widget' }), false],
    ['an unknown runtime', manifest({ runtime: 'wasm' }), false],
    ['an unknown permission', manifest({ permissions: ['net.inbound'] }), false],
    ['permissions not an array', manifest({ permissions: 'fs.read' }), false],
    ['a bad health interval', manifest({ health: { intervalMs: 10 } }), false],
    ['an unknown health key', manifest({ health: { every: 1000 } }), false],
    ['a negative lifecycle timeout', manifest({ lifecycle: { startupTimeoutMs: -1 } }), false],
    ['extensions carrying anything', manifest({ extensions: { future: { deep: [1] } } }), true],
  ];
  for (const [label, value, expected] of cases) {
    const bySchema = validateValue(MANIFEST_SCHEMA, value).length === 0;
    const byValidator = validateUppManifest(value).ok;
    assert.equal(bySchema, expected, `${label}: the published schema disagrees`);
    assert.equal(byValidator, expected, `${label}: the JS validator disagrees`);
  }
});

test('upp schemas · U5 the CONDITIONAL rules are the JS validator`s alone, and that is stated', () => {
  // Every case here is one the shape schema CANNOT catch. Each must pass the schema and fail
  // the validator: that asymmetry is the documented limit, so it is pinned rather than
  // described. If a case ever starts failing the schema too, the subset grew a keyword and
  // this test should be revisited on purpose.
  /** @type {Array<[string, Record<string, unknown>]>} */
  const conditional = [
    ['a shell string instead of argv', manifest({ entry: { command: 'python plugin.py' } })],
    ['the wrong entry shape for the runtime', manifest({ entry: { baseUrl: 'http://127.0.0.1' } })],
    ['an unknown key inside entry', manifest({ entry: { command: ['x'], shell: true } })],
    ['a non-URL baseUrl', manifest({ runtime: 'http', entry: { baseUrl: 'nope' } })],
    ['an illegal capability id', manifest({
      capabilities: { 'Bad Id': { description: 'd', consequential: false, input: {}, output: {} } },
    })],
    ['a capability with no consequential flag', manifest({
      capabilities: { x: { description: 'd', input: {}, output: {} } },
    })],
    ['a capability schema using an unsupported keyword', manifest({
      capabilities: {
        x: { description: 'd', consequential: false, output: {}, input: { pattern: '^a$' } },
      },
    })],
    ['an id that is not a domain key', manifest({ id: 'nodot' })],
    ['a version that is not semver', manifest({ version: '1.0' })],
    ['health.path on a non-http runtime', manifest({ health: { path: '/healthz' } })],
    ['an application section on a capability plugin', manifest({
      application: {
        baseUrl: 'http://127.0.0.1', healthPath: '/h', routes: ['/'],
        auth: 'none-local', cors: { allowedOrigins: [] },
      },
    })],
    ['a self-referencing dependency', manifest({ dependencies: { 'text.stats': { required: true } } })],
  ];
  for (const [label, value] of conditional) {
    assert.equal(validateValue(MANIFEST_SCHEMA, value).length, 0,
      `${label}: the shape schema is expected to ACCEPT this - the subset cannot say it`);
    assert.equal(validateUppManifest(value).ok, false,
      `${label}: the JS validator must refuse it`);
  }
});
