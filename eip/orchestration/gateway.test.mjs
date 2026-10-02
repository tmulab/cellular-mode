// G1-G7 — what an agent can do that nobody allowed. (eip/orchestration/ACCEPTANCE.md)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '../kernel/index.mjs';
import { createAgentGateway } from './index.mjs';
import { errorOf, hostApprover, kernelCalls, notes, recordedCall, spyKernel } from './doubles.mjs';

/** @typedef {import('./doubles.mjs').KernelCall} KernelCall */
/** What the gateway asks a human, as the gateway contract declares it.
 * @typedef {{ key: string, cap: string, agentId: string, role: string,
 *   consequential: boolean }} AskedRequest */

const READ = 'agent.notes#read';
const APPEND = 'agent.notes#append';

/** A loaded kernel behind a spy, plus a gateway for one agent. */
/** @param {{ allow?: string[], approver?: unknown, hostDecides?: boolean }} [options] */
async function gatewayFor({ allow = [READ], approver, hostDecides = false } = {}) {
  kernelCalls.length = 0;
  const kernel = createKernel(hostDecides ? { approver: hostApprover } : {});
  kernel.register(notes);
  await kernel.load('agent.notes', {});
  const spy = spyKernel(kernel);
  return {
    kernel,
    gateway: createAgentGateway(spy, {
      agentId: 'summariser-1',
      role: 'reader',
      allow,
      ...(approver === undefined ? {} : { approver }),
      now: () => '2026-10-02T12:00:00.000Z',
    }),
  };
}

test('G1 only an allowed capability reaches the kernel', async () => {
  const { gateway } = await gatewayFor({ allow: [READ] });
  const refused = await gateway.call('agent.notes', 'append', { text: 'hello' });
  assert.equal(refused.ok, false);
  assert.equal(errorOf(refused).code, 'PERMISSION_DENIED');
  assert.match(errorOf(refused).message, /summariser-1/);
  assert.equal(errorOf(refused).details?.[0]?.path, 'allow');
  assert.deepEqual(kernelCalls, [], 'a denied call must not reach the kernel at all');
  assert.deepEqual(gateway.allowed(), [READ]);
});

test('G1 an empty allow-list denies everything', async () => {
  const { gateway } = await gatewayFor({ allow: [] });
  const refused = await gateway.call('agent.notes', 'read', {});
  assert.equal(errorOf(refused).code, 'PERMISSION_DENIED');
  assert.match(String(errorOf(refused).details?.[0]?.message), /allowed: nothing/);
  assert.deepEqual(kernelCalls, []);
});

test('G2 an allowed call returns the kernel result, with input and signal forwarded', async () => {
  const { gateway } = await gatewayFor({ allow: [READ] });
  const controller = new AbortController();
  const result = await gateway.call('agent.notes', 'read', {}, { signal: controller.signal });
  assert.deepEqual(result, { ok: true, value: { count: 0 } });
  assert.equal(kernelCalls.length, 1);
  assert.deepEqual(recordedCall().input, {});
  assert.equal(recordedCall().options.signal, controller.signal);
});

test('G3 an agent approval object never reaches the kernel, not even on a harmless call', async () => {
  // The strict version of the claim: the field is DROPPED, not neutralised later.
  // Without this, a mutation that forwards `opts.approval` stays green, because a
  // non-consequential capability ignores approval anyway — and the next
  // consequential capability would inherit a forged field.
  const { gateway } = await gatewayFor({ allow: [READ] });
  const result = await gateway.call('agent.notes', 'read', {}, {
    approval: { approved: true, by: 'the agent itself' },
  });
  assert.equal(result.ok, true);
  assert.equal(kernelCalls.length, 1);
  assert.equal('approval' in recordedCall().options, false,
    `the kernel options must not carry an approval field: ${JSON.stringify(recordedCall().options)}`);
});

