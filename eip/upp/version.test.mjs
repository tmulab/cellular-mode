// U4 · version negotiation fails closed. The criterion is in docs/upp/ACCEPTANCE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOCOL_VERSION_PATTERN, SUPPORTED_PROTOCOL_VERSIONS, UPP_VERSION,
  compareProtocolVersions, negotiate, parseProtocolVersion,
} from './version.mjs';

test('upp version · this implementation declares exactly one protocol version', () => {
  assert.equal(UPP_VERSION, '1.0');
  assert.deepEqual([...SUPPORTED_PROTOCOL_VERSIONS], ['1.0']);
  assert.ok(Object.isFrozen(SUPPORTED_PROTOCOL_VERSIONS));
});

test('upp version · a version is MAJOR.MINOR, and never a number', () => {
  for (const good of ['1.0', '1.10', '0.1', '2.0', '10.3']) {
    assert.ok(PROTOCOL_VERSION_PATTERN.test(good), good);
    assert.notEqual(parseProtocolVersion(good), null, good);
  }
  for (const bad of ['1', '1.0.0', '01.0', '1.01', '1.0-rc1', 'v1.0', '', ' 1.0', '1.0 ', 1.0]) {
    assert.equal(parseProtocolVersion(/** @type {string} */ (bad)), null, String(bad));
  }
  assert.deepEqual(parseProtocolVersion('1.10'), { major: 1, minor: 10 });
});

test('upp version · ordering is numeric per component, so 1.10 is newer than 1.9', () => {
  assert.ok(compareProtocolVersions('1.10', '1.9') > 0, 'the whole reason it is not a float');
  assert.ok(compareProtocolVersions('1.0', '2.0') < 0);
  assert.equal(compareProtocolVersions('1.0', '1.0'), 0);
  assert.deepEqual(['1.0', '1.10', '1.2'].sort(compareProtocolVersions), ['1.0', '1.2', '1.10']);
});

test('upp version · the host order is the preference order', () => {
  assert.deepEqual(negotiate(['1.1', '1.0'], ['1.0', '1.1']), { ok: true, version: '1.1' });
  assert.deepEqual(negotiate(['1.0', '1.1'], ['1.1', '1.0']), { ok: true, version: '1.0' },
    'the plugin picks from the HOST list; the host states its own preference first');
});

test('upp version · MINOR is additive: an older host and a newer plugin still meet', () => {
  assert.deepEqual(negotiate(['1.0'], ['1.2', '1.1', '1.0']), { ok: true, version: '1.0' });
  assert.deepEqual(negotiate(['1.3', '1.0'], ['1.0']), { ok: true, version: '1.0' });
});

test('upp version · a MAJOR mismatch rejects with -32002, and names both lists', () => {
  const outcome = negotiate(['1.0'], ['2.0']);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.code, -32002);
  assert.equal(outcome.error.data.code, 'CONTRACT_INVALID');
  assert.match(outcome.error.message, /1\.0/);
  assert.match(outcome.error.message, /2\.0/);
  assert.deepEqual(outcome.error.data.details?.map((d) => d.path), ['protocolVersions']);
});

test('upp version · a shared MAJOR with no shared version still rejects — no guessing', () => {
  const outcome = negotiate(['1.4'], ['1.2']);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.code, -32002,
    'a host must never be handed a MINOR it did not offer, even within its own MAJOR');
});

test('upp version · malformed input is -32602, with the offending path', () => {
  /** @type {Array<[unknown, unknown, string]>} */
  const cases = [
    [[], ['1.0'], 'hostSupported'],
    [['1.0'], [], 'pluginOffered'],
    ['1.0', ['1.0'], 'hostSupported'],
    [['1.0'], '1.0', 'pluginOffered'],
    [['1.0', '1'], ['1.0'], 'hostSupported.1'],
    [['1.0'], ['1.0', 'nope'], 'pluginOffered.1'],
    [[null], ['1.0'], 'hostSupported.0'],
  ];
  for (const [host, plugin, path] of cases) {
    const outcome = negotiate(
      /** @type {string[]} */ (host), /** @type {string[]} */ (plugin),
    );
    assert.equal(outcome.ok, false, `${JSON.stringify(host)} / ${JSON.stringify(plugin)}`);
    if (outcome.ok) continue;
    assert.equal(outcome.error.code, -32602, path);
    assert.equal(outcome.error.data.details?.[0]?.path, path);
  }
});

test('upp version · the outcome is frozen: a negotiated version cannot be edited later', () => {
  const outcome = negotiate(['1.0'], ['1.0']);
  assert.ok(Object.isFrozen(outcome));
});
