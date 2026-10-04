// The operator's authorisation file, and the pin that makes it mean something.
//
// U12 (env), U22 (an id absent from the file), U23 (the manifest pin) and the loopback half
// of U25 are decided here, before a process exists. That is the whole reason these are pure
// functions: a refusal that only happens after a spawn is not a refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { canonicalJson, digestsMatch, manifestDigest, sha256Hex } from './canonical.mjs';
import { DEFAULT_TIMEOUTS, isLoopbackUrl, timeoutsOf, validateUppConfig } from './config.mjs';
import { endpointOf } from './http-transport.mjs';
import { minimalEnv } from './operator.mjs';
import { FIXTURE_DIGEST, FIXTURE_ID, withOperatorConfig } from './fixtures/harness.mjs';

/** @type {(errors: ReadonlyArray<{ path: string }>) => string[]} */
const paths = (errors) => errors.map((e) => e.path);
/** @type {(over?: Record<string, unknown>) => Record<string, unknown>} */
const entry = (over = {}) => ({
  id: 'text.stats', runtime: 'process', command: ['node', 'plugin.mjs'],
  manifestPath: 'manifest.json', manifestSha256: 'a'.repeat(64), allowNetwork: false, ...over,
});
/** @type {(plugins: Array<Record<string, unknown>>) => { ok: boolean, errors: Array<{ path: string, message: string }> }} */
const check = (plugins) => validateUppConfig({ upp: '1.0', plugins });

