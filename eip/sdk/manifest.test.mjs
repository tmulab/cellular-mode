// Contract before code: this file is the written form of "what a plugin may
// declare". Every refusal below is a composition error that can no longer reach
// runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, describeManifest, validateManifest } from './manifest.mjs';

/** The single capability the reference manifest declares, named so the tests that
 * bend one of its fields can start from the same object instead of re-deriving it. */
const appendCapability = {
  description: 'Append one entry.',
  consequential: true,
  input: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] },
  output: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
};

/**
 * A realistic, minimal, LEGAL manifest. Each test bends exactly one field.
 * @param {Record<string, unknown>} [patch] @returns {Record<string, unknown>}
 */
function ledgerManifest(patch = {}) {
  return {
    name: 'ledger.entries',
    version: '1.0.0',
    sdk: '1',
    description: 'Append-only accounting entries.',
    inject: { 'metrics.collector': { required: false } },
    permissions: ['fs.write'],
    config: { type: 'object', properties: { book: { type: 'string' } }, required: ['book'], additionalProperties: false },
    capabilities: { append: { ...appendCapability } },
    apply: () => ({ append: () => ({ id: 'e1' }) }),
    ...patch,
  };
}

/** @type {(m: unknown) => string[]} */
const paths = (m) => validateManifest(m).errors.map((e) => e.path).sort();

test('manifest · the reference manifest is accepted', () => {
  assert.deepEqual(validateManifest(ledgerManifest()), { ok: true, errors: [] });
});

test('manifest · the key must be domain.capability-key', () => {
  for (const name of ['ledger', 'Ledger.Entries', 'ledger.', '.entries', 'ledger.entries.x', '1edger.e']) {
    assert.deepEqual(paths(ledgerManifest({ name })), ['name'], `accepted ${name}`);
  }
  assert.deepEqual(validateManifest(ledgerManifest({ name: 'ledger.entries-v2' })).ok, true);
});

test('manifest · the version must be semver and the sdk must match', () => {
  assert.deepEqual(paths(ledgerManifest({ version: '1.0' })), ['version']);
  assert.deepEqual(paths(ledgerManifest({ version: 'v1.0.0' })), ['version']);
  assert.equal(validateManifest(ledgerManifest({ version: '1.0.0-rc.1' })).ok, true);
  assert.deepEqual(paths(ledgerManifest({ sdk: '2' })), ['sdk']);
  assert.deepEqual(paths(ledgerManifest({ sdk: 1 })), ['sdk']);
});

test('manifest · inject is a map of sibling keys to {required: boolean}', () => {
  assert.deepEqual(paths(ledgerManifest({ inject: { 'metrics.collector': {} } })), ['inject.metrics.collector']);
  assert.deepEqual(paths(ledgerManifest({ inject: { 'metrics.collector': true } })), ['inject.metrics.collector']);
  assert.deepEqual(paths(ledgerManifest({ inject: ['metrics.collector'] })), ['inject']);
  assert.deepEqual(paths(ledgerManifest({ inject: { metrics: { required: true } } })), ['inject.metrics']);
  // A plugin injecting itself is a cycle of length one, refused in the contract.
  assert.deepEqual(paths(ledgerManifest({ inject: { 'ledger.entries': { required: true } } })), ['inject.ledger.entries']);
  // No room for smuggling extra wiring semantics into an inject entry.
  assert.deepEqual(
    paths(ledgerManifest({ inject: { 'metrics.collector': { required: true, eager: true } } })),
    ['inject.metrics.collector.eager'],
  );
});

test('manifest · permissions come from the closed list, without duplicates', () => {
  assert.deepEqual(paths(ledgerManifest({ permissions: ['fs.append'] })), ['permissions.0']);
  assert.deepEqual(paths(ledgerManifest({ permissions: ['fs.write', 'fs.write'] })), ['permissions.1']);
  assert.deepEqual(paths(ledgerManifest({ permissions: 'fs.write' })), ['permissions']);
  assert.equal(validateManifest(ledgerManifest({ permissions: PERMISSIONS.slice() })).ok, true);
});

test('manifest · a capability declares both schemas, consequential and a description', () => {
  /** @type {(patch: Record<string, unknown>) => Record<string, unknown>} */
  const cap = (patch) => ledgerManifest({ capabilities: { append: { ...appendCapability, ...patch } } });
  assert.deepEqual(paths(cap({ consequential: undefined })), ['capabilities.append.consequential']);
  assert.deepEqual(paths(cap({ consequential: 'yes' })), ['capabilities.append.consequential']);
  assert.deepEqual(paths(cap({ input: undefined })), ['capabilities.append.input']);
  assert.deepEqual(paths(cap({ output: undefined })), ['capabilities.append.output']);
  assert.deepEqual(paths(cap({ description: ' ' })), ['capabilities.append.description']);
  assert.deepEqual(paths(cap({ output: { type: 'object', pattern: 'x' } })), ['capabilities.append.output.pattern']);
  assert.deepEqual(paths(ledgerManifest({ capabilities: {} })), ['capabilities']);
  assert.deepEqual(paths(ledgerManifest({ capabilities: { Append: appendCapability } })), ['capabilities.Append']);
});

test('manifest · apply must be a function and config must be a legal schema', () => {
  assert.deepEqual(paths(ledgerManifest({ apply: undefined })), ['apply']);
  assert.deepEqual(paths(ledgerManifest({ apply: {} })), ['apply']);
  assert.deepEqual(paths(ledgerManifest({ config: { type: 'object', pattern: 'x' } })), ['config.pattern']);
});

test('manifest · devUi is optional, titled, and bounded at 64KB', () => {
  assert.equal(validateManifest(ledgerManifest({ devUi: { title: 'Ledger', html: '<p>ok</p>' } })).ok, true);
  assert.deepEqual(paths(ledgerManifest({ devUi: { html: '<p/>' } })), ['devUi.title']);
  assert.deepEqual(paths(ledgerManifest({ devUi: { title: 'Ledger' } })), ['devUi.html']);
  const big = { title: 'Ledger', html: 'x'.repeat(64 * 1024 + 1) };
  assert.deepEqual(paths(ledgerManifest({ devUi: big })), ['devUi.html']);
});

test('manifest · an unknown top-level field is refused, not ignored', () => {
  assert.deepEqual(paths(ledgerManifest({ provides: ['ledger.entries'] })), ['provides']);
  assert.deepEqual(validateManifest('ledger.entries').errors, [{ path: '', message: 'manifest must be an object' }]);
});

test('manifest · every breach is reported at once, not one per run', () => {
  const { errors } = validateManifest({ name: 'bad', version: 'x', sdk: '9' });
  assert.ok(errors.length >= 6, `expected a full report, got ${errors.length}`);
});

test('describeManifest · exposes metadata and hides apply and the dev-UI body', () => {
  const described = describeManifest(/** @type {import('./types.mjs').Manifest} */ (
    ledgerManifest({ devUi: { title: 'Ledger', html: '<p>secret</p>' } })));
  // The field is not merely undefined: it is absent, which is the stronger claim.
  assert.equal(Object.hasOwn(described, 'apply'), false);
  assert.deepEqual(described.devUi, { title: 'Ledger' });
  assert.equal(JSON.stringify(described).includes('secret'), false);
  assert.deepEqual(described.inject, { 'metrics.collector': { required: false } });
  assert.deepEqual(Object.keys(described.capabilities), ['append']);
  assert.equal(described.capabilities.append?.consequential, true);
});
