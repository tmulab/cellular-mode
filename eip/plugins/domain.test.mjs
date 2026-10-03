// Domain + approval + dev-UI tests (T5-T8 of eip/plugins/ACCEPTANCE.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEV_UI_HTML } from './text-stats/dev-ui.mjs';
import { PARAGRAPH, loadBoth, recordingPort, registerBoth, sayYes } from './fixture.mjs';
import { errorOf } from '../kernel/assertions.mjs';

test('T5 realistic text is measured correctly through the contract', async () => {
  const { kernel } = await loadBoth(sayYes());
  /** @type {(cap: string, input: Record<string, unknown>) => Promise<unknown>} */
  const run = (cap, input) => kernel.execute('text.stats', cap, input);

  assert.deepEqual(await run('count-words', { text: PARAGRAPH }), { ok: true, value: { words: 69 } });
  // 69 words: a minute at 200 wpm, two minutes at 50 — a partial minute still
  // costs someone a minute of attention, so it rounds up.
  assert.deepEqual(await run('reading-time', { text: PARAGRAPH }), { ok: true, value: { minutes: 1 } });
  assert.deepEqual(await run('reading-time', { text: PARAGRAPH, wpm: 50 }), { ok: true, value: { minutes: 2 } });
  // Zero words is zero minutes, not one.
  assert.deepEqual(await run('count-words', { text: '   \n\t ' }), { ok: true, value: { words: 0 } });
  assert.deepEqual(await run('reading-time', { text: '' }), { ok: true, value: { minutes: 0 } });
});

test('T5 the configured default wpm is used when the call gives none', async () => {
  const kernel = registerBoth();
  await kernel.load('text.stats', { config: { defaultWpm: 50 } });
  assert.deepEqual(
    await kernel.execute('text.stats', 'reading-time', { text: PARAGRAPH }),
    { ok: true, value: { minutes: 2 } },
  );
});

test('T5 the input bounds are enforced as INPUT_INVALID, by path', async () => {
  const { kernel } = await loadBoth(sayYes());
  /** @type {Array<[string, Record<string, unknown>, string]>} */
  const cases = [
    ['count-words', { text: 'x'.repeat(100001) }, 'text'],
    ['count-words', { text: 42 }, 'text'],
    ['count-words', {}, 'text'],
    ['reading-time', { text: 'ok', wpm: 10 }, 'wpm'],
    ['reading-time', { text: 'ok', wpm: 1001 }, 'wpm'],
    ['reading-time', { text: 'ok', wpm: 200.5 }, 'wpm'],
    ['count-words', { text: 'ok', extra: true }, 'extra'],
  ];
  for (const [cap, input, path] of cases) {
    const result = await kernel.execute('text.stats', cap, input);
    const failure = errorOf(result, `${cap} ${JSON.stringify(input)} should be refused`);
    assert.equal(failure.code, 'INPUT_INVALID');
    assert.deepEqual((failure.details ?? []).map((d) => d.path), [path]);
  }
});

test('T6 save-report without an approver is a closed door, and writes nothing', async () => {
  const { kernel, writer } = await loadBoth(); // no approver: fail closed
  const result = await kernel.execute('text.report', 'save-report', { name: 'report-a', text: PARAGRAPH });
  assert.equal(errorOf(result).code, 'APPROVAL_REQUIRED');
  assert.deepEqual(writer.written, []);
});

test('T6 a denied verdict is APPROVAL_DENIED, and still writes nothing', async () => {
  const { kernel, writer } = await loadBoth({
    approver: () => ({ approved: false, by: 'test-human', reason: 'not this one' }),
  });
  const result = await kernel.execute('text.report', 'save-report', { name: 'report-b', text: PARAGRAPH });
  assert.equal(errorOf(result).code, 'APPROVAL_DENIED');
  assert.match(errorOf(result).message, /not this one/);
  assert.deepEqual(writer.written, []);
});

test('T6 an approved save-report writes the report and returns the relative path', async () => {
  const seen = sayYes();
  const { kernel, writer } = await loadBoth({ approver: seen.approver });
  const result = await kernel.execute('text.report', 'save-report', { name: 'report-c', text: PARAGRAPH });
  assert.deepEqual(result, { ok: true, value: { path: 'report-c.json', words: 69, minutes: 1 } });

  // The approver was asked about this exact act, before it happened.
  assert.equal(seen.log.length, 1);
  const asked = /** @type {{ key: string, cap: string, consequential: boolean }} */ (seen.log[0]);
  assert.equal(asked.key, 'text.report');
  assert.equal(asked.cap, 'save-report');
  assert.equal(asked.consequential, true);

  assert.equal(writer.written.length, 1);
  assert.equal(writer.written[0]?.path, 'report-c.json');
  assert.deepEqual(JSON.parse(String(writer.written[0]?.body)), {
    name: 'report-c', words: 69, minutes: 1, characters: PARAGRAPH.length, generatedBy: 'text.report',
  });
});

test('T7 a name that is not pattern-safe never reaches the port', async () => {
  const seen = sayYes();
  const { kernel, writer } = await loadBoth({ approver: seen.approver });
  for (const name of ['../escape', 'a/b', 'a\\b', 'UPPER', 'with space', 'x'.repeat(41), 'dot.name']) {
    const result = await kernel.execute('text.report', 'save-report', { name, text: 'a b' });
    const failure = errorOf(result, `"${name}" should be refused`);
    // The schema subset has no `pattern`, so the plugin raises a NAMED error. Which
    // GATE caught it differs - the schema's maxLength for the long name, the plugin's
    // own throw for the charset - and the code a caller sees does not: INPUT_INVALID
    // is one of the SDK's PASSTHROUGH_CODES (K14), because a bad name is the CLIENT's
    // mistake and not a fault of this server. No stack travels either way.
    assert.equal(failure.code, 'INPUT_INVALID', `${name}: ${JSON.stringify(failure)}`);
    assert.equal(failure.details?.[0]?.path, 'name');
    assert.equal('stack' in failure, false);
  }
  assert.deepEqual(writer.written, [], 'no refused name may reach the filesystem port');
});

test('T8 the dev UI fragment is static, same-origin and free of inline handlers', () => {
  assert.equal(/<script/i.test(DEV_UI_HTML), false, 'no script in a plugin fragment');
  assert.equal(/\son[a-z]+\s*=/i.test(DEV_UI_HTML), false, 'no inline event handler');
  assert.equal(/javascript:/i.test(DEV_UI_HTML), false);
  assert.equal(/https?:\/\//i.test(DEV_UI_HTML), false, 'no third-party resource');
  assert.equal(/\sstyle\s*=/i.test(DEV_UI_HTML), false, 'styling belongs to the host stylesheet');
  // Every declared capability form matches a capability of the plugin.
  const caps = [...DEV_UI_HTML.matchAll(/data-cap="([^"]+)"/g)].map((m) => String(m[1]));
  assert.deepEqual(caps.sort(), ['count-words', 'reading-time']);
  const fields = [...DEV_UI_HTML.matchAll(/data-type="([^"]+)"/g)].map((m) => String(m[1]));
  assert.deepEqual(fields.sort(), ['integer', 'string', 'string']);
  assert.equal(DEV_UI_HTML.includes('[data-out]'), false);
  assert.ok(DEV_UI_HTML.includes('data-out'), 'the host script needs an output target');
});
