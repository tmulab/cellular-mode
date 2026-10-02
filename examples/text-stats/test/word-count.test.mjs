// Cell 1 "Word count" — the criteria this cell was closed against.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWords } from '../src/text-stats.mjs';

test('empty and whitespace-only text has zero words', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   \n\t  '), 0);
  assert.equal(countWords(' 　'), 0);
});

test('counts whitespace-separated words, ignoring the edges', () => {
  assert.equal(countWords('one'), 1);
  assert.equal(countWords('  one  '), 1);
  assert.equal(countWords('one two three'), 3);
  assert.equal(countWords('one   two\n\nthree\tfour'), 4);
});

test('unicode separators separate words', () => {
  // non-breaking space, ideographic space, line separator
  assert.equal(countWords('one two'), 2);
  assert.equal(countWords('one　two'), 2);
  assert.equal(countWords('one two'), 2);
});

test('punctuation stays glued to its word', () => {
  assert.equal(countWords('Hello, world!'), 2);
  assert.equal(countWords('well-known state-of-the-art'), 2);
});

test('a non-string is a programming error, not a zero', () => {
  // @ts-expect-error deliberate contract violation: countWords refuses a non-string.
  assert.throws(() => countWords(undefined), TypeError);
  // @ts-expect-error deliberate contract violation: countWords refuses a number.
  assert.throws(() => countWords(42), TypeError);
});
