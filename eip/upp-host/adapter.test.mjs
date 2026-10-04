// The adapter: an external plugin inside the EXISTING kernel, with no second runtime.
//
// U20 (approval before the transport, proved on a spy), U21 (no ports cross the seam), U24
// (dependency failures unchanged) and the validation halves of U22/U26 are decided here. The
// transport is a DOUBLE on purpose: the claim is about what the kernel does before and after
// a transport call, and a real child process would only make that harder to see.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createKernel } from '../kernel/index.mjs';
import { SDK_VERSION, definePlugin } from '../sdk/index.mjs';
import { manifestDigest } from './canonical.mjs';
import { NO_PORTS, registerUppPlugin } from './adapter.mjs';
import { MANIFEST_PATH } from './fixtures/harness.mjs';

const BASE = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

/** A plain in-process sibling, so the composition checks have something real to check.
 * @param {string} name @param {Record<string, { required: boolean }>} [inject] */
const sibling = (name, inject) => definePlugin({
  name,
  version: '1.0.0',
  sdk: SDK_VERSION,
  description: 'an in-process sibling used by the dependency tests',
  config: { type: 'object' },
  capabilities: { count: { description: 'count', consequential: false, input: {}, output: {} } },
  ...(inject === undefined ? {} : { inject }),
  apply: () => ({ count: () => 0 }),
});

/** A transport that records every call and answers from a table. @param {Record<string, unknown>} over
 * @param {Record<string, unknown>} [answers] */
function spyTransport(over = {}, answers = {}) {
  const manifest = { ...BASE, ...over };
  /** @type {Array<{ capability: string, input: unknown }>} */
  const calls = [];
  let shutdowns = 0;
  return {
    calls,
    shutdowns: () => shutdowns,
    id: String(manifest.id),
    runtime: /** @type {'process'} */ ('process'),
    manifest,
    digest: manifestDigest(manifest),
    capabilities: Object.keys(/** @type {Record<string, unknown>} */ (manifest.capabilities)),
    protocolVersion: () => '1.0',
    state: () => 'ready',
    /** @param {string} capability @param {unknown} input */
    execute: async (capability, input) => {
      calls.push({ capability, input });
      const answer = answers[capability];
      return answer === undefined
        ? { ok: /** @type {const} */ (true), value: { text: 'ok', deadlineMs: 1, sawEnvCanary: false } }
        : /** @type {import('../sdk/types.mjs').Result} */ (answer);
    },
    health: async () => ({ ok: /** @type {const} */ (true), value: { status: 'ok' } }),
    shutdown: async () => { shutdowns += 1; },
  };
}

test('adapter · the external plugin is a normal kernel plugin', async () => {
  const kernel = createKernel();
  const transport = spyTransport();
  const handle = registerUppPlugin(kernel, transport);
  assert.equal(handle.key, 'fixture.node-plugin');
  assert.deepEqual(kernel.list().map((m) => m.name), ['fixture.node-plugin']);
  await kernel.load(handle.key);

  const answer = await kernel.execute(handle.key, 'echo', { text: 'hi' });
  assert.equal(answer.ok, true);
  assert.deepEqual(transport.calls, [{ capability: 'echo', input: { text: 'hi' } }]);

  await kernel.dispose(handle.key);
  assert.equal(transport.shutdowns(), 1, 'dispose is the inverse, and it reaches the transport');
});

test('adapter · the kernel validates input BEFORE the transport is touched', async () => {
  const kernel = createKernel();
  const transport = spyTransport();
  const handle = registerUppPlugin(kernel, transport);
  await kernel.load(handle.key);
  const answer = await kernel.execute(handle.key, 'echo', { text: 7 });
  assert.equal(answer.ok, false);
  assert.equal(!answer.ok && answer.error.code, 'INPUT_INVALID');
  assert.deepEqual(transport.calls, [], 'an invalid input never leaves the host');
});

test('adapter · an output that breaks the contract is OUTPUT_INVALID, not a pass', async () => {
  const kernel = createKernel();
  const transport = spyTransport({}, { echo: { ok: true, value: { text: 42 } } });
  const handle = registerUppPlugin(kernel, transport);
  await kernel.load(handle.key);
  const answer = await kernel.execute(handle.key, 'echo', { text: 'hi' });
  assert.equal(answer.ok, false);
  assert.equal(!answer.ok && answer.error.code, 'OUTPUT_INVALID');
});

