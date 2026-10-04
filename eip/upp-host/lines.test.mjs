// NDJSON assembly, driven by hand at the byte level.
//
// U13's inbound half lives here. An integration test cannot reach these cases reliably: a
// chunk boundary in the middle of a frame, an oversized line arriving in pieces, a stream
// that ends mid-frame. Driving the reader directly is the only way to make them certain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MESSAGE_BYTES } from '../upp/index.mjs';
import { createLineReader } from './lines.mjs';

/** @type {(text: string) => Buffer} */
const buf = (text) => Buffer.from(text, 'utf8');

test('lines · three frames and a fragment in one chunk', () => {
  const reader = createLineReader();
  const out = reader.push(buf('{"a":1}\n{"a":2}\n{"a":3}\n{"a":'));
  assert.deepEqual(out, [
    { ok: true, line: '{"a":1}' }, { ok: true, line: '{"a":2}' }, { ok: true, line: '{"a":3}' },
  ]);
  assert.equal(reader.pending(), 5);
  assert.deepEqual(reader.push(buf('4}\n')), [{ ok: true, line: '{"a":4}' }]);
  assert.equal(reader.pending(), 0);
});

test('lines · one byte at a time yields exactly the same frames', () => {
  const reader = createLineReader();
  /** @type {Array<{ ok: boolean }>} */
  const seen = [];
  for (const byte of buf('{"a":1}\n{"b":"é"}\n')) seen.push(...reader.push(Buffer.from([byte])));
  assert.deepEqual(seen, [{ ok: true, line: '{"a":1}' }, { ok: true, line: '{"b":"é"}' }]);
});

test('lines · a multi-byte character split across chunks survives', () => {
  const reader = createLineReader();
  const bytes = buf('{"b":"é"}\n');
  assert.deepEqual(reader.push(bytes.subarray(0, 7)), []);
  assert.deepEqual(reader.push(bytes.subarray(7)), [{ ok: true, line: '{"b":"é"}' }]);
});

test('lines · an oversized line is reported by its byte count and discarded, not repaired', () => {
  const reader = createLineReader({ limit: 64 });
  assert.deepEqual(reader.push(buf('x'.repeat(100))), []);
  const out = reader.push(buf('yyy\n{"after":true}\n'));
  assert.deepEqual(out, [{ ok: false, bytes: 103 }, { ok: true, line: '{"after":true}' }]);
  assert.equal(reader.pending(), 0, 'the host does not keep the bytes of a frame it refused');
});

test('lines · a line exactly at the limit is accepted; one byte more is not', () => {
  const at = createLineReader({ limit: 8 });
  assert.deepEqual(at.push(buf('12345678\n')), [{ ok: true, line: '12345678' }]);
  const over = createLineReader({ limit: 8 });
  assert.deepEqual(over.push(buf('123456789\n')), [{ ok: false, bytes: 9 }]);
});

test('lines · a stream ending mid-frame is a breach, not a last message', () => {
  const reader = createLineReader();
  assert.deepEqual(reader.push(buf('{"half":')), []);
  assert.deepEqual(reader.end(), [{ ok: false, bytes: 8 }]);
  assert.deepEqual(reader.end(), [], 'end is idempotent');
});

test('lines · the limit cannot be raised above the protocol cap', () => {
  assert.throws(() => createLineReader({ limit: MAX_MESSAGE_BYTES + 1 }), RangeError);
  assert.throws(() => createLineReader({ limit: 0 }), RangeError);
  assert.throws(() => createLineReader({ limit: 1.5 }), RangeError);
});
