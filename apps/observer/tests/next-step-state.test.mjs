// D21 — an intentionally empty next step is a RECORDED fact, and reads like one.
//
// The protocol writes `—` as the next step of a completed cell on purpose. The API now
// says so in `nextStepState`, and this is where the dashboard stops rendering that
// deliberate emptiness with the same italic "not recorded" it uses for a gap in the
// record. Two different facts must not share one sentence, and must not share the
// `recorded` flag the three renderers style on.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CELL_COLUMNS, NONE_COMPLETED, NOT_RECORDED,
  cellsTableRows, detailRows, nextStepField, timelineRows,
} from '../view/view-model.mjs';

const NEXT = CELL_COLUMNS.findIndex(([key]) => key === 'nextStep');

/** @type {(over?: Record<string, unknown>) => Record<string, unknown>} */
const summary = (over = {}) => ({
  id: 'note-storage', name: 'Note storage', area: 'src/storage.mjs', status: 'done',
  lastVisit: '2026-04-06', nextStep: null, nextStepState: 'none', dependencies: [], ...over,
});

describe('D21 · "none" and "not recorded" are different sentences', () => {
  test('the two phrasings are distinct constants, not one string reused', () => {
    assert.equal(NONE_COMPLETED, 'None — cell completed');
    assert.notEqual(NONE_COMPLETED, NOT_RECORDED);
  });

  test('an intentional none is marked RECORDED, an unrecorded step is not', () => {
    assert.deepEqual(nextStepField({ nextStep: null, nextStepState: 'none' }),
      { text: NONE_COMPLETED, recorded: true });
    assert.deepEqual(nextStepField({ nextStep: null, nextStepState: 'not-recorded' }),
      { text: NOT_RECORDED, recorded: false });
    // A payload from a build that predates the field is read as before: no guessing.
    assert.deepEqual(nextStepField({ nextStep: null }), { text: NOT_RECORDED, recorded: false });
    assert.deepEqual(nextStepField({ nextStep: 'read the first failure', nextStepState: 'recorded' }),
      { text: 'read the first failure', recorded: true });
  });
});

describe('D21 · all three renderers read the same state', () => {
  test('the cells table shows "None — cell completed" for a done cell only', () => {
    const [done, active] = cellsTableRows([
      summary(),
      summary({ id: 'tag-filter', status: 'active', nextStepState: 'not-recorded' }),
    ]);
    assert.deepEqual(done?.cells[NEXT], { text: NONE_COMPLETED, recorded: true });
    assert.deepEqual(active?.cells[NEXT], { text: NOT_RECORDED, recorded: false });
  });

  test('the detail panel says the cell is finished instead of claiming a gap', () => {
    const { rows, unavailable } = detailRows({
      id: 'note-storage', name: 'Note storage', status: 'done',
      nextStep: null, nextStepState: 'none', unavailable: ['area', 'openIssues'],
    });
    const row = rows.find((r) => r.label === 'next step');
    assert.deepEqual(row?.value, { text: NONE_COMPLETED, recorded: true });
    assert.equal(unavailable.includes('nextStep'), false);
    const missing = detailRows({ status: 'active', nextStep: null, nextStepState: 'not-recorded' });
    assert.deepEqual(missing.rows.find((r) => r.label === 'next step')?.value,
      { text: NOT_RECORDED, recorded: false });
  });

  test('a completion event in the timeline reads as a completion, not as a gap', () => {
    const [complete, pause] = timelineRows([
      { at: '2026-04-06 10:20', cell: 'note-storage', kind: 'complete', nextStep: null, nextStepState: 'none' },
      { at: '2026-04-07 09:30', cell: 'tag-filter', kind: 'pause', nextStep: null, nextStepState: 'not-recorded' },
    ]);
    /** @type {(row: { lines: Array<{ label: string, value: { text: string, recorded: boolean } }> } | undefined) => { text: string, recorded: boolean } | undefined} */
    const step = (row) => row?.lines.find((line) => line.label === 'next step')?.value;
    assert.deepEqual(step(complete), { text: NONE_COMPLETED, recorded: true });
    assert.deepEqual(step(pause), { text: NOT_RECORDED, recorded: false });
  });
});
