// The byte bound and the parse refusal. Part of U7, and the pure half of U13 (cell 3 will
// prove the stream half, where "nothing was written" is observable on a recording stream).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MESSAGE_BYTES, createIdSequence, deserialize, serialize,
} from './framing.mjs';
import { request } from './messages.mjs';

test('upp framing · the default bound is 1 MiB, and it is the ceiling as well', () => {
  assert.equal(MAX_MESSAGE_BYTES, 1024 * 1024);
  assert.throws(() => serialize({}, MAX_MESSAGE_BYTES + 1), RangeError,
    'configurable DOWNWARD only: a limit somebody can raise is not a limit');
  assert.throws(() => serialize({}, 0), RangeError);
  assert.throws(() => serialize({}, -1), RangeError);
  assert.throws(() => serialize({}, 1.5), RangeError);
  assert.throws(() => deserialize('{}', MAX_MESSAGE_BYTES + 1), RangeError);
});

test('upp framing · a legal message serialises to one line with no newline in it', () => {
  const outcome = serialize(request(1, 'upp.execute', { capability: 'x', input: { text: 'a' } }));
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.includes('\n'), false, 'NDJSON: the delimiter is ours, not the payload`s');
  assert.deepEqual(JSON.parse(outcome.value).method, 'upp.execute');
});

test('upp framing · over the bound is -32006, and the refusal says nothing was written', () => {
  const big = { jsonrpc: '2.0', id: 1, method: 'upp.execute', params: { input: 'x'.repeat(4096) } };
  const outcome = serialize(big, 1024);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.code, -32006);
  assert.equal(outcome.error.data.code, 'INPUT_INVALID');
  assert.match(outcome.error.message, /limit is 1024/);
  assert.equal(outcome.error.data.details?.[0]?.message, 'nothing was written');
});

test('upp framing · the bound is BYTES, not characters', () => {
  // Four characters, twelve UTF-8 bytes. A character count would let this through.
  const text = '你好世界';
  assert.equal(text.length, 4);
  assert.equal(Buffer.byteLength(text, 'utf8'), 12);
  const under = serialize(text, 15);
  const over = serialize(text, 13);
  assert.equal(under.ok, true, 'the JSON string is 14 bytes with its quotes');
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.error.code, -32006);
});

test('upp framing · an unserialisable message is the host`s own -32603, never a throw', () => {
  /** @type {Record<string, unknown>} */
  const cyclic = {};
  cyclic.self = cyclic;
  const outcome = serialize(cyclic);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.code, -32603);
  assert.equal(serialize(undefined).ok, false, 'JSON.stringify(undefined) is not a message');
  assert.equal(serialize(() => {}).ok, false);
});

test('upp framing · a malformed frame is -32700 and never a repair attempt', () => {
  for (const bad of ['', '{', 'not json', '{"a":}', '[1,]', 'NaN']) {
    const outcome = deserialize(bad);
    assert.equal(outcome.ok, false, JSON.stringify(bad));
    if (outcome.ok) continue;
    assert.equal(outcome.error.code, -32700);
    assert.equal(outcome.error.data.code, 'PLUGIN_ERROR');
  }
  for (const notText of [undefined, null, 7, {}]) {
    const outcome = deserialize(/** @type {string} */ (notText));
    assert.equal(outcome.ok, false, String(notText));
    if (!outcome.ok) assert.equal(outcome.error.code, -32700);
  }
});

test('upp framing · an oversized INBOUND frame is -32006 and is discarded', () => {
  const outcome = deserialize(`{"a":"${'x'.repeat(100)}"}`, 32);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.code, -32006);
  assert.equal(outcome.error.data.details?.[0]?.message, 'the frame was discarded');
});

test('upp framing · a round trip survives, and the parse is not generous', () => {
  const sent = request(2, 'upp.health');
  const text = serialize(sent);
  assert.equal(text.ok, true);
  if (!text.ok) return;
  const back = deserialize(text.value);
  assert.equal(back.ok, true);
  if (back.ok) assert.deepEqual(back.value, sent);
});

test('upp framing · ids are per connection, monotonic, and never shared', () => {
  const a = createIdSequence();
  const b = createIdSequence();
  assert.deepEqual([a.next(), a.next(), a.next()], [1, 2, 3]);
  assert.equal(a.issued(), 3);
  assert.equal(b.next(), 1, 'two connections must not share a sequence');
  assert.ok(Object.isFrozen(a));
});
