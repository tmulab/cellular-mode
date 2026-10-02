// Plugin CONTRACT tests (T1-T4 of eip/plugins/ACCEPTANCE.md).
//
// These are not domain tests: they ask whether a plugin behaves like a plugin —
// provides the key it declares, refuses an impossible composition, leaves nothing
// behind, and reaches its sibling by contract at call time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBoth, recordingPort, registerBoth, sayYes } from './fixture.mjs';
import { errorOf, kernelError, valueOf } from '../kernel/assertions.mjs';

/** The text.stats service, as its own manifest declares it to a sibling.
 * @typedef {{ cacheSize: () => number }} StatsService */

/** @type {(code: string) => (error: unknown) => boolean} */
const codeIs = (code) => (error) => {
  const named = kernelError(error);
  assert.equal(named.name, 'KernelError', `expected a KernelError, got ${error}`);
  assert.equal(named.code, code);
  return true;
};

test('T1 P1 — both plugins provide exactly the key and contract they declare', async () => {
  const { kernel } = await loadBoth(sayYes());
  const [report, stats] = kernel.list().sort((a, b) => a.name.localeCompare(b.name));
  assert.ok(report && stats, 'both plugins must be listed');

  assert.equal(stats.name, 'text.stats');
  assert.deepEqual(stats.inject, {});
  assert.deepEqual(stats.permissions, []);
  assert.deepEqual(Object.keys(stats.capabilities).sort(), ['count-words', 'reading-time']);
  assert.equal(stats.capabilities['count-words']?.consequential, false);
  assert.deepEqual(stats.devUi, { title: 'Text statistics' }); // body never published
  assert.equal('html' in (stats.devUi ?? {}), false);

  assert.equal(report.name, 'text.report');
  assert.deepEqual(report.inject, { 'text.stats': { required: true } });
  assert.deepEqual(report.permissions, ['fs.write']);
  assert.equal(report.capabilities['save-report']?.consequential, true);
  assert.equal(report.devUi, undefined);

  // P1 is only true if the declared capabilities really answer.
  /** @type {Array<[string, string, Record<string, unknown>]>} */
  const calls = [
    ['text.stats', 'count-words', { text: 'two words' }],
    ['text.stats', 'reading-time', { text: 'two words' }],
  ];
  for (const [key, cap, input] of calls) {
    const result = await kernel.execute(key, cap, input);
    assert.equal(result.ok, true, JSON.stringify(result));
  }
});

test('T2 P2 — a missing write port fails loud at load, and the key is not provided', async () => {
  const kernel = registerBoth();
  await kernel.load('text.stats', {});
  await assert.rejects(() => kernel.load('text.report', {}), (error) => {
    codeIs('PLUGIN_ERROR')(error);
    assert.match(kernelError(error).message, /writeFile/);
    return true;
  });
  assert.equal(kernel.isLoaded('text.report'), false);
  assert.throws(() => kernel.get('text.report'), codeIs('NOT_FOUND'));
});

test('T2 P2 — a port offered under an undeclared permission is invisible', async () => {
  const kernel = registerBoth();
  await kernel.load('text.stats', {});
  // The host offers `writeFile`, but as fs.read. text.report declared fs.write only,
  // so there is no handle at all: not "refused at call time", invisible.
  const wrongPermission = recordingPort('fs.read');
  await assert.rejects(
    () => kernel.load('text.report', { ports: wrongPermission.ports }),
    codeIs('PLUGIN_ERROR'),
  );
  assert.equal(kernel.isLoaded('text.report'), false);
  assert.deepEqual(wrongPermission.written, []);
});

test('T2 P2 — invalid config fails loud with the offending path', async () => {
  const kernel = registerBoth();
  await assert.rejects(() => kernel.load('text.stats', { config: { defaultWpm: 5000 } }), (error) => {
    codeIs('INPUT_INVALID')(error);
    assert.deepEqual((kernelError(error).details ?? []).map((d) => d.path), ['config.defaultWpm']);
    return true;
  });
  assert.equal(kernel.isLoaded('text.stats'), false);
});

test('T3 P3 — dispose runs the inverse, leaves zero residue, and reload works', async () => {
  const kernel = registerBoth();
  const service = /** @type {StatsService} */ (await kernel.load('text.stats', {}));
  await kernel.execute('text.stats', 'count-words', { text: 'memo this' });
  assert.equal(service.cacheSize(), 1, 'the memo cache should hold the counted text');

  await kernel.dispose('text.stats');
  assert.equal(service.cacheSize(), 0, 'the inverse effect must clear the cache');
  assert.equal(kernel.isLoaded('text.stats'), false);

  const reloaded = /** @type {StatsService} */ (await kernel.load('text.stats', {}));
  assert.equal(reloaded.cacheSize(), 0);
  const result = await kernel.execute('text.stats', 'count-words', { text: 'memo this' });
  assert.deepEqual(result, { ok: true, value: { words: 2 } });
});

test('T3 P3 — the provider cannot be pulled out from under the consumer', async () => {
  const { kernel } = await loadBoth(sayYes());
  await assert.rejects(() => kernel.dispose('text.stats'), (error) => {
    codeIs('DEPENDENCY_IN_USE')(error);
    assert.match(kernelError(error).message, /text\.report/);
    return true;
  });
  assert.equal(kernel.isLoaded('text.stats'), true);
});

test('T3 P3 — disposing the consumer leaves the provider loaded and usable', async () => {
  const { kernel } = await loadBoth(sayYes());
  await kernel.dispose('text.report');
  assert.equal(kernel.isLoaded('text.report'), false);
  assert.equal(kernel.isLoaded('text.stats'), true);
  const result = await kernel.execute('text.stats', 'count-words', { text: 'still here' });
  assert.deepEqual(result, { ok: true, value: { words: 2 } });
});

test('T4 the sibling is resolved at CALL time, not at apply', async () => {
  const { approver } = sayYes();
  const kernel = registerBoth({ approver });
  const writer = recordingPort();
  // Consumer FIRST: if `apply` resolved the sibling eagerly, this would already fail.
  await kernel.load('text.report', { ports: writer.ports });
  await kernel.load('text.stats', {});
  const result = await kernel.execute('text.report', 'save-report', { name: 'late-order', text: 'four words right here' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(valueOf(result).words, 4);
  assert.equal(writer.written.length, 1);
});

test('T4 a required sibling that is registered but not loaded fails by code, writing nothing', async () => {
  const { approver } = sayYes();
  const kernel = registerBoth({ approver });
  const writer = recordingPort();
  await kernel.load('text.report', { ports: writer.ports });
  const result = await kernel.execute('text.report', 'save-report', { name: 'no-sibling', text: 'a b c' });
  const failure = errorOf(result);
  assert.equal(failure.code, 'PLUGIN_ERROR');
  assert.equal(failure.details?.[0]?.path, 'DEPENDENCY_MISSING');
  assert.equal('stack' in failure, false);
  assert.deepEqual(writer.written, []);
});
