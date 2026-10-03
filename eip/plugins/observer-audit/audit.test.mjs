// A4..A10, A15 — the vault and repository rules, as pure functions over fixtures.
//
// Every assertion names an exact STATUS. That is the discipline this suite exists for: a test
// that only checks "a finding appeared" would pass just as happily when the finding says
// UNAVAILABLE, and a dashboard built on that test would print a green tick for a rule nobody
// evaluated. Where a rule has a boundary — a done cell with no next step — the test asserts
// BOTH sides of it, so the rule cannot be satisfied by always answering the same way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBoundaries, toFindings } from '../../../tools/gates/boundaries.mjs';
import { checkSize } from '../../../tools/gates/size.mjs';
import { checkSecrets } from '../../../tools/gates/secrets.mjs';
import {
  cellContractChecks, cellStateChecks, dependencyChecks, doneEvidenceChecks,
} from './checks-vault.mjs';
import {
  acceptanceChecks, boundaryChecks, depsChecks, policyChecks, secretChecks, sizeChecks,
} from './checks-repo.mjs';
import { assignIds, filterFindings, summarise } from './statuses.mjs';

/** @typedef {import('./types.mjs').AuditModel} AuditModel */

/** @type {(over?: Partial<import('./types.mjs').AuditCellFile>) => import('./types.mjs').AuditCellFile} */
const file = (over = {}) => ({
  objective: 'ship the thing', boundaryIn: 'this', boundaryOut: 'that',
  doneCriterion: 'gates green', nextStep: 'write the test', ...over,
});
/** @type {(over?: Partial<import('./types.mjs').AuditEntry>) => import('./types.mjs').AuditEntry} */
const entry = (over = {}) => ({
  id: 'alpha', name: 'Alpha', status: 'active', nextStep: 'go', dependencies: [], cell: file(), ...over,
});
/** @type {(over?: Partial<AuditModel>) => AuditModel} */
const model = (over = {}) => ({
  entries: [], logEntries: [], integrity: { ok: true, findings: [] }, ...over,
});
/** @type {(over?: Partial<import('./types.mjs').AuditLogEntry>) => import('./types.mjs').AuditLogEntry} */
const logEntry = (over = {}) => ({
  timestamp: '2026-10-01 10:00', date: '2026-10-01', cell: 'Alpha', status: '✔',
  facts: 'f', decisions: 'd', build: '✅ 3/3', next: '—', note: '', ...over,
});
/** @type {(drafts: ReadonlyArray<import('./types.mjs').Draft>) => string[]} */
const statuses = (drafts) => drafts.map((d) => d.status);

test('A4 cell-state carries the integrity guard\'s verdict, and a finding is never a PASS', () => {
  assert.deepEqual(statuses(cellStateChecks(model())), ['PASS']);
  const broken = cellStateChecks(model({
    integrity: { ok: false, findings: [{ code: 'two-active', message: 'more than one active cell' }] },
  }));
  assert.deepEqual(statuses(broken), ['FAIL']);
  assert.ok(broken[0]?.evidence.includes('code two-active'), 'the guard\'s own code is the evidence');
  assert.match(String(broken[0]?.explanation), /more than one active cell/);
});

test('A5 cell-contract judges active and paused cells on all four fields', () => {
  const missing = cellContractChecks(model({
    entries: [entry({ cell: file({ objective: '—', doneCriterion: '' }) })],
  }));
  assert.deepEqual(statuses(missing), ['WARNING', 'WARNING']);
  assert.deepEqual(missing.map((d) => d.scope), ['cell:alpha', 'cell:alpha']);
  assert.deepEqual(missing.map((d) => d.evidence[1]), ['field objective', 'field done criterion']);
  assert.deepEqual(statuses(cellContractChecks(model({ entries: [entry()] }))), ['PASS']);
});

