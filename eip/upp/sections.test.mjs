// U30 — an application manifest validates as its OWN type, and nothing looser.
//
// The rules under test are the ones a reviewer cannot check by reading: a `healthPath` that
// starts with "/" and is still not a path (`//evil.example` is scheme-relative and names
// another host), an "origin" that carries a path, a credential or a query, and an application
// that quietly declares in-process capabilities it cannot have.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateUppManifest } from './manifest.mjs';
import { AUTH_MODES, isExactOrigin, isRelativePath } from './sections.mjs';

const APPLICATION = Object.freeze({
  baseUrl: 'http://127.0.0.1:3000',
  healthPath: '/healthz',
  routes: ['/', '/cells'],
  auth: 'host-session',
  cors: { allowedOrigins: [] },
});

/** @type {(over?: Record<string, unknown>, patch?: Record<string, unknown>) => Record<string, unknown>} */
const app = (over = {}, patch = {}) => ({
  upp: '1.0',
  id: 'observer.ui',
  version: '1.0.0',
  description: 'An independently executed interface.',
  type: 'application',
  runtime: 'http',
  entry: { baseUrl: 'http://127.0.0.1:3000' },
  capabilities: {},
  application: { ...APPLICATION, ...over },
  ...patch,
});

/** @type {(m: unknown) => string[]} */
const paths = (m) => validateUppManifest(m).errors.map((e) => e.path);
/** @type {(m: unknown) => boolean} */
const ok = (m) => validateUppManifest(m).ok;

test('upp sections · U30 the application manifest of a real app validates', () => {
  assert.deepEqual(validateUppManifest(app()), { ok: true, errors: [] });
  assert.deepEqual([...AUTH_MODES], ['host-session', 'none-local']);
});

test('upp sections · U30 healthPath must be a RELATIVE path, not a URL wearing a slash', () => {
  for (const healthPath of ['//evil.example/healthz', 'healthz', '/healthz?v=1', '/h#f',
    'http://evil.example/h', '\\h', '/a\\b', '/', '']) {
    assert.deepEqual(paths(app({ healthPath })), ['application.healthPath'], JSON.stringify(healthPath));
  }
  assert.ok(ok(app({ healthPath: '/api/healthz' })));
  assert.equal(isRelativePath('//evil.example'), false);
  assert.equal(isRelativePath('/healthz'), true);
});

test('upp sections · U30 a route is a path too, by the same rule', () => {
  assert.deepEqual(paths(app({ routes: ['//evil.example'] })), ['application.routes.0']);
  assert.deepEqual(paths(app({ routes: ['/ok', 'relative'] })), ['application.routes.1']);
  assert.ok(ok(app({ routes: ['/'] })), 'the site root IS a legal route');
  assert.deepEqual(paths(app({ routes: [] })), ['application.routes']);
});

test('upp sections · U30 allowedOrigins are EXACT origins: no path, no credentials, no "*"', () => {
  for (const origin of ['*', 'http://app.example/path', 'http://app.example/',
    'http://user:pw@localhost', 'http://app.example?q=1', 'ftp://app.example', 'app.example']) {
    assert.deepEqual(paths(app({ cors: { allowedOrigins: [origin] } })),
      ['application.cors.allowedOrigins.0'], origin);
  }
  assert.ok(ok(app({ cors: { allowedOrigins: ['https://app.example', 'http://localhost:3000'] } })));
  assert.equal(isExactOrigin('https://app.example'), true);
  assert.equal(isExactOrigin('https://app.example/'), false);
  assert.deepEqual(paths(app({ cors: { allowedOrigins: 'https://app.example' } })),
    ['application.cors.allowedOrigins'], 'a string is not a list of origins');
});

test('upp sections · U30 an application declares NO in-process capabilities', () => {
  // Identity is not execution: an app that also provides capabilities ships a SECOND,
  // ordinary capability manifest. An empty object is the honest declaration here, and it is
  // legal for this type alone — for a capability plugin it stays a breach.
  assert.ok(ok(app()));
  assert.deepEqual(paths(app({}, {
    capabilities: { 'do-it': { description: 'd', consequential: false, input: {}, output: {} } },
  })), ['capabilities']);
  assert.deepEqual(paths(app({}, { type: 'capability', application: undefined, capabilities: {} })),
    ['capabilities']);
});
