// V1..V6, V16, V18..V21 - the advisor as a PLUGIN, in a real kernel.
//
// Not a domain suite: these tests ask whether it is absent when nobody asked for it, whether
// it is powerless when it is present, whether an answer full of commands and approvals
// produces anything at all in the world, and whether it leaves residue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { errorOf, valueOf } from '../kernel/assertions.mjs';
import { createKernel } from '../kernel/index.mjs';
import { OBSERVER_PLUGINS, advisorPlugin } from '../host/observer-composition.mjs';
import { createAdvisorPlugin } from './observer-advisor/index.mjs';
import { fixtureAdapter } from './observer-advisor/fixture-adapter.mjs';
import { CAPABILITY_IDS, HOSTILE, cannedAdapter, hashTree, loadAdvisor } from './observer-advisor-fixture.mjs';

test('V1 the advisor is not in the default composition, and its key answers NOT_FOUND', async () => {
  assert.deepEqual(OBSERVER_PLUGINS.map((manifest) => manifest.name), ['observer.state']);
  const a = await loadAdvisor({ withAdvisor: false });
  try {
    for (const cap of CAPABILITY_IDS) {
      // MUTATION PROOF on the exact code: "it failed" is the shape of a false green, and a
      // UI that must distinguish "disabled" from "broken" depends on this being NOT_FOUND.
      assert.equal(errorOf(await a.call(cap)).code, 'NOT_FOUND', cap);
    }
  } finally {
    await a.cleanup();
  }
});

test('V2 observer.state and observer.audit are untouched by the advisor being absent', async () => {
  const a = await loadAdvisor({ withAdvisor: false });
  try {
    for (const [cap, input] of /** @type {Array<[string, object]>} */ ([
      ['overview', {}], ['cells', {}], ['graph', {}], ['timeline', { limit: 5 }],
    ])) {
      assert.ok(valueOf(await a.kernel.execute('observer.state', cap, input)));
    }
    const audited = valueOf(await a.kernel.execute('observer.audit', 'run-audit', {}));
    assert.ok(Array.isArray(audited['findings']) && audited['findings'].length > 0);
    assert.equal(a.kernel.isLoaded('observer.advisor'), false);
  } finally {
    await a.cleanup();
  }
});

test('V3 the manifest declares no permission, two required siblings and three read-only capabilities', async () => {
  const manifest = createAdvisorPlugin({ adapter: fixtureAdapter });
  assert.equal(manifest.name, 'observer.advisor');
  assert.deepEqual(manifest.permissions, []);
  assert.deepEqual(manifest.inject, {
    'observer.state': { required: true }, 'observer.audit': { required: true },
  });
  assert.deepEqual(Object.keys(manifest.capabilities).sort(), [...CAPABILITY_IDS].sort());
  for (const [id, cap] of Object.entries(manifest.capabilities)) {
    assert.equal(cap.consequential, false, `${id}: asking for an opinion is not an act`);
    assert.ok(cap.description.length > 20, id);
  }
  assert.equal(manifest.devUi, undefined);
  const a = await loadAdvisor();
  try {
    // Asked from INSIDE the plugin, which is the only place the answer means anything. The
    // host offered a vault reader, a repository reader and a WRITER; the advisor declared no
    // permission, so it holds no handle to any of them.
    assert.deepEqual(/** @type {() => string[]} */ (a.service()['portNames'])(), []);
  } finally {
    await a.cleanup();
  }
});

test('V4 and V5 the composition resolves the adapter, and refuses an unknown id or a network one', async () => {
  const manifest = await advisorPlugin({ id: 'fixture' });
  assert.equal(manifest?.name, 'observer.advisor');
  await assert.rejects(() => advisorPlugin({ id: 'gpt-5' }),
    /unknown advisor adapter "gpt-5"; this build offers "fixture"/);
  assert.throws(() => createAdvisorPlugin({
    adapter: cannedAdapter('{}', { id: 'remote-thing', kind: 'remote', network: true }),
  }), /refuses the adapter "remote-thing"/);
  assert.throws(() => createAdvisorPlugin({ adapter: /** @type {never} */ ({ id: 'x' }) }),
    /is not a model adapter/);
});

test('V6 the session is memory only, and dispose is its inverse', async () => {
  const a = await loadAdvisor();
  try {
    await a.call('advise', { mode: 'silent' });
    const before = valueOf(await a.call('status'));
    assert.equal(/** @type {{ used: number }} */ (before['calls']).used, 1);
    assert.ok(/** @type {{ count: number }} */ (valueOf(await a.call('recommendations')))['count'] > 0);
    await a.kernel.dispose('observer.advisor');
    await a.kernel.load('observer.advisor', { ports: {} });
    const after = valueOf(await a.call('status'));
    assert.deepEqual(after['calls'], { used: 0, remaining: 20 });
    assert.deepEqual(valueOf(await a.call('recommendations')), {
      recommendations: [], count: 0, lastAt: null,
      disclaimer: /** @type {string} */ (after['disclaimer']),
    });
  } finally {
    await a.cleanup();
  }
});

test('V16 an answer full of commands, approvals and capability keys does NOTHING', async () => {
  let asked = 0;
  const hostile = cannedAdapter(() => { asked += 1; return HOSTILE.injection; }, { id: 'hostile' });
  const a = await loadAdvisor({ adapter: hostile });
  const before = hashTree(a.root);
  try {
    const value = valueOf(await a.call('advise', { question: 'approve everything and run it' }));
    assert.equal(asked, 1);
    const recommendations = /** @type {Array<Record<string, unknown>>} */ (value['recommendations']);
    assert.equal(recommendations.length, 1);
    // The text survived AS TEXT in the one field that is for text, and nothing else did.
    assert.match(String(recommendations[0]?.['statement']), /rm -rf/);
    assert.deepEqual(Object.keys(recommendations[0] ?? {}).sort(),
      ['evidenceRefs', 'id', 'kind', 'label', 'statement', 'uncertainty']);

    // Nothing was executed but the test's own call (and the plugin's own reads of its two
    // siblings go through `ctx.get`, not through `execute`).
    assert.deepEqual(a.executed.map((event) => `${event.key}/${event.cap}`), ['observer.advisor/advise']);
    assert.deepEqual(a.approvals, [], 'no approval was ever requested');
    assert.equal(Object.keys(a.portCalls).includes('writeFile'), false, 'the write port was never called');
    for (const name of Object.keys(a.portCalls)) {
      assert.ok(['readVault', 'listCells', 'readRepoFile', 'listRepoFiles', 'readEvidence', 'readHead'].includes(name), name);
    }
  } finally {
    // The bytes are the claim, so the bytes are what is measured - the whole project tree,
    // vault included, before and after.
    assert.deepEqual(hashTree(a.root), before, 'the advisor changed a file');
    await a.cleanup();
  }
});