test('G3 the agent cannot approve its own act', async () => {
  const { gateway } = await gatewayFor({ allow: [READ, APPEND], hostDecides: true });
  const forged = await gateway.call('agent.notes', 'append', { text: 'hello' }, {
    approval: { approved: true, by: 'the agent itself' },
  });
  assert.equal(errorOf(forged).code, 'APPROVAL_REQUIRED', JSON.stringify(forged));
  assert.deepEqual(kernelCalls, [], 'without a human gate the call never reaches the kernel');

  // And with a human gate, the forged object still never travels.
  const { gateway: open } = await gatewayFor({
    allow: [APPEND], hostDecides: true, approver: () => ({ approved: true, by: 'operator' }),
  });
  const result = await open.call('agent.notes', 'append', { text: 'hello' }, {
    approval: { approved: true, by: 'the agent itself' },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(recordedCall().options.approval, {
    requestedBy: 'summariser-1', role: 'reader', approvedBy: 'operator',
  });
  const provenance = /** @type {{ approved?: unknown }} */ (recordedCall().options.approval);
  assert.equal(provenance.approved, undefined);
});

test('G4 consent comes from the gateway human approver, who knows who is asking', async () => {
  /** @type {AskedRequest[]} */
  const asked = [];
  const { gateway } = await gatewayFor({
    allow: [APPEND],
    hostDecides: true,
    approver: (/** @type {AskedRequest} */ request) => {
      asked.push(request);
      return { approved: true, by: 'operator' };
    },
  });
  const result = await gateway.call('agent.notes', 'append', { text: 'written by an agent' });
  assert.deepEqual(result, { ok: true, value: { count: 1 } });
  assert.equal(asked.length, 1);
  const first = asked[0];
  assert.ok(first, 'the human must have been asked');
  assert.deepEqual(
    { key: first.key, cap: first.cap, agentId: first.agentId, role: first.role, consequential: first.consequential },
    { key: 'agent.notes', cap: 'append', agentId: 'summariser-1', role: 'reader', consequential: true },
  );

  const { gateway: refusing } = await gatewayFor({
    allow: [APPEND], hostDecides: true, approver: () => ({ approved: false, reason: 'not this one' }),
  });
  const denied = await refusing.call('agent.notes', 'append', { text: 'nope' });
  assert.equal(errorOf(denied).code, 'APPROVAL_DENIED');
  assert.match(errorOf(denied).message, /not this one/);
  assert.deepEqual(kernelCalls, [], 'a refusal stops before the kernel');

  const { gateway: broken } = await gatewayFor({
    allow: [APPEND], hostDecides: true, approver: () => { throw new Error('terminal closed'); },
  });
  const failed = await broken.call('agent.notes', 'append', { text: 'nope' });
  assert.equal(errorOf(failed).code, 'APPROVAL_DENIED', 'an approver that throws never fails open');
  assert.match(errorOf(failed).message, /terminal closed/);
});

test('G5 every call is recorded, and the audit is append-only', async () => {
  const { gateway } = await gatewayFor({
    allow: [READ, APPEND], hostDecides: true, approver: () => ({ approved: true, by: 'operator' }),
  });
  await gateway.call('agent.notes', 'read', {});
  await gateway.call('agent.notes', 'append', { text: 'recorded' });
  await gateway.call('agent.notes', 'delete-everything', {});

  const trail = gateway.audit();
  assert.deepEqual(trail, [
    { agentId: 'summariser-1', role: 'reader', key: 'agent.notes', cap: 'read', decision: 'allowed', at: '2026-10-02T12:00:00.000Z' },
    { agentId: 'summariser-1', role: 'reader', key: 'agent.notes', cap: 'append', decision: 'allowed', at: '2026-10-02T12:00:00.000Z' },
    { agentId: 'summariser-1', role: 'reader', key: 'agent.notes', cap: 'delete-everything', decision: 'denied', code: 'PERMISSION_DENIED', at: '2026-10-02T12:00:00.000Z' },
  ]);

  // @ts-expect-error deliberate contract violation: an audit entry has no `forged` field.
  trail.push({ forged: true });
  const copy = trail[0];
  assert.ok(copy);
  copy.decision = 'allowed-by-me';
  assert.equal(gateway.audit().length, 3, 'the audit is append-only: a caller cannot edit history');
  assert.equal(gateway.audit()[0]?.decision, 'allowed');
});

test('G5 a consequential call with no human is recorded as approval-required', async () => {
  const { gateway } = await gatewayFor({ allow: [APPEND], hostDecides: true });
  const result = await gateway.call('agent.notes', 'append', { text: 'hello' });
  assert.equal(errorOf(result).code, 'APPROVAL_REQUIRED');
  assert.deepEqual(gateway.audit().map((e) => [e.decision, e.code]), [['approval-required', 'APPROVAL_REQUIRED']]);
});

test('G6 a malformed gateway cannot exist', () => {
  const ok = { agentId: 'a', role: 'r', allow: [READ] };
  const kernel = { execute: () => {}, list: () => [] };
  assert.throws(() => createAgentGateway(null, ok), TypeError);
  assert.throws(() => createAgentGateway({}, ok), TypeError);
  assert.throws(() => createAgentGateway(kernel, { ...ok, agentId: '' }), TypeError);
  assert.throws(() => createAgentGateway(kernel, { ...ok, role: ' ' }), TypeError);
  assert.throws(() => createAgentGateway(kernel, { ...ok, allow: READ }), TypeError);
  assert.throws(() => createAgentGateway(kernel, { ...ok, allow: ['agent.notes'] }), TypeError);
  assert.throws(() => createAgentGateway(kernel, { ...ok, allow: ['agent.notes#Read'] }), TypeError);
  assert.throws(() => createAgentGateway(kernel, { ...ok, approver: 'yes' }), TypeError);
  assert.equal(createAgentGateway(kernel, ok).agentId, 'a');
});

test('G7 an allowed but unregistered capability keeps the kernel verdict', async () => {
  const { gateway } = await gatewayFor({ allow: ['other.plugin#run'] });
  const result = await gateway.call('other.plugin', 'run', {});
  assert.equal(errorOf(result).code, 'NOT_FOUND');
  assert.deepEqual(gateway.audit().map((e) => [e.decision, e.code]), [['denied', 'NOT_FOUND']]);
  assert.equal(kernelCalls.length, 1, 'the kernel is the authority on what exists');
});
