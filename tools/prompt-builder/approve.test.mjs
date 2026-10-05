// The approval boundary: what it refuses, what it does NOT do, and where the file lands.
//
// Three claims are asserted mechanically here rather than trusted to a comment:
//   1. approve.mjs imports nothing that can run a program or touch a disk — the import list of
//      the source file is read and checked. "The Builder never runs git" has to be a property
//      of the module, not a sentence in its header.
//   2. approval changes no entry's status. A PROPOSED objective is still PROPOSED afterwards.
//   3. `writeContract` writes inside vault/ and nowhere else, and refuses twice over.
//
// RULE FOR THIS FILE: it writes exclusively inside the directory `mkdtemp` created for it, and
// removes exactly that directory. Every needle is assembled from fragments at runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approveContract, isApproved } from './approve.mjs';
import { codeOf, detailsOf } from './errors.mjs';
import { readyContract } from './fixtures/index.mjs';
import { CONTRACT_REL, readContract, vaultPath, writeContract } from './store.mjs';

const NOW = '2026-10-04T12:00:00.000Z';
/** @type {(...parts: string[]) => string} */
const j = (...parts) => parts.join('');
/** @type {string[]} */
const created = [];

function freshRoot() {
  const root = mkdtempSync(join(tmpdir(), 'builder-approve-'));
  created.push(root);
  return root;
}

test.after(() => {
  for (const root of created) {
    assert.ok(root.includes('builder-approve-'), `refusing to remove ${root}`);
    rmSync(root, { recursive: true, force: true });
  }
});

/** @type {(edit?: (c: any) => void) => any} */
function contract(edit) {
  const copy = structuredClone(readyContract);
  if (edit !== undefined) edit(copy);
  return copy;
}

/** @type {(action: () => unknown) => { code: string | null, details: unknown }} */
function refusal(action) {
  try {
    action();
    return { code: null, details: undefined };
  } catch (error) {
    return { code: codeOf(error), details: detailsOf(error) };
  }
}

