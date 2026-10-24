// A21 — inside an operation, the ceiling is the pack's, and the auditor still owns no rule.
//
// `cell-state` carries the integrity guard's verdict and implements nothing (A4). The
// operation layer is where that restraint becomes visible: the number of 🔵 cells that is
// a breach is now DATA — `max-active-cells` in the authorization pack — and the auditor
// must report whatever `checkState` says about it, with the code the guard chose.
//
// Both sides are asserted, because a check that always answers the same way is not a
// check: two active cells under a ceiling of four is NOT a finding, five over the same
// ceiling IS one, and the old `two-active` code must never appear inside an operation
// that stays within its ceiling. The chain is the real one — `checkState` feeds
// `cellStateChecks` — so nothing here re-implements either half.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCell } from '../../../tools/cellmode/cell-file.mjs';
import { checkState } from '../../../tools/cellmode/check.mjs';
import { makeOperation } from '../../../tools/cellmode/operation-file.mjs';
import { cellStateChecks } from './checks-vault.mjs';

/** The operation whose pack names a ceiling of four. @param {string} maxActiveCells */
const operationOf = (maxActiveCells) => makeOperation({
  name: 'Parallel work',
  status: '🔵',
  finishLine: ['port the operation view'],
  pack: { maxActiveCells, publisher: 'the maintainer' },
});

/** `n` active cells, as INDEX.md rows. @param {number} n */
const activeRows = (n) => Array.from({ length: n }, (_, i) => ({
  name: `Cell ${i + 1}`, slug: `cell-${i + 1}`, area: 'api', status: '🔵',
  lastVisit: '2026-10-24', nextStep: 'write the test',
}));

/** The audit model the auditor really receives: the guard's findings, carried.
 * @param {{ active: number, operation?: import('../../../tools/cellmode/types.mjs').Operation | null }} input
 * @returns {import('./types.mjs').AuditModel} */
function auditModel({ active, operation = null }) {
  const indexRows = activeRows(active);
  // CURRENT-CELL.md is left out of the fixture, so the projection check would also fire;
  // `current` is handed the first active row to keep this test about the ceiling alone.
  const name = indexRows[0]?.name ?? '';
  const current = { name, id: indexRows[0]?.slug ?? '', cell: makeCell({ name }) };
  const findings = checkState({ indexRows, logEntries: [], current, operation });
  return { entries: [], logEntries: [], integrity: { ok: findings.length === 0, findings } };
}

/** @type {(drafts: ReadonlyArray<import('./types.mjs').Draft>) => string[]} */
const statuses = (drafts) => drafts.map((d) => d.status);

test('A21 two active cells under a ceiling of four is a PASS, and never says "two-active"', () => {
  const inside = auditModel({ active: 2, operation: operationOf('4') });
  assert.deepEqual(inside.integrity.findings, [],
    'the pack named four: two 🔵 cells are the operation working as declared');
  assert.deepEqual(statuses(cellStateChecks(inside)), ['PASS']);
  // Four is still within the ceiling: the boundary itself is not a breach.
  const atCeiling = auditModel({ active: 4, operation: operationOf('4') });
  assert.deepEqual(atCeiling.integrity.findings.map((f) => f.code), []);
  assert.deepEqual(statuses(cellStateChecks(atCeiling)), ['PASS']);
});

test('A21 above the ceiling the auditor reports over-ceiling, with the guard\'s own code', () => {
  const over = auditModel({ active: 5, operation: operationOf('4') });
  const codes = over.integrity.findings.map((f) => f.code);
  assert.deepEqual(codes, ['over-ceiling'], 'one named breach of a NAMED ceiling');
  assert.equal(codes.includes('two-active'), false, 'inside an operation that code is wrong');
  const drafts = cellStateChecks(over);
  assert.deepEqual(statuses(drafts), ['FAIL']);
  assert.ok(drafts[0]?.evidence.includes('code over-ceiling'),
    'the auditor cites the guard\'s code instead of restating the rule');
  assert.match(String(drafts[0]?.explanation), /max-active-cells: 4/);
  assert.match(String(drafts[0]?.explanation), /Parallel work/);
});

test('A21 outside an operation the old rule stands: a second active cell is two-active', () => {
  const outside = auditModel({ active: 2 });
  assert.deepEqual(outside.integrity.findings.map((f) => f.code), ['two-active']);
  assert.deepEqual(statuses(cellStateChecks(outside)), ['FAIL']);
  // A paused operation grants nothing: its pack expired with it.
  const paused = auditModel({ active: 2, operation: makeOperation({ name: 'Done', status: '⏸', pack: { maxActiveCells: '4' } }) });
  assert.deepEqual(paused.integrity.findings.map((f) => f.code), ['two-active']);
  // And a pack with no ceiling fails CLOSED, at one: a grant nobody wrote is not a grant.
  const ungranted = auditModel({ active: 2, operation: operationOf('') });
  assert.deepEqual(ungranted.integrity.findings.map((f) => f.code), ['over-ceiling']);
  assert.match(String(ungranted.integrity.findings[0]?.message), /max-active-cells: 1/);
});
