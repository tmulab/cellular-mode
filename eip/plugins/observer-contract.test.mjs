// O1, O2, O3, O7 — observer.state behaves like a PLUGIN.
//
// Not a domain suite: these tests ask whether it declares what it provides, sees only
// the ports it declared, leaves nothing behind, and refuses malformed input with the
// exact code the contract names. Every assertion names a code, because "it failed" is
// the shape of a false green.
import test from 'node:test';
import assert from 'node:assert/strict';
import observerState from './observer-state/index.mjs';
import { CAPABILITY_IDS, EXPECTED, loadObserver } from './observer-fixture.mjs';
import { errorOf, kernelError, valueOf } from '../kernel/assertions.mjs';
import { createKernel } from '../kernel/index.mjs';
import { PASSTHROUGH_CODES } from '../sdk/index.mjs';

/** A CLIENT error a plugin reported as its own. `NOT_FOUND` and `INPUT_INVALID` are
 * the SDK's PASSTHROUGH_CODES, so the kernel answers with the plugin's code and
 * message; anything else would mean the plugin had been contained as a fault.
 * @type {(result: import('../sdk/types.mjs').Result, code: string) => void} */
function refusedAs(result, code) {
  const error = errorOf(result);
  assert.ok(PASSTHROUGH_CODES.includes(code), `${code} is not a passthrough code`);
  assert.equal(error.code, code, `expected ${code}, got ${JSON.stringify(error)}`);
  assert.equal(error.details?.[0]?.path, 'id');
  assert.equal('stack' in error, false);
}

test('O1 the manifest declares one permission, five read-only capabilities, no inject', () => {
  const kernel = createKernel();
  kernel.register(observerState);
  const [described] = kernel.list();
  assert.ok(described !== undefined);
  assert.equal(described.name, 'observer.state');
  assert.deepEqual(described.permissions, ['fs.read']);
  assert.deepEqual(described.inject, {});
  assert.deepEqual(Object.keys(described.capabilities).sort(), [...CAPABILITY_IDS].sort());
  for (const [id, cap] of Object.entries(described.capabilities)) {
    assert.equal(cap.consequential, false, `${id} must not be consequential: reading is not an act`);
    assert.ok(cap.description.length > 20, `${id} needs a description a human can read`);
  }
  // No dev UI: the observer has its own application, and a diagnostics page that
  // duplicated it would be a second frontend to keep in step.
  assert.equal(described.devUi, undefined);
});

test('O2 the plugin sees the read ports and NOT a write port the host also offers', async () => {
  const o = await loadObserver({ offerWritePort: true });
  try {
    // The host DID offer `writeFile`; the plugin declared only fs.read, so there is
    // no handle to misuse. Asked from INSIDE the plugin, which is the only place the
    // answer means anything.
    const service = o.service();
    const names = /** @type {() => string[]} */ (service.portNames)();
    assert.deepEqual(names, ['listCells', 'readVault']);
    assert.equal(names.includes('writeFile'), false, 'an undeclared port is invisible, not refused');
    assert.ok(valueOf(await o.call('overview')).counts, 'the read ports do work');
  } finally {
    await o.cleanup();
  }
});

test('O2 the kernel records which ports were granted and which were withheld', async () => {
  const kernel = createKernel();
  /** @type {import('../sdk/types.mjs').KernelEvent[]} */
  const seen = [];
  kernel.on('load', (event) => seen.push(event));
  kernel.register(observerState);
  const o = await loadObserver({ offerWritePort: true });
  try {
    /** @type {import('../sdk/types.mjs').KernelEvent[]} */
    const loads = [];
    o.kernel.on('load', (event) => loads.push(event));
    await o.kernel.dispose('observer.state');
    await o.kernel.load('observer.state', {
      ports: { ...(await import('../host/read-port.mjs')).createVaultReadPorts(o.root),
        writeFile: (await import('../host/write-port.mjs')).createWritePort(o.root) },
    });
    const [event] = loads;
    assert.deepEqual(event?.grantedPorts?.slice().sort(), ['listCells', 'readVault']);
    assert.deepEqual(event?.deniedPorts, ['writeFile']);
  } finally {
    await o.cleanup();
  }
  assert.deepEqual(seen, [], 'the throwaway kernel loaded nothing');
});

