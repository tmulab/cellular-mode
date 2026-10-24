// D8 (the operation layer) — what this application is willing to say about an operation.
//
// Pure functions, so these assertions are about MEANING and not about rendering. The one
// that matters most is the last: with no operation the view-model answers `null`, which is
// what keeps the existing page — and every existing test of it — untouched.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { NONE_COMPLETED, NOT_RECORDED } from '../view/view-model.mjs';
import {
  ACTIVE_COLUMNS, ACTIVE_OPERATION, OPERATION_STATE, PACK_GRANTS, activeCellsRows,
  operationHeader,
} from '../view/operation-view.mjs';

/** An operation as the contract publishes it. */
const OPERATION = {
  name: 'Parallel work',
  id: 'parallel-work',
  status: ACTIVE_OPERATION,
  finishLine: ['port the operation view', 'write the guide'],
  fingerprint: 'a'.repeat(64),
  pack: {
    spendCeiling: '0',
    publisher: 'the maintainer',
    batches: [{ op: 'deploy', limit: '1 per day' }],
    requiresYes: ['push'],
    denied: ['git push'],
    maxActiveCells: '4',
  },
  qualityBar: 'gates green',
  spendSoFar: '—',
  plannedCells: ['alpha', 'beta'],
};

/** @type {(header: ReturnType<typeof operationHeader>) => NonNullable<ReturnType<typeof operationHeader>>} */
const present = (header) => {
  assert.notEqual(header, null, 'the header must exist for this fixture');
  return /** @type {NonNullable<ReturnType<typeof operationHeader>>} */ (header);
};

describe('D8 · the operation, with the evidence that its finish line did not move', () => {
  test('the name, the status symbol and the state in words', () => {
    const header = present(operationHeader(OPERATION));
    assert.deepEqual(header.name, { text: 'Parallel work', recorded: true });
    assert.equal(header.id, 'parallel-work');
    assert.equal(header.status.text, ACTIVE_OPERATION);
    assert.equal(header.state, OPERATION_STATE.active);
    // A status the method does not use is not promoted to "active".
    assert.equal(present(operationHeader({ ...OPERATION, status: '⏸' })).state, OPERATION_STATE.other);
  });

  test('the finish line is NUMBERED and the fingerprint is beside it', () => {
    const header = present(operationHeader(OPERATION));
    assert.deepEqual(header.finishLine.map((item) => item.text), [
      '1. port the operation view', '2. write the guide',
    ]);
    assert.equal(header.fingerprint.text, 'a'.repeat(64));
    assert.equal(header.fingerprint.recorded, true);
    // An empty finish line is a gap in the record, said as one.
    const empty = present(operationHeader({ ...OPERATION, finishLine: [], fingerprint: null }));
    assert.deepEqual(empty.finishLine, []);
    assert.deepEqual(empty.fingerprint, { text: NOT_RECORDED, recorded: false });
  });

  test('every grant of the pack is shown, in the pack order, including the empty ones', () => {
    const header = present(operationHeader(OPERATION));
    assert.deepEqual(header.pack.map((row) => row.label), PACK_GRANTS.map(([, label]) => label));
    assert.deepEqual(header.pack.map((row) => row.value.text), [
      '0', 'the maintainer', 'deploy → 1 per day', 'push', 'git push', '4',
    ]);
    // A grant nobody wrote is the one a reader must see: it is said, never dropped.
    const bare = present(operationHeader({
      ...OPERATION,
      pack: {
        spendCeiling: '', publisher: null, batches: [], requiresYes: [], denied: [],
        maxActiveCells: '',
      },
    }));
    assert.deepEqual(bare.pack.map((row) => row.value.text), [
      NOT_RECORDED, NOT_RECORDED, 'none authorized', 'none listed', 'none listed', NOT_RECORDED,
    ]);
    assert.deepEqual(bare.pack.map((row) => row.value.recorded),
      [false, false, true, true, true, false]);
  });

  test('the operation fields and the planned cells', () => {
    const header = present(operationHeader(OPERATION));
    assert.deepEqual(header.rows.map((row) => [row.label, row.value.text]), [
      ['finish-line fingerprint', 'a'.repeat(64)],
      ['quality bar', 'gates green'],
      // `—` is the file format's "not recorded", and the contract passes it through.
      ['spend so far', '—'],
    ]);
    assert.deepEqual(header.plannedCells, { text: 'alpha, beta', recorded: true });
    assert.deepEqual(present(operationHeader({ ...OPERATION, plannedCells: [] })).plannedCells,
      { text: 'none planned', recorded: true });
  });

  test('no operation renders NOTHING: null, so the page stays exactly what it was', () => {
    for (const value of [null, undefined, 'an operation', 7]) {
      assert.equal(operationHeader(value), null);
    }
  });
});

describe('D8 · every active cell, never only the first', () => {
  test('one row per 🔵 cell, with the status as a shape and a word', () => {
    const rows = activeCellsRows([
      {
        id: 'alpha', name: 'Alpha', area: 'api', status: 'active', statusSymbol: '🔵',
        lastVisit: '2026-10-24', nextStep: 'write the test', nextStepState: 'recorded',
        dependencies: [],
      },
      {
        id: 'beta', name: 'Beta', area: null, status: 'active', statusSymbol: '🔵',
        lastVisit: null, nextStep: null, nextStepState: 'none', dependencies: [],
      },
    ]);
    assert.deepEqual(rows.map((row) => row.id), ['alpha', 'beta']);
    assert.deepEqual(rows.map((row) => row.status.key), ['active', 'active']);
    assert.deepEqual(rows[0]?.cells.map((value) => value.text),
      ['Alpha', 'api', '2026-10-24', 'write the test']);
    // An absence is said in words, and a completed cell's empty next step is NOT the
    // same sentence as a missing one.
    assert.deepEqual(rows[1]?.cells.map((value) => value.text),
      ['Beta', NOT_RECORDED, NOT_RECORDED, NONE_COMPLETED]);
    assert.deepEqual(rows[1]?.cells.map((value) => value.recorded), [true, false, false, true]);
    assert.deepEqual(ACTIVE_COLUMNS.map(([, label]) => label),
      ['cell', 'area', 'last visit', 'next step']);
  });

  test('a missing or malformed list is an empty table, never a thrown page', () => {
    for (const value of [null, undefined, {}, 'cells']) {
      assert.deepEqual(activeCellsRows(value), []);
    }
    const [row] = activeCellsRows([null]);
    assert.equal(row?.id, '');
    assert.equal(row?.status.key, 'unknown', 'a row with no status is reported, never guessed');
  });
});
