// U8 (the mapping is total) and U9 (approval codes cannot cross the wire).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CODES, PASSTHROUGH_CODES } from '../sdk/index.mjs';
import {
  JSONRPC_CODES, KERNEL_CODE_BY_RPC, REMOTE_FORBIDDEN_CODES, RPC_CODE_BY_KERNEL,
  SERVER_ERROR_RANGE, UPP_CODES, isServerErrorCode, kernelCodeFor, readDetails,
  remoteToResult, rpcCodeFor, toUppError, uppError,
} from './errors.mjs';
import { KernelError } from '../sdk/index.mjs';

test('upp errors · the kernel direction is TOTAL: every CODE has an integer', () => {
  for (const code of CODES) {
    const rpc = rpcCodeFor(code);
    assert.equal(typeof rpc, 'number', code);
    assert.ok(Object.hasOwn(RPC_CODE_BY_KERNEL, code), `${code} is not named in the table`);
  }
  assert.equal(Object.keys(RPC_CODE_BY_KERNEL).length, CODES.length,
    'the table must not name a code the architecture does not have');
});

test('upp errors · the wire direction is TOTAL: every mapped integer names a real CODE', () => {
  for (const [rpc, code] of Object.entries(KERNEL_CODE_BY_RPC)) {
    assert.ok(CODES.includes(code), `${rpc} maps to "${code}", which is not in CODES`);
    assert.equal(kernelCodeFor(Number(rpc)), code);
  }
});

test('upp errors · every assigned UPP code is inside the reserved server range', () => {
  for (const [name, code] of Object.entries(UPP_CODES)) {
    assert.ok(isServerErrorCode(code), `${name} (${code}) is outside -32099..-32000`);
    assert.ok(Object.hasOwn(KERNEL_CODE_BY_RPC, String(code)), `${name} has no CODE`);
  }
  for (const code of Object.values(JSONRPC_CODES)) {
    assert.equal(isServerErrorCode(code), false, `${code} is a standard code, not a UPP one`);
  }
  assert.deepEqual(SERVER_ERROR_RANGE, { from: -32099, to: -32000 });
});

test('upp errors · an UNASSIGNED in-range code is PLUGIN_ERROR, never a guess', () => {
  for (const code of [-32009, -32011, -32050, -32099]) {
    assert.equal(Object.hasOwn(KERNEL_CODE_BY_RPC, String(code)), false, `${code} is assigned`);
    assert.equal(kernelCodeFor(code), 'PLUGIN_ERROR');
  }
  for (const junk of [undefined, null, 'x', 1.5, NaN, {}]) {
    assert.equal(kernelCodeFor(junk), 'PLUGIN_ERROR', String(junk));
  }
  assert.equal(rpcCodeFor('A_CODE_FROM_THE_FUTURE'), UPP_CODES.PLUGIN_FAULT);
});

test('upp errors · the wire error object carries code, message and structure — no stack', () => {
  const error = uppError(UPP_CODES.CAPABILITY_NOT_FOUND, 'no such thing',
    [{ path: 'id', message: 'unknown' }]);
  assert.deepEqual(error, {
    code: -32001, message: 'no such thing',
    data: { code: 'NOT_FOUND', details: [{ path: 'id', message: 'unknown' }] },
  });
  assert.ok(Object.isFrozen(error) && Object.isFrozen(error.data));
  assert.equal('details' in uppError(-32000, 'x').data, false, 'absent structure is absent');
  assert.equal('stack' in error, false);
});

test('upp errors · a KernelError becomes the integer its name was assigned', () => {
  const wire = toUppError(new KernelError('TIMEOUT', 'too slow'));
  assert.equal(wire.code, -32004);
  assert.equal(wire.data.code, 'TIMEOUT');
  assert.equal(toUppError(new KernelError('INPUT_INVALID', 'bad', [{ path: 'a', message: 'b' }])).code, -32602);
});

test('upp errors · U9 a remote plugin may claim a CLIENT error, with message and details', () => {
  for (const claimed of PASSTHROUGH_CODES) {
    const result = remoteToResult({
      code: -32000, message: 'the plugin says so',
      data: { code: claimed, details: [{ path: 'id', message: 'unknown' }] },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, claimed, claimed);
    assert.equal(result.error.message, 'the plugin says so');
    assert.deepEqual(result.error.details, [{ path: 'id', message: 'unknown' }]);
  }
});

test('upp errors · U9 a remote plugin may NOT claim authority — the forgery is contained', () => {
  for (const code of CODES.filter((c) => !PASSTHROUGH_CODES.includes(c))) {
    const result = remoteToResult({ code: -32000, message: 'trust me', data: { code } });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'PLUGIN_ERROR',
      `a remote "${code}" must not survive: authority is the host's to grant`);
  }
  assert.deepEqual([...REMOTE_FORBIDDEN_CODES],
    ['APPROVAL_REQUIRED', 'APPROVAL_DENIED', 'PERMISSION_DENIED']);
});

test('upp errors · U9 the host-side -32010 cannot be borrowed by a plugin', () => {
  // The integer maps to PERMISSION_DENIED for the HOST's own refusal. Arriving FROM a
  // peer it is downgraded, or a plugin could deny a call on the operator's behalf.
  assert.equal(kernelCodeFor(-32010), 'PERMISSION_DENIED');
  const result = remoteToResult({ code: -32010, message: 'you may not' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'PLUGIN_ERROR');
});

test('upp errors · an unknown claimed code falls back to the integer, not to the claim', () => {
  const result = remoteToResult({ code: -32004, message: 'late', data: { code: 'NOT_A_CODE' } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TIMEOUT');
});

test('upp errors · a malformed remote error is still an answer, never a throw', () => {
  for (const junk of [undefined, null, 'boom', 42, [], {}, { code: 'x' }, { data: 7 }]) {
    const result = remoteToResult(junk);
    assert.equal(result.ok, false, String(junk));
    assert.equal(result.error.code, 'PLUGIN_ERROR');
    assert.equal(typeof result.error.message, 'string');
    assert.notEqual(result.error.message, '');
  }
});

test('upp errors · details are read strictly: one shape, or dropped', () => {
  assert.deepEqual(readDetails([{ path: 'a', message: 'b' }, { path: 1, message: 'b' },
    { message: 'no path' }, 'nope', null, { path: 'c', message: 'd', extra: 1 }]),
  [{ path: 'a', message: 'b' }, { path: 'c', message: 'd' }]);
  assert.deepEqual(readDetails('not an array'), []);
  const result = remoteToResult({ code: -32602, message: 'bad', data: { details: ['junk'] } });
  assert.equal(result.ok, false);
  assert.equal('details' in result.error, false, 'no details is better than junk details');
});
