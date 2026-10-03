// D23 — an intentionally disabled advisor is a configuration fact, not a diagnostic.
//
// Written BEFORE the fix. The area used to probe `observer.advisor` unconditionally and
// render the host's own `404 NOT_FOUND` under the disabled sentence, so the default,
// correct, documented configuration looked like a broken one. The host already publishes
// the answer: `health.plugins` is the honest list of what is loaded. A key that is NOT in
// that list was never meant to answer; a key that IS in it and still refuses has really
// failed, and that error must keep its box.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DISABLED_NOTICE } from '../view/advisor-view.mjs';
import { pluginKeys, presenceOf } from '../view/availability.mjs';
import { advisorAreaState } from '../view/advisor-presence.mjs';

const read = (/** @type {string} */ rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const HEALTH = { ok: true, value: { status: 'ok', sdk: '1', devUi: false, plugins: ['observer.audit', 'observer.state'] } };
const WITH_ADVISOR = { ok: true, value: { plugins: ['observer.audit', 'observer.state', 'observer.advisor'] } };

describe('D23 · the plugin list is read, and an unreadable list is UNKNOWN', () => {
  test('the keys come out of the health envelope, flat or wrapped', () => {
    assert.deepEqual(pluginKeys(HEALTH), ['observer.audit', 'observer.state']);
    assert.deepEqual(pluginKeys(HEALTH.value), ['observer.audit', 'observer.state']);
  });

  test('an answer that carries no list is null — never an empty list', () => {
    for (const payload of [null, undefined, {}, { value: {} }, { ok: false, error: { code: 'UPSTREAM_UNAVAILABLE' } }, 'nope', { value: { plugins: 'two' } }]) {
      assert.equal(pluginKeys(payload), null, `${JSON.stringify(payload)} states nothing about the build`);
    }
    // Non-string entries are dropped rather than trusted.
    assert.deepEqual(pluginKeys({ plugins: ['observer.state', 7, null] }), ['observer.state']);
  });

  test('presence is a three-way answer, because "could not read" is not "absent"', () => {
    assert.equal(presenceOf(pluginKeys(HEALTH), 'observer.advisor'), 'not-listed');
    assert.equal(presenceOf(pluginKeys(WITH_ADVISOR), 'observer.advisor'), 'listed');
    assert.equal(presenceOf(null, 'observer.advisor'), 'unknown');
  });
});

describe('D23 · what the area does with each of the three worlds', () => {
  test('(a) not listed: the neutral disabled state, no call, and NO error text', () => {
    const state = advisorAreaState('not-listed');
    assert.equal(state.probe, false, 'a capability the host does not list is not called');
    assert.equal(state.showError, false, 'there is no failure to report');
    assert.equal(state.enabled, false);
    // Its own state, so the stylesheet can render an intentional choice neutrally while a
    // listed plugin that really failed ('absent' below) keeps the alerting colour.
    assert.equal(state.state, 'disabled');
    assert.equal(state.text, DISABLED_NOTICE, 'the whole message, with no diagnostic appended');
    assert.doesNotMatch(state.text, /NOT_FOUND|not installed|404|error/i);
  });

  test('(b) listed and refusing: the real error is shown, exactly as before', () => {
    const state = advisorAreaState('listed', { ok: false, error: { code: 'NOT_FOUND', message: 'no such capability' } });
    assert.equal(state.probe, true);
    assert.equal(state.showError, true, 'a listed plugin that answers NOT_FOUND has really failed');
    assert.ok(state.text.startsWith(DISABLED_NOTICE));
    assert.match(state.text, /the plugin is not installed/);
    assert.equal(state.state, 'absent');
    const down = advisorAreaState('unknown', { ok: false, error: { code: 'UPSTREAM_UNAVAILABLE' } });
    assert.equal(down.showError, true);
    assert.equal(down.state, 'unknown');
    assert.match(down.text, /host is not answering/);
  });

  test('(c) listed and answering: the area works, enabled, with no notice', () => {
    const state = advisorAreaState('listed', { ok: true });
    assert.equal(state.enabled, true);
    assert.equal(state.showError, false);
    assert.equal(state.state, 'available');
    assert.equal(state.text, '');
  });

  test('before the probe answers the area is enabled by nothing and says it is checking', () => {
    const waiting = advisorAreaState('listed');
    assert.equal(waiting.probe, true);
    assert.equal(waiting.enabled, false);
    assert.equal(waiting.showError, false);
    assert.match(waiting.text, /checking/i);
  });
});

describe('D23 · the page actually asks the host what is loaded', () => {
  test('the data client reads the plugin list from the health endpoint', () => {
    const client = read('web/data-client.mjs');
    assert.match(client, /\/api\/v1\/health/, 'the list comes from the host, not from a guess');
    assert.match(client, /export (async )?function fetchPlugins/);
  });

  test('the advisor area is given the list and skips the probe when it is not listed', () => {
    const main = read('web/main.mjs');
    assert.match(main, /fetchPlugins/);
    assert.match(main, /plugins/);
    const area = read('web/advisor-area.mjs');
    assert.match(area, /advisorAreaState/);
    // The guard has to come BEFORE the call, or the 404 is already in the network log.
    const guard = area.indexOf('advisorAreaState');
    const call = area.indexOf("client.call('status')");
    assert.ok(guard !== -1 && call !== -1 && guard < call, 'the decision precedes the call');
  });
});

test('D23 · the intentional disabled state is styled neutrally, unlike a real failure', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../web/app.css', import.meta.url), 'utf8');
  /** @type {(name: string) => string} */
  const rule = (name) => css.match(new RegExp(String.raw`\.probe-${name}\s*\{([^}]*)\}`))?.[1] ?? '';
  assert.match(rule('disabled'), /color:\s*var\(--secondary\)/, 'disabled reads as neutral text');
  assert.doesNotMatch(rule('disabled'), /--status-/, 'no status hue on a configuration choice');
  assert.match(rule('absent'), /--status-paused/, 'a real failure keeps the alerting colour');
});