test('O2 a host that grants no fs.read port at all makes the plugin refuse to load', async () => {
  const kernel = createKernel();
  kernel.register(observerState);
  await assert.rejects(() => kernel.load('observer.state', { ports: {} }), (cause) => {
    assert.match(String(/** @type {{ message?: unknown }} */ (cause).message),
      /ports "readVault" and "listCells" \(permission fs\.read\) are mandatory/);
    return true;
  });
  assert.equal(kernel.isLoaded('observer.state'), false, 'a refused load leaves nothing loaded');
});

test('O3 load then dispose leaves zero residue', async () => {
  const o = await loadObserver();
  try {
    valueOf(await o.call('overview'));
    valueOf(await o.call('cells'));
    const counts = /** @type {() => number} */ (o.service().callCounts);
    assert.equal(counts(), 2, 'the in-memory counter saw both calls');
    await o.kernel.dispose('observer.state');
    assert.equal(o.kernel.isLoaded('observer.state'), false);
    // The counter was an EFFECT, so it had an inverse: the Map is cleared, and the
    // service object is gone from the kernel entirely.
    assert.equal(counts(), 0);
    assert.throws(() => o.kernel.get('observer.state'), (e) => kernelError(e).code === 'NOT_FOUND');
    // After dispose the KERNEL answers, so this is a real NOT_FOUND and not a
    // contained plugin throw: the difference is the point of the two shapes.
    assert.equal(errorOf(await o.call('overview')).code, 'NOT_FOUND');
    await assert.rejects(() => o.kernel.dispose('observer.state'),
      (e) => kernelError(e).code === 'NOT_FOUND');
    // Still registered, so it can be loaded again: dispose is reversible, not destructive.
    assert.equal(o.kernel.list().length, 1);
  } finally {
    await o.cleanup();
  }
});

test('O7 a malformed id is INPUT_INVALID at the kernel gate, before the plugin runs', async () => {
  const o = await loadObserver();
  try {
    /** @type {Array<[unknown, string]>} */
    const atTheGate = [
      [{}, 'id'],
      [{ id: 7 }, 'id'],
      [{ id: '' }, 'id'],
      [{ id: 'a'.repeat(81) }, 'id'],
      [{ id: EXPECTED.activeId, extra: 'x' }, 'extra'],
    ];
    for (const [input, path] of atTheGate) {
      const error = errorOf(await o.call('cell-detail', input), `${JSON.stringify(input)} must be refused`);
      assert.equal(error.code, 'INPUT_INVALID', JSON.stringify(input));
      assert.ok(error.details?.some((d) => d.path.includes(path)),
        `expected a detail about "${path}", got ${JSON.stringify(error.details)}`);
    }
    // The charset half of the contract: the SDK subset has no `pattern`, so the
    // plugin names the code itself and the kernel contains it.
    for (const id of ['Tag-Filter', 'tag filter', '../log', 'tag_filter', 'cells/x']) {
      refusedAs(await o.call('cell-detail', { id }), 'INPUT_INVALID');
    }
    // An id that is WELL FORMED but names nothing is a different answer, and it never
    // reaches the filesystem: the id is matched against the parsed index.
    refusedAs(await o.call('cell-detail', { id: 'no-such-cell' }), 'NOT_FOUND');
    // And the two answers are genuinely different codes, not one code with two
    // messages: that is the whole reason the passthrough exists.
    assert.notEqual(errorOf(await o.call('cell-detail', { id: 'no-such-cell' })).code,
      errorOf(await o.call('cell-detail', { id: 'Bad-Id' })).code);
  } finally {
    await o.cleanup();
  }
});

test('O7 timeline validates its own input at both gates', async () => {
  const o = await loadObserver();
  try {
    for (const input of [{ limit: 0 }, { limit: 501 }, { limit: 1.5 }, { limit: '10' }, { cell: 7 }, { nope: 1 }]) {
      assert.equal(errorOf(await o.call('timeline', input)).code, 'INPUT_INVALID', JSON.stringify(input));
    }
    refusedAs(await o.call('timeline', { cell: 'Tag-Filter' }), 'INPUT_INVALID');
    assert.ok(Array.isArray(valueOf(await o.call('timeline', { limit: 1 })).events));
    assert.ok(Array.isArray(valueOf(await o.call('timeline')).events), 'no input at all is valid');
  } finally {
    await o.cleanup();
  }
});