test('A5 a DONE cell needs no next step, and an active one does — both sides asserted', () => {
  const done = cellContractChecks(model({
    entries: [entry({ status: 'done', cell: file({ nextStep: '—' }) })],
  }));
  assert.deepEqual(statuses(done), ['PASS'], 'finished work has nothing next, and "—" says so');
  const active = cellContractChecks(model({
    entries: [entry({ status: 'active', cell: file({ nextStep: '—' }) })],
  }));
  assert.deepEqual(statuses(active), ['WARNING']);
  assert.equal(active[0]?.evidence[1], 'field next step');
  // A planned cell has not been opened: judging its fields would judge work nobody started.
  assert.deepEqual(statuses(cellContractChecks(model({
    entries: [entry({ status: 'planned', cell: file({ objective: '—', doneCriterion: '—', nextStep: '—' }) })],
  }))), ['PASS']);
  // No cell file at all is ONE warning about the file, not four about its fields.
  const orphan = cellContractChecks(model({ entries: [entry({ cell: null })] }));
  assert.deepEqual(statuses(orphan), ['WARNING']);
  assert.deepEqual(orphan[0]?.evidence, ['vault/state/cells/alpha.md']);
  assert.deepEqual(statuses(cellContractChecks(model())), ['NOT_APPLICABLE'], 'no cells, nothing to judge');
});

test('A6 a dangling dependency is a WARNING on the declaring cell; nothing is inferred', () => {
  const dangling = dependencyChecks(model({ entries: [entry({ dependencies: ['ghost'] })] }));
  assert.deepEqual(statuses(dangling), ['WARNING']);
  assert.equal(dangling[0]?.scope, 'cell:alpha');
  assert.ok(dangling[0]?.evidence.includes('dependency ghost'));
  const resolved = dependencyChecks(model({
    entries: [entry({ dependencies: ['beta'] }), entry({ id: 'beta', name: 'Beta' })],
  }));
  assert.deepEqual(statuses(resolved), ['PASS']);
  // Two cells with no declared edge produce no finding: an undeclared pair is not an edge.
  assert.deepEqual(statuses(dependencyChecks(model({
    entries: [entry(), entry({ id: 'beta', name: 'Beta' })],
  }))), ['PASS']);
});

test('A10 a done cell with no recorded build, or a red one, is a WARNING', () => {
  const entries = [entry({ status: 'done' })];
  assert.deepEqual(statuses(doneEvidenceChecks(model({ entries, logEntries: [logEntry()] }))), ['PASS']);
  assert.deepEqual(statuses(doneEvidenceChecks(model({ entries, logEntries: [logEntry({ build: '—' })] }))), ['WARNING']);
  assert.deepEqual(statuses(doneEvidenceChecks(model({ entries, logEntries: [] }))), ['WARNING']);
  const red = doneEvidenceChecks(model({ entries, logEntries: [logEntry({ build: '❌ 2 tests failed' })] }));
  assert.deepEqual(statuses(red), ['WARNING']);
  assert.equal(red[0]?.evidence[1], 'Build: reads as failed');
  // The LAST entry decides: an early red closure followed by a green one is green.
  assert.deepEqual(statuses(doneEvidenceChecks(model({
    entries, logEntries: [logEntry({ build: '❌ broken' }), logEntry()],
  }))), ['PASS']);
  assert.deepEqual(statuses(doneEvidenceChecks(model({ entries: [entry()] }))), ['NOT_APPLICABLE']);
});

test('A7 the size, secrets, deps and boundary rules MIRROR the gates, one finding each', () => {
  const long = { path: 'tools/long.mjs', text: `${'export const x = 1;\n'.repeat(205)}` };
  const gateSize = checkSize([long], []);
  const mine = sizeChecks([long], []);
  assert.equal(gateSize.length, 1);
  assert.deepEqual(statuses(mine), ['FAIL']);
  assert.deepEqual(mine[0]?.evidence, ['tools/long.mjs', `rule ${gateSize[0]?.rule}`]);
  assert.equal(mine[0]?.explanation, gateSize[0]?.detail, 'the gate\'s sentence, not a paraphrase');
  assert.deepEqual(statuses(sizeChecks([{ path: 'a.mjs', text: 'export const a = 1;\n' }], [])), ['PASS']);

  const bad = { path: 'tools/cellmode/bad.mjs', text: 'import { k } from \'../../eip/kernel/index.mjs\';\n' };
  const gateBoundary = toFindings(checkBoundaries([bad]));
  const boundary = boundaryChecks([bad]);
  assert.equal(gateBoundary.length, 1);
  assert.deepEqual(statuses(boundary), ['FAIL']);
  assert.deepEqual(boundary[0]?.evidence, ['tools/cellmode/bad.mjs', `rule ${gateBoundary[0]?.rule}`]);

  const deps = depsChecks({ pkg: { dependencies: { 'left-pad': '1.0.0' } }, files: [], policy: { allowed: [] } });
  assert.deepEqual(statuses(deps), ['FAIL']);
  assert.equal(deps[0]?.evidence[0], 'package.json');
  assert.deepEqual(statuses(depsChecks({ pkg: {}, files: [], policy: { allowed: [] } })), ['PASS']);
});