test('approve · it imports nothing that can run a program or touch a disk', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'approve.mjs'), 'utf8');
  const specifiers = [...source.matchAll(/^import[^']*'([^']+)'/gm)].map((m) => m[1]);
  assert.ok(specifiers.length > 0, 'the import list must be readable');
  for (const specifier of specifiers) {
    assert.ok(specifier?.startsWith('./'), `approve.mjs may only import its own neighbours, found ${specifier}`);
  }
  for (const forbidden of [j('child', '_', 'process'), j('node', ':', 'fs'), 'simple-git', 'execSync', 'spawn']) {
    assert.ok(!source.includes(forbidden), `approve.mjs must not mention ${forbidden}`);
  }
});

test('approve · without confirm it refuses, and says nothing else', () => {
  for (const confirm of [undefined, false, 'yes', 1]) {
    const { code } = refusal(() => approveContract(contract(), { confirm, now: NOW }));
    assert.equal(code, 'NEEDS_CONFIRMATION');
  }
  // Asked FIRST: an unconfirmed caller is not handed the list of things to clear.
  const unready = contract((c) => { c.acceptance = []; });
  assert.equal(refusal(() => approveContract(unready, { confirm: false, now: NOW })).code, 'NEEDS_CONFIRMATION');
});

test('approve · a contract that is not ready is refused, with its blockers', () => {
  const unready = contract((c) => { c.objective = { value: '', status: 'UNKNOWN', basis: 'not yet asked' }; });
  const { code, details } = refusal(() => approveContract(unready, { confirm: true, now: NOW }));
  assert.equal(code, 'NOT_READY');
  assert.deepEqual(/** @type {any} */ (details).blockers.map((/** @type {any} */ b) => b.field), ['objective']);
});

test('approve · a contract that is not fit to publish is refused, with its findings', () => {
  /** @type {(field: string, text: string) => any} */
  const saying = (field, text) => contract((c) => { c[field] = { value: text, status: 'DECLARED' }; });
  const cases = [
    [j('g', 'h', 'p', '_', 'A1b2C3d4E5f6G7h8I9j0'), 'forge-token'],
    [j('C', ':', '\\', 'work', '\\', 'list'), 'windows-path'],
    [j('ada', '@', 'example', '.', 'org'), 'email-address'],
  ];
  for (const [needle, kind] of cases) {
    const { code, details } = refusal(() => approveContract(saying('environment', `see ${needle}`), { confirm: true, now: NOW }));
    assert.equal(code, 'PUBLICATION_CHECK', `${kind} must refuse approval`);
    assert.deepEqual(/** @type {any} */ (details).findings, [{ path: 'environment.value', kind }]);
    assert.ok(!JSON.stringify(details).includes(String(needle)), 'the refusal never copies the value');
  }
});

test('approve · a bad clock is refused, and only an ISO instant is recorded', () => {
  assert.equal(refusal(() => approveContract(contract(), { confirm: true, now: 'today' })).code, 'BAD_ENTRY');
  assert.equal(refusal(() => approveContract(contract(), { confirm: true })).code, 'BAD_ENTRY');
});

test('approve · it records the approval, refreshes openQuestions, and mutates nothing', () => {
  const base = contract();
  const frozen = JSON.stringify(base);
  const out = approveContract(base, { confirm: true, now: NOW });
  assert.deepEqual(out.approval, { approved: true, at: NOW });
  assert.equal(isApproved(out), true);
  assert.equal(isApproved(base), false);
  assert.deepEqual(out.openQuestions, []);
  assert.equal(JSON.stringify(base), frozen, 'the input contract is untouched');
});

test('approve · it changes no epistemic label, and no decision', () => {
  const base = contract((c) => {
    c.technologies.proposed = [{ value: 'Deno', status: 'PROPOSED', basis: 'recommendation:technologies' }];
    c.risks = [{ value: 'read from the manifest', status: 'INFERRED', basis: 'package.json' }];
    c.decisions = [{ id: 'D1', question: 'Which runtime?', proposal: 'Deno', status: 'pending', at: NOW }];
  });
  const out = approveContract(base, { confirm: true, now: NOW });
  assert.deepEqual(out.technologies, base.technologies, 'a PROPOSED entry stays PROPOSED');
  assert.deepEqual(out.risks, base.risks, 'an INFERRED entry is never promoted');
  assert.deepEqual(out.decisions, base.decisions, 'approval settles no decision');
  assert.deepEqual(out.scope, base.scope);
  // The pending decision is still an open question after approval; it was not silently closed.
  assert.equal(out.openQuestions.length, 1);
  assert.equal(out.openQuestions[0]?.id, 'Q1');
});

test('approve · the result carries nothing that looks like a side effect', () => {
  const out = approveContract(contract(), { confirm: true, now: NOW });
  const keys = Object.keys(out);
  for (const forbidden of ['committed', 'commit', 'branch', 'pushed', 'cell', 'activated', 'written', 'file']) {
    assert.ok(!keys.includes(forbidden), `approval must not report a "${forbidden}"`);
  }
  assert.equal(keys.length, 22, 'the top-level key set is closed and unchanged');
});

test('store · writeContract lands in vault/, round-trips, and is replace-or-nothing', () => {
  const root = freshRoot();
  assert.equal(readContract(root), null);
  const approved = approveContract(contract(), { confirm: true, now: NOW });
  const file = writeContract(root, approved);
  assert.equal(file, join(root, 'vault', 'project-contract.json'));
  assert.ok(readFileSync(file, 'utf8').endsWith('\n'), 'the file is a line-terminated document');
  assert.deepEqual(readContract(root), approved);
  assert.equal(CONTRACT_REL, 'vault/project-contract.json');
});

test('store · nothing is written outside vault/', () => {
  const root = freshRoot();
  for (const name of [j('..', '/', 'escape.json'), j('..', '/', '..', '/', 'escape.json'), '.']) {
    assert.equal(refusal(() => vaultPath(root, name)).code, 'OUTSIDE_ROOT', `${name} must be refused`);
  }
  assert.ok(vaultPath(root, 'project-contract.json').startsWith(join(root, 'vault')));
});

test('store · writeContract re-asks both questions and fails closed', () => {
  const root = freshRoot();
  const invalid = contract((c) => { c.objective = { value: 'x', status: 'SETTLED', basis: 'typed' }; });
  assert.equal(refusal(() => writeContract(root, invalid)).code, 'BAD_CONTRACT');
  const leaking = contract((c) => { c.environment = { value: j('/', 'Users', '/', 'someone', '/', 'app'), status: 'DECLARED' }; });
  const { code, details } = refusal(() => writeContract(root, leaking));
  assert.equal(code, 'PUBLICATION_CHECK');
  assert.deepEqual(/** @type {any} */ (details).findings, [{ path: 'environment.value', kind: 'home-path' }]);
  assert.equal(readContract(root), null, 'a refused write leaves no file at all');
});
