// The launcher's pure parts, and the one thing the composition adapter promises while the
// backend plugin's host option is still landing: a legible refusal rather than a stack.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { USAGE, parseArgs, startupReport } from '../cli.mjs';
import { ADVISOR_PLUGIN, AUDIT_PLUGIN, missingPlugin } from '../host-adapter.mjs';

describe('the launcher refuses what it does not understand', () => {
  test('a root is required unless the interface is being reviewed against fixtures', () => {
    assert.throws(() => parseArgs([]), /--root <dir> is required/);
    assert.deepEqual(parseArgs(['--fixture']), { root: null, port: 3200, advisor: null, fixture: true, help: false });
    assert.deepEqual(parseArgs(['--root', '.']), { root: '.', port: 3200, advisor: null, fixture: false, help: false });
  });

  test('a typo is an error, never a silently different run', () => {
    assert.throws(() => parseArgs(['--root', '.', '--fixtur']), /unknown argument "--fixtur"/);
    assert.throws(() => parseArgs(['--root']), /--root needs a value/);
    assert.throws(() => parseArgs(['--root', '.', '--port']), /--port needs a value/);
  });

  test('the port is validated, including the two ends of the range', () => {
    assert.equal(parseArgs(['--root', '.', '--port', '0']).port, 0);
    assert.equal(parseArgs(['--root', '.', '--port', '65535']).port, 65535);
    for (const value of ['-1', '65536', 'abc', '3.5']) {
      assert.throws(() => parseArgs(['--root', '.', '--port', value]), /--port must be 0\.\.65535/);
    }
  });

  test('--help is answered before anything is started', () => {
    assert.equal(parseArgs(['--help']).help, true);
    assert.match(USAGE, /--root <dir>/);
    assert.match(USAGE, /binds 127\.0\.0\.1 and has no option to bind anything else/);
  });

  test('the advisor is loaded only when asked for', () => {
    assert.equal(parseArgs(['--root', '.']).advisor, null);
    assert.equal(parseArgs(['--root', '.', '--advisor', 'fixture']).advisor, 'fixture');
  });
});

describe('the launcher says what it is actually doing', () => {
  test('fixture mode never claims to be reading a vault', () => {
    const report = startupReport({ url: 'http://127.0.0.1:3200', assetCount: 24, fixture: true, root: null, keys: [] });
    assert.match(report, /\?source=fixture/);
    assert.match(report, /RECORDED FIXTURES — no vault is being read/);
    assert.doesNotMatch(report, /vault: /);
  });

  test('live mode names the vault and the capabilities it composed', () => {
    const report = startupReport({
      url: 'http://127.0.0.1:3200', assetCount: 24, fixture: false, root: '.', keys: ['observer.state'],
    });
    assert.match(report, /capabilities: observer\.state/);
    assert.match(report, /serving 24 allowlisted files, and nothing else/);
    assert.match(report, /Ctrl\+C stops the app and the host/);
  });
});

describe('the composition adapter is one function over the host wiring', () => {
  test('a missing optional plugin is explained, with the way forward in the same sentence', () => {
    const error = missingPlugin(ADVISOR_PLUGIN, new Error('Cannot find module'));
    assert.match(error.message, /is not available in this checkout/);
    assert.match(error.message, /--fixture/);
    assert.match(error.message, /Cannot find module/);
  });

  test('the two later-cell plugin specifiers are declared in one place', () => {
    assert.equal(AUDIT_PLUGIN, '../../eip/plugins/observer-audit/index.mjs');
    assert.equal(ADVISOR_PLUGIN, '../../eip/plugins/observer-advisor/index.mjs');
  });

  test('the adapter uses the host composition and creates no write port at all', () => {
    const text = readFileSync(new URL('../host-adapter.mjs', import.meta.url), 'utf8');
    assert.match(text, /observerComposition/, 'the host owns the wiring, not this file');
    assert.doesNotMatch(text, /writeFile|createWritePort|reportsDir:/,
      'the observer must not be able to write');
    assert.match(text, /no write port is created at all/);
  });

  test('the default plugin list is the host’s, so the two cannot drift apart', async () => {
    const { OBSERVER_PLUGINS } = await import('../../../eip/host/observer-composition.mjs');
    assert.deepEqual(OBSERVER_PLUGINS.map((manifest) => manifest.name), ['observer.state']);
  });
});
