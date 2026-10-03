// A1, A2, A3, A16, A17 — observer.audit behaves like a PLUGIN.
//
// Not a rule suite (that is observer-audit/audit.test.mjs): these tests ask whether it
// declares what it provides, sees only the ports it declared, leaves nothing behind, refuses
// malformed input with the exact code the contract names, and — the claim the whole feature
// rests on — changes not one byte of the project it judges.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '../kernel/index.mjs';
import { errorOf, kernelError, valueOf } from '../kernel/assertions.mjs';
import {
  BOUNDARY_BREAKER, CAPABILITY_IDS, FAKE_SECRET, OVERSIZED_MODULE, SAMPLE_INPUTS,
  hashTree, loadAuditor, observerAudit, startAuditHost,
} from './observer-audit-fixture.mjs';

/** @type {(value: unknown) => Record<string, unknown>} */
const asRecord = (value) => /** @type {Record<string, unknown>} */ (value);
/** @type {(value: unknown) => Array<Record<string, unknown>>} */
const findingsOf = (value) => /** @type {Array<Record<string, unknown>>} */ (asRecord(value)['findings']);

test('A1 the manifest declares one permission, one required sibling, two read-only capabilities', () => {
  const kernel = createKernel();
  kernel.register(observerAudit);
  const [described] = kernel.list();
  assert.equal(described?.name, 'observer.audit');
  assert.deepEqual(described?.permissions, ['fs.read']);
  assert.deepEqual(described?.inject, { 'observer.state': { required: true } });
  assert.deepEqual(Object.keys(described?.capabilities ?? {}).sort(), [...CAPABILITY_IDS].sort());
  for (const [id, cap] of Object.entries(described?.capabilities ?? {})) {
    assert.equal(cap.consequential, false, `${id} must not be consequential: auditing is reading`);
    assert.ok(cap.description.length > 20, `${id} needs a description a human can read`);
  }
  assert.equal(described?.devUi, undefined);
});

test('A2 the plugin sees its four read ports and NOTHING that writes or spawns', async () => {
  const o = await loadAuditor();
  try {
    const names = /** @type {() => string[]} */ (o.service()['portNames'])();
    assert.deepEqual(names, ['listCells', 'listRepoFiles', 'readEvidence', 'readHead', 'readRepoFile', 'readVault']);
    assert.equal(names.includes('writeFile'), false, 'an undeclared port is invisible, not refused');
    // Stronger than checking one name: nothing in reach can write, spawn, fetch or exec.
    const forbidden = names.filter((name) => /write|spawn|exec|fetch|run|exit|kill/i.test(name));
    assert.deepEqual(forbidden, []);
  } finally {
    await o.cleanup();
  }
});

test('A1 the sibling is REQUIRED: without observer.state the auditor does not load at all', async () => {
  const kernel = createKernel();
  kernel.register(observerAudit);
  await assert.rejects(() => kernel.load('observer.audit', { ports: {} }), (cause) => {
    // The kernel answers first: a required inject that is not even registered is a
    // composition error, so the auditor never reaches the point of re-reading a vault.
    assert.equal(kernelError(cause).code, 'DEPENDENCY_MISSING');
    assert.ok(kernelError(cause).details.some((detail) => detail.path === 'inject.observer.state'));
    return true;
  });
  assert.equal(kernel.isLoaded('observer.audit'), false);
});

test('A2 a host that grants no repository port makes the plugin refuse to load', async () => {
  const o = await loadAuditor();
  try {
    await o.kernel.dispose('observer.audit');
    await assert.rejects(() => o.kernel.load('observer.audit', { ports: {} }), (cause) => {
      assert.match(String(asRecord(cause)['message']), /are mandatory for observer\.audit; missing:/);
      return true;
    });
    assert.equal(o.kernel.isLoaded('observer.audit'), false, 'a refused load leaves nothing loaded');
  } finally {
    await o.cleanup();
  }
});

test('A3 run-audit then dispose leaves zero residue, and findings goes back to "never run"', async () => {
  const o = await loadAuditor();
  try {
    const first = valueOf(await o.call('findings'));
    assert.equal(asRecord(first)['ran'], false);
    assert.deepEqual(findingsOf(first).map((f) => f['status']), ['UNAVAILABLE']);
    assert.equal(asRecord(first)['at'], null);
    assert.equal(asRecord(asRecord(first)['summary'])['PASS'], 0, 'never run is never a PASS');

    valueOf(await o.call('run-audit'));
    const hasResult = /** @type {() => boolean} */ (o.service()['hasResult']);
    assert.equal(hasResult(), true);
    assert.equal(asRecord(valueOf(await o.call('findings')))['ran'], true);

    await o.kernel.dispose('observer.audit');
    // The result was an EFFECT, so it had an inverse: the held audit is gone, the service is
    // gone from the kernel, and a call answers the KERNEL's NOT_FOUND rather than a throw.
    assert.equal(hasResult(), false);
    assert.throws(() => o.kernel.get('observer.audit'), (cause) => kernelError(cause).code === 'NOT_FOUND');
    assert.equal(errorOf(await o.call('findings')).code, 'NOT_FOUND');
    await assert.rejects(() => o.kernel.dispose('observer.audit'),
      (cause) => kernelError(cause).code === 'NOT_FOUND');
    assert.equal(o.kernel.list().length, 2, 'both manifests stay registered: dispose is reversible');
  } finally {
    await o.cleanup();
  }
});

