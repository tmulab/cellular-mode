// The corpus itself, and the matchers that judge it.
//
// U27 lives here: the fixtures are language-independent DATA, and the thing that reads them is
// a pure function. If the matchers were loose, every language would "pass" and the corpus would
// be decoration — so each matcher is tested for what it REFUSES, not only for what it accepts.
//
// U10's equivalence claim is also decided here: the capability contract an ordinary
// `definePlugin` plugin projects through `toUppManifest` is asserted deep-equal to the
// reference manifest's. That is the part of "the same plugin, through the protocol" that a
// green replay alone would not prove.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toUppManifest, validateUppManifest } from '../upp/index.mjs';
import { manifestDigest } from './canonical.mjs';
import {
  covers, expectedMessageCount, matchExpectation, requestLine, sameJson,
} from './conformance.mjs';
import { loadCases, referenceManifest, referencePin } from './conformance-run.mjs';
import { countWords, wordcountPlugin } from './fixtures/wordcount-plugin.mjs';

const CASES = loadCases();

test('corpus · eleven declared cases, each with a reason and matching counts', () => {
  assert.equal(CASES.length, 11);
  const names = CASES.map((kase) => kase.name);
  assert.deepEqual(names, [...names].sort(), 'the numeric prefixes ARE the declared order');
  assert.equal(new Set(names).size, names.length);
  for (const kase of CASES) {
    assert.ok((kase.why ?? '').length > 30, `${kase.name} must say why it exists`);
    assert.ok(kase.requests.length > 0 && kase.expect.length > 0, kase.name);
    for (const entry of kase.requests) assert.equal(typeof requestLine(entry), 'string');
  }
  assert.equal(CASES.filter((k) => k.expect.some((e) => e.none === true)).length, 2,
    'two cases assert SILENCE: upp.cancel and upp.exit');
  assert.equal(CASES.filter((k) => k.expect.some((e) => e.manifestPin === true)).length, 10,
    'every case except the version mismatch pins the manifest on the way in');
});

test('corpus · every error expectation names an exact integer', () => {
  const codes = CASES.flatMap((kase) => kase.expect.filter((e) => Object.hasOwn(e, 'code')))
    .map((e) => e.code);
  assert.deepEqual([...new Set(codes)].sort((a, b) => Number(a) - Number(b)),
    [-32700, -32602, -32601, -32002, -32001].sort((a, b) => a - b));
  for (const code of codes) assert.equal(Number.isInteger(code), true);
});

test('corpus · the reference manifest is a valid UPP manifest and pins stably', () => {
  const manifest = referenceManifest();
  const verdict = validateUppManifest(manifest);
  assert.deepEqual(verdict.errors, []);
  assert.equal(manifest.id, 'text.wordcount');
  assert.match(referencePin(), /^[0-9a-f]{64}$/);
  assert.equal(referencePin(), manifestDigest(manifest));
  // Key order is formatting, not meaning: the pin must survive a reshuffle.
  const reversed = Object.fromEntries(Object.entries(manifest).reverse());
  assert.equal(manifestDigest(reversed), referencePin());
});

test('U10 · an ordinary definePlugin plugin projects the reference capability contract', () => {
  const projected = toUppManifest(wordcountPlugin);
  assert.deepEqual(projected.capabilities, referenceManifest().capabilities,
    'the in-process plugin and the five process plugins declare the SAME capability');
  assert.equal(projected.id, 'text.wordcount');
  assert.equal(projected.runtime, 'in-process', 'and it is honest about where it runs');
});

test('wordcount · the one definition every language has to share', () => {
  assert.equal(countWords('the  quick\tbrown\nfox jumps'), 5);
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   \t\n '), 0);
  assert.equal(countWords('one'), 1);
});

test('matchers · sameJson is strict about shape, length and extra keys', () => {
  assert.equal(sameJson({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true);
  assert.equal(sameJson({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(sameJson([1, 2], [2, 1]), false);
  assert.equal(sameJson([1], [1, 1]), false);
  assert.equal(sameJson(null, undefined), false);
  assert.equal(sameJson(1, '1'), false);
});

test('matchers · covers accepts a declared subset and refuses a missing key', () => {
  assert.equal(covers({ a: 1 }, { a: 1, b: 2 }), true);
  assert.equal(covers({ a: { b: 1 } }, { a: { b: 1, c: 2 } }), true);
  assert.equal(covers({ a: 1 }, { b: 1 }), false);
  assert.equal(covers({ a: 1 }, undefined), false);
  assert.equal(covers([1], [1, 2]), false, 'an array of the wrong length is not covered');
});

test('matchers · a code expectation refuses the wrong integer and a success', () => {
  const pin = 'f'.repeat(64);
  const error = { jsonrpc: '2.0', id: 2, error: { code: -32602, message: 'no', data: { code: 'INPUT_INVALID' } } };
  assert.deepEqual(matchExpectation({ id: 2, code: -32602 }, error, pin, 0), []);
  assert.equal(matchExpectation({ id: 2, code: -32601 }, error, pin, 0).length, 1);
  assert.equal(matchExpectation({ id: 2, code: -32602 }, { jsonrpc: '2.0', id: 2, result: {} }, pin, 0).length, 1);
  assert.equal(matchExpectation({ id: 3, code: -32602 }, error, pin, 0).length, 1, 'the id is part of the claim');
});

test('matchers · a null id is a value, not an absence', () => {
  const pin = 'f'.repeat(64);
  const parseError = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'x', data: { code: 'PLUGIN_ERROR' } } };
  assert.deepEqual(matchExpectation({ id: null, code: -32700 }, parseError, pin, 0), []);
  assert.equal(matchExpectation({ id: 1, code: -32700 }, parseError, pin, 0).length, 1);
});

test('matchers · silence is asserted, and a reply breaks it', () => {
  const pin = 'f'.repeat(64);
  assert.deepEqual(matchExpectation({ none: true }, undefined, pin, 1), []);
  assert.equal(matchExpectation({ none: true }, { jsonrpc: '2.0', id: 1, result: {} }, pin, 1).length, 1);
  assert.equal(matchExpectation({ id: 1, result: {} }, undefined, pin, 0).length, 1,
    'a missing message is a breach, not a pass');
  assert.equal(expectedMessageCount([{ id: 1 }, { none: true }, { id: 2 }]), 2);
});

test('matchers · the manifest pin is compared, and a near miss fails', () => {
  const manifest = referenceManifest();
  const pin = referencePin();
  const good = { jsonrpc: '2.0', id: 1, result: { protocolVersion: '1.0', manifest } };
  assert.deepEqual(matchExpectation({ id: 1, manifestPin: true }, good, pin, 0), []);
  const swapped = { ...manifest, version: '1.0.1' };
  const bad = { jsonrpc: '2.0', id: 1, result: { protocolVersion: '1.0', manifest: swapped } };
  const breaches = matchExpectation({ id: 1, manifestPin: true }, bad, pin, 0);
  assert.equal(breaches.length, 1);
  assert.match(breaches[0] ?? '', /manifest pin is/);
  assert.equal(matchExpectation({ id: 1, manifestPin: true }, { jsonrpc: '2.0', id: 1, result: {} }, pin, 0).length, 1);
});

test('requestLine · a {line} entry is sent verbatim, a {message} is serialised', () => {
  assert.equal(requestLine({ line: 'this is not json' }), 'this is not json');
  assert.equal(requestLine({ message: { jsonrpc: '2.0', id: 1 } }), '{"jsonrpc":"2.0","id":1}');
  assert.throws(() => requestLine({ nonsense: true }), TypeError);
});