test('adapter · a consequential capability with no approver never reaches the transport', async () => {
  const kernel = createKernel();
  const transport = spyTransport();
  const handle = registerUppPlugin(kernel, transport);
  await kernel.load(handle.key);

  const refused = await kernel.execute(handle.key, 'destroy', {});
  assert.equal(refused.ok, false);
  assert.equal(!refused.ok && refused.error.code, 'APPROVAL_REQUIRED');
  assert.deepEqual(transport.calls, [], 'the side effect cannot have happened already');

  const approving = createKernel({ approver: () => ({ approved: true, by: 'test' }) });
  const second = spyTransport({}, { destroy: { ok: true, value: {} } });
  const other = registerUppPlugin(approving, second);
  await approving.load(other.key);
  assert.equal((await approving.execute(other.key, 'destroy', {})).ok, true);
  assert.deepEqual(second.calls, [{ capability: 'destroy', input: {} }]);
});

test('adapter · a denied approval also stops before the transport', async () => {
  const kernel = createKernel({ approver: () => ({ approved: false, by: 'test', reason: 'no' }) });
  const transport = spyTransport();
  const handle = registerUppPlugin(kernel, transport);
  await kernel.load(handle.key);
  const answer = await kernel.execute(handle.key, 'destroy', {});
  assert.equal(!answer.ok && answer.error.code, 'APPROVAL_DENIED');
  assert.deepEqual(transport.calls, []);
});

test('adapter · an external plugin declares permissions and receives no ports', async () => {
  const kernel = createKernel();
  const transport = spyTransport({ permissions: ['fs.write'] });
  const handle = registerUppPlugin(kernel, transport);
  assert.deepEqual(handle.manifest.permissions, ['fs.write'],
    'an operator must be able to READ what the plugin wants');
  await kernel.load(handle.key, {
    ports: { writeFile: { permission: 'fs.write', fn: async () => undefined } },
  });
  assert.deepEqual(handle.grantedPorts(), ['writeFile'],
    'the kernel granted the port by the declared permission, as it does for any plugin');
  assert.deepEqual(Object.keys(handle.forwardedPorts), [],
    'and the seam carried none of it: a port is an in-process function');
  assert.equal(handle.forwardedPorts, NO_PORTS);
});

test('adapter · dependencies go through the existing composition checks', async () => {
  const kernel = createKernel();
  const transport = spyTransport({ dependencies: { 'text.stats': { required: true } } });
  const handle = registerUppPlugin(kernel, transport);
  assert.deepEqual(handle.manifest.inject, { 'text.stats': { required: true } });

  await assert.rejects(() => kernel.load(handle.key), (/** @type {Error & { code?: string }} */ error) => {
    assert.equal(error.code, 'DEPENDENCY_MISSING');
    assert.match(error.message, /requires unregistered key/);
    return true;
  });

  // Registered is enough to LOAD: the kernel resolves a sibling lazily, at call time, and
  // that rule is untouched here. An external plugin in UPP 1.0 never makes that call — it
  // has no ports and no re-entry — so the declaration is enforced and the use is PROPOSED.
  kernel.register(sibling('text.stats'));
  await kernel.load(handle.key);
  assert.equal(kernel.isLoaded(handle.key), true);
  assert.equal(kernel.dependentsOf('text.stats').includes(handle.key), true);
});

test('adapter · a required cycle through an external manifest is refused at load', async () => {
  const kernel = createKernel();
  const handle = registerUppPlugin(kernel, spyTransport({ dependencies: { 'text.stats': { required: true } } }));
  kernel.register(sibling('text.stats', { [handle.key]: { required: true } }));
  await assert.rejects(() => kernel.load(handle.key), (/** @type {Error & { code?: string }} */ error) => {
    assert.equal(error.code, 'DEPENDENCY_CYCLE');
    return true;
  });
});

test('adapter · events carry the kernel shape and no stack ever reaches a result', async () => {
  const kernel = createKernel();
  const transport = spyTransport({}, {
    echo: { ok: false, error: { code: 'PLUGIN_ERROR', message: 'the plugin failed' } },
  });
  const handle = registerUppPlugin(kernel, transport);
  /** @type {Array<Record<string, unknown>>} */
  const seen = [];
  kernel.on('*', (event) => seen.push(/** @type {Record<string, unknown>} */ (event)));
  await kernel.load(handle.key);
  const answer = await kernel.execute(handle.key, 'echo', { text: 'hi' });
  assert.equal(!answer.ok && answer.error.code, 'PLUGIN_ERROR');
  assert.equal(JSON.stringify(answer).includes('at '), false, 'no stack in a result');
  const executed = seen.find((e) => e.type === 'execute');
  assert.deepEqual(Object.keys(executed ?? {}).sort(), ['at', 'cap', 'code', 'key', 'ms', 'ok', 'type']);
  assert.equal(seen.some((e) => e.type === 'error' && typeof e.stack === 'string'), true,
    'the stack lives in the diagnostic event, where it belongs');
});