test('A3 a full audit leaves every byte of the project identical', async () => {
  const o = await loadAuditor();
  try {
    const before = hashTree(o.root);
    for (const [cap, input] of Object.entries(SAMPLE_INPUTS)) valueOf(await o.call(cap, input));
    valueOf(await o.call('findings', { status: 'FAIL' }));
    assert.deepEqual(hashTree(o.root), before, 'the auditor is read-only in BYTES, not by intention');
    assert.ok(Object.keys(before).length > 3, 'the hash tree is not vacuously empty');
  } finally {
    await o.cleanup();
  }
});

test('A16 findings validates its own input, with the code and the path the contract names', async () => {
  const o = await loadAuditor();
  try {
    for (const [input, path] of /** @type {Array<[unknown, string]>} */ ([
      [{ status: 'GREEN' }, 'status'],
      [{ status: 'pass' }, 'status'],
      [{ scope: 'cell:Bad Id' }, 'scope'],
      [{ scope: '../escape' }, 'scope'],
      [{ nope: 1 }, 'nope'],
      [{ status: 7 }, 'status'],
    ])) {
      const error = errorOf(await o.call('findings', input), `${JSON.stringify(input)} must be refused`);
      assert.equal(error.code, 'INPUT_INVALID', JSON.stringify(input));
      assert.ok(error.details?.some((detail) => detail.path.includes(path)),
        `expected a detail about "${path}", got ${JSON.stringify(error.details)}`);
    }
    valueOf(await o.call('run-audit'));
    assert.ok(Array.isArray(findingsOf(valueOf(await o.call('findings', { status: 'PASS', scope: 'project' })))));
  } finally {
    await o.cleanup();
  }
});

test('A7, A8, A17 planted violations are found, by address, with no secret and no absolute path', async () => {
  const o = await loadAuditor({
    plant: {
      'tools/long.mjs': OVERSIZED_MODULE,
      'tools/cellmode/bad.mjs': BOUNDARY_BREAKER,
      'config/local.mjs': `export const key = '${FAKE_SECRET}';\n`,
    },
  });
  try {
    const result = valueOf(await o.call('run-audit'));
    const found = findingsOf(result);
    /** @type {(rule: string) => Array<Record<string, unknown>>} */
    const byRule = (rule) => found.filter((finding) => finding['rule'] === rule);
    /** @type {(finding: Record<string, unknown> | undefined) => string[]} */
    const evidenceOf = (finding) => /** @type {string[]} */ (finding?.['evidence'] ?? []);
    assert.deepEqual(byRule('file-size').map((f) => f['status']), ['FAIL']);
    assert.equal(evidenceOf(byRule('file-size')[0])[0], 'tools/long.mjs');
    assert.deepEqual(byRule('import-boundaries').map((f) => f['status']), ['FAIL']);
    assert.ok(byRule('secrets').length >= 1);
    assert.deepEqual([...new Set(byRule('secrets').map((f) => f['status']))], ['FAIL']);

    const serialised = JSON.stringify(result);
    assert.equal(serialised.includes(FAKE_SECRET), false, 'the matched secret never travels');
    assert.equal(/[A-Za-z]:[\\/]/.test(serialised), false, 'no drive-letter path in the answer');
    assert.equal(serialised.includes(o.root.split('\\').join('/')), false, 'no host root in the answer');
    // The three legs have no record in a temp project, so they are UNAVAILABLE — and the
    // summary says so rather than quietly leaving them out.
    const summary = asRecord(asRecord(result)['summary']);
    assert.ok(Number(summary['UNAVAILABLE']) >= 3, JSON.stringify(summary));
    assert.deepEqual(byRule('typecheck').map((f) => f['status']), ['UNAVAILABLE']);
  } finally {
    await o.cleanup();
  }
});

test('A3 removing the plugin removes the feature and nothing else', async () => {
  const withAudit = await startAuditHost();
  /** @type {Record<string, string>} */
  let hashes = {};
  try {
    assert.equal((await withAudit.post('run-audit')).status, 200);
    hashes = hashTree(withAudit.root);
  } finally {
    await withAudit.cleanup();
  }
  const without = await startAuditHost({ withAudit: false });
  try {
    const answer = await without.post('run-audit');
    assert.equal(answer.status, 404, 'no plugin, no capability');
    assert.equal((await without.post('overview', {}, 'observer.state')).status, 200, 'the dashboard still works');
    const theirs = hashTree(without.root);
    assert.deepEqual(Object.keys(theirs).sort(), Object.keys(hashes).sort(),
      'the same project files exist either way: the auditor adds and removes nothing');
  } finally {
    await without.cleanup();
  }
});
