// U7 · envelope parsing is strict. Criterion in docs/upp/ACCEPTANCE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JSONRPC_VERSION, errorResponse, isMessageId, notification, request, response,
  validateMessage, validateResponse,
} from './messages.mjs';
import { METHODS, NOTIFICATIONS } from './schemas.mjs';
import { uppError } from './errors.mjs';

/** @type {(raw: unknown) => number | undefined} */
const codeOf = (raw) => {
  const outcome = validateMessage(raw);
  return outcome.ok ? undefined : outcome.error.code;
};
/** @type {(method: string, params?: Record<string, unknown>) => Record<string, unknown>} */
const req = (method, params = {}) => ({ jsonrpc: '2.0', id: 1, method, params });

test('upp messages · the catalogue is the seven methods, two of them notifications', () => {
  assert.deepEqual([...METHODS], [
    'upp.initialize', 'upp.capabilities', 'upp.execute', 'upp.cancel',
    'upp.health', 'upp.shutdown', 'upp.exit',
  ]);
  assert.deepEqual([...NOTIFICATIONS], ['upp.cancel', 'upp.exit']);
});

test('upp messages · an id is an integer or a non-empty string, and never null', () => {
  for (const good of [1, 0, -1, 'abc']) assert.ok(isMessageId(good), String(good));
  for (const bad of [null, undefined, '', 1.5, NaN, {}, [], true]) {
    assert.equal(isMessageId(bad), false, String(bad));
  }
});

test('upp messages · the builders refuse to produce anything malformed', () => {
  assert.deepEqual(request(7, 'upp.health'),
    { jsonrpc: '2.0', id: 7, method: 'upp.health', params: {} });
  assert.throws(() => request(null, 'upp.health'), /request id/);
  assert.throws(() => request(1, 'upp.nope'), /unknown UPP method/);
  assert.throws(() => request(1, 'upp.cancel'), /notification, not a request/);
  assert.deepEqual(notification('upp.exit'), { jsonrpc: '2.0', method: 'upp.exit', params: {} });
  assert.throws(() => notification('upp.health'), /not a notification/);
  assert.deepEqual(response(7, { status: 'ok' }), { jsonrpc: '2.0', id: 7, result: { status: 'ok' } });
  assert.throws(() => response(null, {}), /response id/);
});

test('upp messages · an error response may carry a null id — the one case JSON-RPC reserves', () => {
  const error = uppError(-32700, 'bad frame');
  assert.deepEqual(errorResponse(null, error), { jsonrpc: '2.0', id: null, error });
  assert.deepEqual(errorResponse(4, error).id, 4);
});

test('upp messages · U7 the envelope is refused before anything else is read', () => {
  assert.equal(codeOf([req('upp.health')]), -32600, 'batch arrays are not supported');
  for (const junk of [null, undefined, 'x', 7, true]) assert.equal(codeOf(junk), -32600, String(junk));
  assert.equal(codeOf({ id: 1, method: 'upp.health' }), -32600, 'missing jsonrpc');
  assert.equal(codeOf({ jsonrpc: '1.0', id: 1, method: 'upp.health' }), -32600);
  assert.equal(codeOf({ jsonrpc: 2, id: 1, method: 'upp.health' }), -32600);
  assert.equal(JSONRPC_VERSION, '2.0');
});

test('upp messages · U7 an unknown method is -32601, a missing one is -32600', () => {
  assert.equal(codeOf(req('upp.restart')), -32601);
  assert.equal(codeOf(req('initialize')), -32601, 'the namespace is part of the name');
  assert.equal(codeOf({ jsonrpc: '2.0', id: 1 }), -32600);
  assert.equal(codeOf({ jsonrpc: '2.0', id: 1, method: '' }), -32600);
});

test('upp messages · U7 a request needs an id and a notification must not have one', () => {
  assert.equal(codeOf({ jsonrpc: '2.0', method: 'upp.health', params: {} }), -32600);
  assert.equal(codeOf({ jsonrpc: '2.0', id: null, method: 'upp.health', params: {} }), -32600);
  assert.equal(codeOf({ jsonrpc: '2.0', id: 1, method: 'upp.exit', params: {} }), -32600);
  const exit = validateMessage({ jsonrpc: '2.0', method: 'upp.exit' });
  assert.equal(exit.ok, true);
  if (!exit.ok) return;
  assert.deepEqual(exit.value, { id: null, method: 'upp.exit', params: {}, notification: true });
});