test('A8 a secrets finding is an ADDRESS: the matched text never travels', () => {
  const secret = ['s', 'k', '-', 'notarealkey0123456789abcdef'].join('');
  const planted = { path: 'config/local.mjs', text: `const a = 1;\nexport const key = '${secret}';\n` };
  const gate = checkSecrets([planted], []);
  assert.ok(gate.length >= 1, 'the gate must detect the shape, or this test proves nothing');
  const found = secretChecks([planted], []);
  assert.deepEqual([...new Set(statuses(found))], ['FAIL']);
  assert.ok(found.some((d) => d.evidence[0] === 'config/local.mjs:2'), 'path:line is the evidence');
  const serialised = JSON.stringify(found);
  assert.equal(serialised.includes(secret), false, 'a report that quotes the secret has copied it');
  assert.equal(serialised.includes('notarealkey'), false);
  assert.deepEqual(statuses(secretChecks([{ path: 'a.md', text: 'nothing here\n' }], [])), ['PASS']);
});

test('A9 acceptance criteria: the checkbox convention, and NOT_APPLICABLE when nobody used it', () => {
  const open = acceptanceChecks([{ path: 'eip/x/ACCEPTANCE.md', text: '- [ ] A1 do the thing\n- [x] A2 done\n' }]);
  assert.deepEqual(statuses(open), ['WARNING']);
  assert.equal(open[0]?.evidence[1], '1 criterion(s) still open');
  assert.deepEqual(statuses(acceptanceChecks([{ path: 'ACCEPTANCE.md', text: '- [x] A1 done\n' }])), ['PASS']);
  // Prose criteria with no checkbox are NOT judged, and the report says so instead of
  // claiming they all have a verdict.
  const prose = acceptanceChecks([{ path: 'ACCEPTANCE.md', text: '- **A1** the thing works\n' }]);
  assert.deepEqual(statuses(prose), ['NOT_APPLICABLE']);
  assert.deepEqual(statuses(acceptanceChecks([{ path: 'README.md', text: '- [ ] not a criterion sheet\n' }])),
    ['NOT_APPLICABLE']);
});

test('A15 ids are deterministic, the summary counts every status, and the filter is exact', () => {
  const findings = assignIds([
    ...policyChecks(['policy/size-exceptions.json', 'package.json']),
    ...dependencyChecks(model({ entries: [entry({ dependencies: ['ghost'] })] })),
  ]);
  assert.deepEqual(findings.map((f) => f.id),
    ['AUD-POLICY-001', 'AUD-POLICY-002', 'AUD-DEPENDENCIES-001']);
  assert.equal(findings[0]?.evidence[0], 'package.json', 'ordered by address, not by arrival');
  assert.deepEqual(summarise(findings), { PASS: 0, FAIL: 0, WARNING: 1, UNAVAILABLE: 2, NOT_APPLICABLE: 0 });
  assert.equal(summarise(findings).PASS, 0, 'UNAVAILABLE is never counted as PASS');
  assert.deepEqual(filterFindings(findings, { status: 'UNAVAILABLE' }).map((f) => f.id),
    ['AUD-POLICY-001', 'AUD-POLICY-002']);
  assert.deepEqual(filterFindings(findings, { scope: 'cell:alpha' }).map((f) => f.id), ['AUD-DEPENDENCIES-001']);
  assert.deepEqual(filterFindings(findings, { scope: 'cell:alph' }), [], 'a scope matches exactly');
});
