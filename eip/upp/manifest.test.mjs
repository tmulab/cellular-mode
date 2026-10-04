// U1 (unknown keys), U2 (identity rules imported), U3 (schema subset only).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITY_ID_PATTERN, KEY_PATTERN, PERMISSIONS, SEMVER_PATTERN,
} from '../sdk/index.mjs';
import {
  UPP_MANIFEST_FIELDS, assertUppManifest, validateUppManifest,
} from './manifest.mjs';
import { AUTH_MODES, RUNTIMES } from './sections.mjs';

/** A minimal legal manifest, as a factory so no test can mutate another's fixture.
 * @param {Record<string, unknown>} [patch] @returns {Record<string, unknown>} */
const manifest = (patch = {}) => ({
  upp: '1.0',
  id: 'text.stats',
  version: '1.0.0',
  description: 'Counts words.',
  type: 'capability',
  runtime: 'process',
  entry: { command: ['python', 'plugin.py'] },
  capabilities: {
    'count-words': {
      description: 'Count words.',
      consequential: false,
      input: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      output: { type: 'object', properties: { words: { type: 'integer' } } },
    },
  },
  ...patch,
});

/** @type {(m: unknown) => string[]} */
const paths = (m) => validateUppManifest(m).errors.map((e) => e.path);
/** @type {(m: unknown) => boolean} */
const ok = (m) => validateUppManifest(m).ok;

test('upp manifest · the minimal legal manifest validates', () => {
  assert.deepEqual(validateUppManifest(manifest()), { ok: true, errors: [] });
  for (const runtime of ['in-process', 'http']) {
    const entry = runtime === 'http' ? { baseUrl: 'http://127.0.0.1:4000' } : { module: './p.mjs' };
    assert.ok(ok(manifest({ runtime, entry })), runtime);
  }
  assert.deepEqual([...RUNTIMES], ['in-process', 'process', 'http']);
});

test('upp manifest · a non-object, and every missing required field, is reported', () => {
  for (const junk of [null, undefined, 'x', 42, [], () => {}]) {
    assert.deepEqual(paths(junk), [''], String(junk));
  }
  const bare = validateUppManifest({});
  assert.equal(bare.ok, false);
  for (const field of ['upp', 'id', 'version', 'description', 'type', 'runtime', 'capabilities']) {
    assert.ok(bare.errors.some((e) => e.path === field), `${field} must be required`);
  }
});

test('upp manifest · U1 an unknown TOP-LEVEL field is rejected', () => {
  assert.deepEqual(paths(manifest({ sdk: '1' })), ['sdk']);
  assert.deepEqual(paths(manifest({ apply: () => {} })), ['apply'],
    'an SDK field is not a UPP field: the two manifests are different contracts');
  assert.equal(UPP_MANIFEST_FIELDS.includes('devUi'), false, 'no markup crosses the wire');
});

test('upp manifest · U1 unknown keys are rejected in entry, permissions, health, lifecycle', () => {
  assert.deepEqual(paths(manifest({ entry: { command: ['x'], shell: true } })), ['entry.shell'],
    'the one key nobody may add');
  assert.deepEqual(paths(manifest({ permissions: ['fs.read', 'net.inbound'] })), ['permissions.1']);
  assert.deepEqual(paths(manifest({ health: { every: 1000 } })), ['health.every']);
  assert.deepEqual(paths(manifest({ lifecycle: { killTimeoutMs: 1 } })), ['lifecycle.killTimeoutMs']);
  assert.deepEqual(paths(manifest({ capabilities: { x: { ...{}, description: 'd', consequential: false, input: {}, output: {}, retries: 3 } } })), ['capabilities.x.retries']);
});

test('upp manifest · U1 `extensions` is the ONE tolerant container', () => {
  assert.ok(ok(manifest({ extensions: { somethingFromAFutureMinor: { deep: [1, 2] } } })));
  assert.deepEqual(paths(manifest({ extensions: 'nope' })), ['extensions']);
});

test('upp manifest · the process entry is an argv ARRAY, never a shell string', () => {
  assert.deepEqual(paths(manifest({ entry: { command: 'python plugin.py' } })), ['entry.command']);
  assert.deepEqual(paths(manifest({ entry: { command: [] } })), ['entry.command']);
  assert.deepEqual(paths(manifest({ entry: { command: ['python', ''] } })), ['entry.command.1']);
  assert.deepEqual(paths(manifest({ entry: { command: ['py\0thon'] } })), ['entry.command.0']);
  assert.deepEqual(paths(manifest({ entry: { baseUrl: 'http://x' } })),
    ['entry.baseUrl', 'entry.command'],
    'the http shape under the process runtime is an unknown key AND a missing command');
});

test('upp manifest · the http entry must be an http(s) URL', () => {
  for (const bad of ['', 'not a url', 'file:///etc/passwd', 'ws://x', 7]) {
    assert.deepEqual(paths(manifest({ runtime: 'http', entry: { baseUrl: bad } })),
      ['entry.baseUrl'], String(bad));
  }
  assert.ok(ok(manifest({ runtime: 'http', entry: { baseUrl: 'https://127.0.0.1:8443/p' } })));
});