test('upp messages · params are validated against the method schema', () => {
  const good = validateMessage(req('upp.initialize', {
    protocolVersions: ['1.0'], host: { name: 'eip-host', version: '0.1.0' },
  }));
  assert.equal(good.ok, true);
  assert.equal(codeOf(req('upp.initialize', { host: { name: 'h', version: '1' } })), -32602);
  assert.equal(codeOf(req('upp.initialize', { protocolVersions: ['1.0'] })), -32602);
  assert.equal(codeOf(req('upp.initialize', {
    protocolVersions: ['1.0'], host: { name: 'h', version: '1' }, surprise: 1,
  })), -32602, 'an unknown param is not tolerated outside `extensions`');
  assert.ok(validateMessage(req('upp.initialize', {
    protocolVersions: ['1.0'], host: { name: 'h', version: '1' },
    config: { prefix: 'daily' }, extensions: { future: true },
  })).ok, 'config is an accepted member of initialize');
});

test('upp messages · upp.execute needs a capability and an input, and takes a deadline', () => {
  assert.ok(validateMessage(req('upp.execute', { capability: 'count-words', input: { text: 'a' } })).ok);
  assert.ok(validateMessage(req('upp.execute', { capability: 'x', input: null, deadlineMs: 0 })).ok,
    'a null input is a declared value, not a missing one');
  assert.equal(codeOf(req('upp.execute', { input: {} })), -32602);
  assert.equal(codeOf(req('upp.execute', { capability: 'x' })), -32602);
  assert.equal(codeOf(req('upp.execute', { capability: '', input: {} })), -32602);
  assert.equal(codeOf(req('upp.execute', { capability: 'x', input: {}, deadlineMs: -1 })), -32602);
  assert.equal(codeOf(req('upp.execute', { capability: 'x', input: {}, deadlineMs: 1.5 })), -32602);
});

test('upp messages · upp.cancel proves the id the subset cannot express', () => {
  assert.ok(validateMessage({ jsonrpc: '2.0', method: 'upp.cancel', params: { id: 3 } }).ok);
  assert.ok(validateMessage({ jsonrpc: '2.0', method: 'upp.cancel', params: { id: 'a' } }).ok);
  for (const bad of [null, 1.5, {}, '', undefined]) {
    const outcome = validateMessage({ jsonrpc: '2.0', method: 'upp.cancel', params: { id: bad } });
    assert.equal(outcome.ok, false, String(bad));
    if (outcome.ok) continue;
    assert.equal(outcome.error.code, -32602);
  }
});

test('upp messages · params must be an object: positional parameters are not used', () => {
  assert.equal(codeOf({ jsonrpc: '2.0', id: 1, method: 'upp.health', params: [1, 2] }), -32602);
  assert.equal(codeOf({ jsonrpc: '2.0', id: 1, method: 'upp.health', params: 'x' }), -32602);
  assert.ok(validateMessage({ jsonrpc: '2.0', id: 1, method: 'upp.health' }).ok,
    'absent params means {}');
});

test('upp messages · a response is correlated by id, and never half-answered', () => {
  const sent = { id: 9, method: 'upp.health' };
  const good = validateResponse({ jsonrpc: '2.0', id: 9, result: { status: 'ok' } }, sent);
  assert.equal(good.ok, true);
  if (good.ok) assert.deepEqual(good.value, { id: 9, result: { status: 'ok' } });

  const wrongId = validateResponse({ jsonrpc: '2.0', id: 8, result: { status: 'ok' } }, sent);
  assert.equal(wrongId.ok, false);
  if (!wrongId.ok) assert.equal(wrongId.error.code, -32003, 'a different id is a different conversation');

  for (const body of [{}, { result: { status: 'ok' }, error: uppError(-32000, 'x') }]) {
    const outcome = validateResponse({ jsonrpc: '2.0', id: 9, ...body }, sent);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.error.code, -32600);
  }
});

test('upp messages · a response result is validated against the method it answers', () => {
  const sent = { id: 1, method: 'upp.health' };
  for (const result of [{ status: 'nearly' }, {}, { status: 'ok', extra: 1 }, 'ok']) {
    const outcome = validateResponse({ jsonrpc: '2.0', id: 1, result }, sent);
    assert.equal(outcome.ok, false, JSON.stringify(result));
    if (!outcome.ok) assert.equal(outcome.error.code, -32600);
  }
  const notAnswerable = validateResponse({ jsonrpc: '2.0', id: 1, result: {} },
    { id: 1, method: 'upp.exit' });
  assert.equal(notAnswerable.ok, false, 'a notification is never answered');
});

test('upp messages · a malformed error object is not an error anybody may act on', () => {
  const sent = { id: 1, method: 'upp.execute' };
  for (const error of [{ code: -32000 }, { code: 'x', message: 'm', data: { code: 'c' } },
    { code: -32000, message: 'm' }, { code: -32000, message: 'm', data: {} }]) {
    const outcome = validateResponse({ jsonrpc: '2.0', id: 1, error }, sent);
    assert.equal(outcome.ok, false, JSON.stringify(error));
    if (!outcome.ok) assert.equal(outcome.error.code, -32600);
  }
  const good = validateResponse({ jsonrpc: '2.0', id: 1, error: uppError(-32001, 'nope') }, sent);
  assert.equal(good.ok, true);
});
