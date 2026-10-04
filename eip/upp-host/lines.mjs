// NDJSON line assembly, as a pure state machine over byte chunks.
//
// A stream arrives in chunks that have nothing to do with messages: one chunk may carry
// three frames and half of a fourth. The splitting is therefore a separate subject from
// the transport that owns the pipe, and it is written as a function of (buffer, chunk) so
// a test can drive it one byte at a time — which is exactly the shape a hostile or buggy
// plugin produces and the shape an integration test never reproduces by accident.
//
// The byte cap is enforced HERE, before a line exists: a reader that only checks the
// length of a completed line has already allocated it. Over the cap, the bytes up to the
// next `\n` are DISCARDED rather than repaired — a frame missing its tail is not a frame,
// and guessing where it ended is how a stream desynchronises silently.
import { MAX_MESSAGE_BYTES } from '../upp/index.mjs';

/** @typedef {{ ok: true, line: string } | { ok: false, bytes: number }} Line */

const NEWLINE = 0x0a;

/**
 * A line reader over one stream. Stateful by necessity (a partial frame has to live
 * somewhere) and nothing else: no stream, no timer, no process.
 * @param {{ limit?: number }} [options] `limit` is bytes per line, never above the protocol cap
 * @returns {{ push: (chunk: Buffer) => Line[], pending: () => number, end: () => Line[] }}
 */
export function createLineReader({ limit = MAX_MESSAGE_BYTES } = {}) {
  if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_MESSAGE_BYTES) {
    throw new RangeError(`the line limit is an integer in 1..${MAX_MESSAGE_BYTES} bytes`);
  }
  /** @type {Buffer} */
  let held = Buffer.alloc(0);
  /** Bytes already thrown away for the oversized line currently being skipped. */
  let skipped = 0;

  /** @param {Buffer} chunk @returns {Line[]} */
  function push(chunk) {
    /** @type {Line[]} */
    const out = [];
    held = held.length === 0 ? Buffer.from(chunk) : Buffer.concat([held, chunk]);
    for (;;) {
      const at = held.indexOf(NEWLINE);
      if (at === -1) break;
      const frame = held.subarray(0, at);
      held = held.subarray(at + 1);
      if (skipped > 0 || frame.length > limit) {
        // Either we were already dropping an oversized frame, or this whole frame arrived
        // inside one chunk and is over the cap. Same verdict: the byte count, no line.
        out.push({ ok: false, bytes: skipped + frame.length });
        skipped = 0;
        continue;
      }
      out.push({ ok: true, line: frame.toString('utf8') });
    }
    if (held.length > limit) {
      // Over the cap with no terminator in sight: drop what we hold and keep dropping
      // until the next newline. The frame is already lost; holding it only costs memory.
      skipped += held.length;
      held = Buffer.alloc(0);
    }
    return out;
  }

  /** Bytes currently held for an unfinished line. @returns {number} */
  const pending = () => held.length + skipped;

  /** The stream closed. A trailing fragment with no `\n` is reported as a breach: NDJSON
   * has no "last line without a terminator" exception, and accepting one would make a
   * truncated write indistinguishable from a complete message. @returns {Line[]} */
  function end() {
    /** @type {Line[]} */
    const out = [];
    const left = held.length + skipped;
    if (left > 0) out.push({ ok: false, bytes: left });
    held = Buffer.alloc(0);
    skipped = 0;
    return out;
  }

  return { push, pending, end };
}