test('canonical JSON · key order and whitespace do not change the digest', () => {
  const a = { b: 1, a: [1, 2], c: { y: true, x: null } };
  const b = { c: { x: null, y: true }, a: [1, 2], b: 1 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(manifestDigest(a), manifestDigest(b));
  assert.equal(manifestDigest({ a: [2, 1] }) === manifestDigest({ a: [1, 2] }), false,
    'array ORDER is meaning, not formatting');
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(digestsMatch('AB', 'ab'), true);
  assert.equal(digestsMatch('ab', 'abc'), false);
  assert.throws(() => canonicalJson({ n: Number.NaN }), TypeError);
});

test('config · a minimal process authorisation is accepted, and defaults are declared', () => {
  const verdict = check([entry()]);
  assert.deepEqual(verdict.errors, []);
  assert.equal(verdict.ok, true);
  assert.deepEqual(timeoutsOf({}), DEFAULT_TIMEOUTS);
  assert.equal(timeoutsOf({ timeouts: { requestMs: 25 } }).requestMs, 25);
});

test('config · a command must be argv, never a shell string', () => {
  assert.deepEqual(paths(check([entry({ command: 'node plugin.mjs && rm -rf /' })]).errors),
    ['plugins.0.command']);
  assert.deepEqual(paths(check([entry({ command: [] })]).errors), ['plugins.0.command']);
  assert.deepEqual(paths(check([entry({ command: ['node', 'a\u0000b'] })]).errors), ['plugins.0.command']);
});

test('config · env is a list of NAMES, never a map of values', () => {
  assert.deepEqual(paths(check([entry({ env: { SECRET: 'hunter2' } })]).errors), ['plugins.0.env']);
  assert.deepEqual(paths(check([entry({ env: ['A=B'] })]).errors), ['plugins.0.env.0']);
  assert.deepEqual(check([entry({ env: ['LANG', 'TZ'] })]).errors, []);
});

test('config · unknown keys, a bad pin and a duplicate id are each a breach', () => {
  assert.deepEqual(paths(check([entry({ sandbox: true })]).errors), ['plugins.0.sandbox']);
  assert.deepEqual(paths(check([entry({ manifestSha256: 'abc' })]).errors), ['plugins.0.manifestSha256']);
  assert.deepEqual(paths(check([entry(), entry()]).errors), ['plugins.1.id']);
  assert.deepEqual(paths(validateUppConfig({ upp: '2.0', plugins: [] }).errors), ['upp']);
  assert.deepEqual(paths(validateUppConfig({ upp: '1.0' }).errors), ['plugins']);
});

test('config · allowNetwork:true is refused, because the host cannot enforce it', () => {
  const verdict = check([entry({ allowNetwork: true })]);
  assert.deepEqual(paths(verdict.errors), ['plugins.0.allowNetwork']);
  assert.match(verdict.errors[0]?.message ?? '', /NOT IMPLEMENTED/);
  assert.deepEqual(paths(check([entry({ allowNetwork: undefined })]).errors), ['plugins.0.allowNetwork']);
});

test('config · an http authorisation is loopback unless the operator says otherwise', () => {
  const http = (/** @type {Record<string, unknown>} */ over) => check([
    { id: 'svc.one', runtime: 'http', manifestPath: 'm.json', manifestSha256: 'b'.repeat(64), allowNetwork: false, ...over },
  ]);
  assert.deepEqual(http({ baseUrl: 'http://127.0.0.1:7777' }).errors, []);
  assert.deepEqual(http({ baseUrl: 'http://localhost:7777' }).errors, []);
  assert.deepEqual(paths(http({ baseUrl: 'https://plugins.example.com' }).errors),
    ['plugins.0.allowRemote', 'plugins.0.bearerTokenEnv']);
  assert.deepEqual(http({ baseUrl: 'https://plugins.example.com', allowRemote: true, bearerTokenEnv: 'UPP_TOKEN' }).errors, []);
  assert.deepEqual(paths(http({ baseUrl: 'ftp://127.0.0.1' }).errors), ['plugins.0.baseUrl']);
  assert.deepEqual(paths(http({ baseUrl: 'http://127.0.0.1', command: ['node'] }).errors), ['plugins.0.command']);
  assert.equal(isLoopbackUrl('http://10.0.0.5'), false);
  assert.equal(isLoopbackUrl('not a url'), false);
});

test('endpoint · a non-loopback baseUrl needs allowRemote and a token NAME, never a token', () => {
  const remote = { id: 'svc.one', baseUrl: 'https://plugins.example.com' };
  const refused = endpointOf(remote, {});
  assert.equal(refused.ok, false);
  assert.equal(!refused.ok && refused.error.code, -32010);

  const noToken = endpointOf({ ...remote, allowRemote: true, bearerTokenEnv: 'UPP_TOKEN' }, {});
  assert.equal(noToken.ok, false);
  assert.match(!noToken.ok ? noToken.error.message : '', /holds no token/);
  assert.equal(JSON.stringify(noToken).includes('UPP_TOKEN'), true, 'the NAME is reportable');

  const allowed = endpointOf({ ...remote, allowRemote: true, bearerTokenEnv: 'UPP_TOKEN' }, { UPP_TOKEN: 's3cret' });
  assert.equal(allowed.ok && allowed.url, 'https://plugins.example.com/upp');
  assert.equal(allowed.ok && allowed.headers.authorization, 'Bearer s3cret');
  assert.equal(JSON.stringify(endpointOf(remote, { UPP_TOKEN: 's3cret' })).includes('s3cret'), false,
    'a refusal never carries the token VALUE');
  const local = endpointOf({ id: 'svc.one', baseUrl: 'http://127.0.0.1:8080' }, {});
  assert.equal(local.ok && local.headers.authorization, undefined);
});

test('minimalEnv · a host variable the operator did not name is not in the child env', () => {
  const source = { PATH: '/usr/bin', SystemRoot: 'C:\\Windows', UPP_TEST_CANARY: 'leaked', LANG: 'en_GB' };
  const env = minimalEnv(['LANG'], source);
  assert.equal('UPP_TEST_CANARY' in env, false, 'nothing is inherited that was not named');
  assert.equal(env.LANG, 'en_GB');
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(minimalEnv([], source).LANG, undefined);
});

test('operator · the id must be listed, and the manifest must match its pin', async () => {
  const harness = await withOperatorConfig();
  try {
    const authorized = await harness.authorize();
    assert.equal(authorized.ok, true);
    assert.equal(authorized.ok && authorized.value.digest, FIXTURE_DIGEST);

    const unlisted = await harness.authorize('text.nobody');
    assert.equal(unlisted.ok, false);
    assert.equal(!unlisted.ok && unlisted.error.code, -32010);
    assert.equal(!unlisted.ok && unlisted.error.data.code, 'PERMISSION_DENIED');
  } finally {
    await harness.cleanup();
  }
});

test('operator · a pin mismatch is refused and nothing is authorised', async () => {
  const harness = await withOperatorConfig({ entry: { manifestSha256: 'f'.repeat(64) } });
  try {
    const authorized = await harness.authorize();
    assert.equal(authorized.ok, false);
    assert.match(!authorized.ok ? authorized.error.message : '', /does not match its pin/);
    assert.deepEqual(!authorized.ok ? authorized.error.data.details?.map((d) => d.path) : [], ['manifestSha256']);
  } finally {
    await harness.cleanup();
  }
});

test('operator · an unreadable or invalid config is a structured refusal, never a throw', async () => {
  const harness = await withOperatorConfig();
  try {
    await writeFile(harness.configPath, '{ not json', 'utf8');
    const broken = await harness.load();
    assert.equal(broken.ok, false);
    assert.equal(!broken.ok && broken.error.code, -32700);

    await writeFile(harness.configPath, JSON.stringify({ upp: '1.0', plugins: [{ id: FIXTURE_ID }] }), 'utf8');
    const invalid = await harness.load();
    assert.equal(invalid.ok, false);
    assert.equal(!invalid.ok && invalid.error.code, -32602);
  } finally {
    await harness.cleanup();
  }
});
