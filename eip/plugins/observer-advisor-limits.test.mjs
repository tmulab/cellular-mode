// V18..V21 - the limits, and the one thing that must never happen: a call nobody asked for.
//
// A model call costs money and attention, so the budget is not a nicety: it is what keeps an
// advisor an optional second opinion instead of a service. Each test below asserts the exact
// refusal code AND that the adapter was never reached, because a limit that is checked after
// the call is a limit on nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { errorOf, valueOf } from '../kernel/assertions.mjs';
import { HOSTILE, cannedAdapter, loadAdvisor } from './observer-advisor-fixture.mjs';

test('V18 the call budget refuses before the adapter is reached', async () => {
  let asked = 0;
  const counted = cannedAdapter(() => { asked += 1; return HOSTILE.flood; }, { id: 'counted' });
  const a = await loadAdvisor({ adapter: counted, limits: { maxCallsPerSession: 1, minIntervalMs: 0 } });
  try {
    assert.ok(valueOf(await a.call('advise')));
    assert.equal(asked, 1);
    const error = errorOf(await a.call('advise'));
    assert.equal(error.code, 'INPUT_INVALID');
    assert.equal(error.details?.[0]?.path, 'limits.maxCallsPerSession');
    assert.equal(asked, 1, 'the adapter must not be called by a refused call');
    assert.deepEqual(valueOf(await a.call('status'))['calls'], { used: 1, remaining: 0 });
  } finally {
    await a.cleanup();
  }
});

test('V18 the minimum interval is enforced, and status costs nothing', async () => {
  let clock = 10000;
  const a = await loadAdvisor({ limits: { minIntervalMs: 2000 }, now: () => clock });
  try {
    assert.ok(valueOf(await a.call('advise')));
    const error = errorOf(await a.call('advise'));
    assert.equal(error.code, 'INPUT_INVALID');
    assert.equal(error.details?.[0]?.path, 'limits.minIntervalMs');
    assert.match(error.message, /one call every 2000 ms/);
    // A refused call consumed nothing, and `status` never consumes anything.
    for (let i = 0; i < 3; i += 1) await a.call('status');
    assert.deepEqual(valueOf(await a.call('status'))['calls'], { used: 1, remaining: 19 });
    clock += 2000;
    assert.ok(valueOf(await a.call('advise')));
  } finally {
    await a.cleanup();
  }
});

test('V19 a long question, an unknown mode and an extra property are all INPUT_INVALID', async () => {
  const a = await loadAdvisor();
  try {
    for (const [input, path] of /** @type {Array<[object, string]>} */ ([
      [{ question: 'x'.repeat(501) }, 'question'],
      [{ mode: 'continuous' }, 'mode'],
      [{ unexpected: true }, 'unexpected'],
    ])) {
      const error = errorOf(await a.call('advise', input));
      assert.equal(error.code, 'INPUT_INVALID', JSON.stringify(input));
      assert.ok(error.details?.some((detail) => detail.path.includes(path)), JSON.stringify(error.details));
    }
    assert.deepEqual(valueOf(await a.call('status'))['calls'], { used: 0, remaining: 20 });
  } finally {
    await a.cleanup();
  }
});

test('V20 an adapter that never answers ends as a refusal, not as a hang', async () => {
  const silent = cannedAdapter(() => new Promise(() => {}), { id: 'never' });
  const a = await loadAdvisor({ adapter: silent, limits: { minIntervalMs: 0, timeoutMs: 50 } });
  try {
    const error = errorOf(await a.call('advise'), 'a hung adapter must not answer');
    assert.equal(error.code, 'PLUGIN_ERROR');
  } finally {
    await a.cleanup();
  }
});

test('V21 silent mode accumulates explicit calls only, and nothing arrives on its own', async () => {
  const a = await loadAdvisor();
  try {
    assert.deepEqual(valueOf(await a.call('recommendations'))['recommendations'], []);
    const demand = valueOf(await a.call('advise', { mode: 'on-demand' }));
    assert.equal(/** @type {Array<unknown>} */ (demand['recommendations']).length > 0, true);
    assert.deepEqual(valueOf(await a.call('recommendations'))['recommendations'], [],
      'on-demand answers the caller and accumulates nothing');
    await a.call('advise', { mode: 'silent', question: 'anything worth noting?' });
    const first = valueOf(await a.call('recommendations'));
    assert.ok(/** @type {number} */ (first['count']) > 0);
    assert.equal(typeof first['lastAt'], 'string');
    // Nothing in this plugin runs on its own: waiting changes nothing.
    await new Promise((resolve) => { setTimeout(resolve, 60); });
    assert.deepEqual(valueOf(await a.call('recommendations')), first);
  } finally {
    await a.cleanup();
  }
});
