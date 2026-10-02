// Cell 2 "Reading time" — one test per acceptance criterion of
// ../contracts/reading-time.md. The names carry the criterion id on purpose:
// a failing test should point straight at the contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingTime } from '../src/text-stats.mjs';

/** @type {(n: number) => string} */
const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

test('C1 · no words means no minutes', () => {
  assert.equal(readingTime(''), 0);
  assert.equal(readingTime('   \n '), 0);
});

test('C2 · a started minute counts as a whole minute', () => {
  assert.equal(readingTime(words(1)), 1);
  assert.equal(readingTime(words(200)), 1);
  assert.equal(readingTime(words(201)), 2);
  assert.equal(readingTime(words(400)), 2);
  assert.equal(readingTime(words(401)), 3);
});

test('C3 · wpm is honoured', () => {
  assert.equal(readingTime(words(100), { wpm: 50 }), 2);
  assert.equal(readingTime(words(100), { wpm: 1000 }), 1);
  assert.equal(readingTime(words(100)), 1); // default 200
});

test('C4 · a non-positive wpm is refused, not divided by', () => {
  assert.throws(() => readingTime('hello', { wpm: 0 }), RangeError);
  assert.throws(() => readingTime('hello', { wpm: -5 }), RangeError);
  assert.throws(() => readingTime('hello', { wpm: Number.NaN }), RangeError);
  assert.throws(() => readingTime('hello', { wpm: Infinity }), RangeError);
});