test('upp manifest · U2 identity rules are the SDK constants, not a restatement', () => {
  assert.equal(ok(manifest({ id: 'nodot' })), false);
  assert.equal(ok(manifest({ id: 'Text.Stats' })), false);
  assert.ok(KEY_PATTERN.test('text.stats') && !KEY_PATTERN.test('nodot'));
  for (const bad of ['1.0', '1.0.0.0', 'v1.0.0', '01.0.0']) {
    assert.deepEqual(paths(manifest({ version: bad })), ['version'], bad);
  }
  assert.ok(SEMVER_PATTERN.test('1.0.0-rc.1'), 'the SDK accepts a prerelease, so UPP does too');
  assert.ok(ok(manifest({ version: '1.0.0-rc.1' })));
  assert.equal(ok(manifest({ capabilities: { 'Bad Id': { description: 'd', consequential: false, input: {}, output: {} } } })), false);
  assert.ok(CAPABILITY_ID_PATTERN.test('count-words'));
});

test('upp manifest · U3 capability schemas are checked with the SDK subset', () => {
  const withPattern = manifest({
    capabilities: {
      x: {
        description: 'd', consequential: false, output: {},
        input: { type: 'object', properties: { a: { type: 'string', pattern: '^x$' } } },
      },
    },
  });
  assert.deepEqual(paths(withPattern), ['capabilities.x.input.properties.a.pattern']);
  assert.deepEqual(paths(manifest({ config: { type: 'object', $ref: '#/x' } })), ['config.$ref']);
  assert.deepEqual(paths(manifest({ capabilities: { x: { description: 'd', consequential: 'yes', input: {}, output: {} } } })),
    ['capabilities.x.consequential']);
});

test('upp manifest · dependencies are sibling keys with only {required}', () => {
  assert.ok(ok(manifest({ dependencies: { 'text.stats2': { required: true } } })));
  assert.deepEqual(paths(manifest({ dependencies: { nodot: { required: true } } })), ['dependencies.nodot']);
  assert.deepEqual(paths(manifest({ dependencies: { 'text.stats': { required: true } } })),
    ['dependencies.text.stats'], 'a plugin cannot depend on itself');
  assert.deepEqual(paths(manifest({ dependencies: { 'a.b': { required: true, lazy: true } } })),
    ['dependencies.a.b.lazy']);
  assert.deepEqual(paths(manifest({ dependencies: { 'a.b': {} } })), ['dependencies.a.b']);
});

test('upp manifest · permissions come from the SDK closed list', () => {
  assert.ok(ok(manifest({ permissions: [...PERMISSIONS] })));
  assert.deepEqual(paths(manifest({ permissions: ['fs.read', 'fs.read'] })), ['permissions.1']);
  assert.deepEqual(paths(manifest({ permissions: 'fs.read' })), ['permissions']);
});

test('upp manifest · an application manifest needs its section, and nobody else may have one', () => {
  const app = {
    baseUrl: 'http://127.0.0.1:3000', healthPath: '/healthz',
    routes: ['/', '/cells'], auth: 'host-session', cors: { allowedOrigins: [] },
  };
  // `capabilities: {}` is what an application declares — the rule, with its reasons, is
  // cell 5's and lives in `sections.test.mjs` (U30).
  /** @type {(application?: Record<string, unknown>) => Record<string, unknown>} */
  const asApp = (application = app) => manifest({ type: 'application', application, capabilities: {} });
  assert.ok(ok(asApp()));
  assert.deepEqual(paths(manifest({ type: 'application' })), ['capabilities', 'application']);
  assert.deepEqual(paths(manifest({ application: app })), ['application'],
    'a capability plugin declaring an application section is a category error');
  assert.deepEqual(paths(asApp({ ...app, auth: 'public' })), ['application.auth']);
  assert.deepEqual([...AUTH_MODES], ['host-session', 'none-local']);
  assert.deepEqual(paths(asApp({ ...app, cors: { allowedOrigins: ['*'] } })),
    ['application.cors.allowedOrigins.0'], '"*" is never an allowed origin');
  assert.deepEqual(paths(asApp({ ...app, cors: undefined })),
    ['application.cors'], 'an absent cors declaration is not an empty one');
});

test('upp manifest · health.path belongs to the http runtime alone', () => {
  assert.deepEqual(paths(manifest({ health: { path: '/healthz' } })), ['health.path']);
  assert.ok(ok(manifest({ runtime: 'http', entry: { baseUrl: 'http://127.0.0.1' }, health: { path: '/healthz', intervalMs: 1000 } })));
  assert.deepEqual(paths(manifest({ health: { intervalMs: 10 } })), ['health.intervalMs']);
  assert.deepEqual(paths(manifest({ health: { method: 'upp.ping' } })), ['health.method']);
});

test('upp manifest · every breach is reported at once, not one per pass', () => {
  const broken = manifest({ id: 'bad', version: 'x', permissions: ['nope'], entry: { command: 'sh -c x' } });
  assert.deepEqual(paths(broken).sort(), ['entry.command', 'id', 'permissions.0', 'version']);
});

test('upp manifest · the thrown form names every problem, and freezes what it returns', () => {
  assert.throws(() => assertUppManifest(manifest({ id: 'bad' })), /invalid UPP manifest \(1 problem/);
  assert.throws(() => assertUppManifest(null), /manifest must be an object/);
  assert.ok(Object.isFrozen(assertUppManifest(manifest())));
});
