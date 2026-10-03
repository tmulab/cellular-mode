// D8, D11, D12, D13 — the view-model, which is where this application decides what it is
// willing to say. Pure functions, so these assertions are about meaning and not about
// rendering.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CELL_COLUMNS, DETAIL_FIELDS, NOT_RECORDED, STATUS_SHAPES, TIMELINE_NOTE, UNKNOWN_STATUS,
  activeCellLine, cellsTableRows, detailRows, field, listField, overviewTiles,
  statusDescriptor, timelineRows,
} from '../view/view-model.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('../fixtures/observer-state.json', import.meta.url), 'utf8'));

describe('D8 · a null is an absence, said in words', () => {
  test('null, undefined and blank all render as the literal "not recorded"', () => {
    for (const value of [null, undefined, '', '   ']) {
      assert.deepEqual(field(value), { text: NOT_RECORDED, recorded: false });
    }
    assert.equal(NOT_RECORDED, 'not recorded');
  });

  test('a recorded value is passed through, trimmed, and marked recorded', () => {
    assert.deepEqual(field('  Port the 2D projection. '), { text: 'Port the 2D projection.', recorded: true });
    assert.deepEqual(field(0), { text: '0', recorded: true });
  });

  test('an empty dependency list is a recorded fact, not an absence', () => {
    assert.deepEqual(listField([]), { text: 'none declared', recorded: true });
    assert.deepEqual(listField(['a', 'b']), { text: 'a, b', recorded: true });
    assert.deepEqual(listField(null), { text: NOT_RECORDED, recorded: false });
  });
});

describe('D8 · a status is a shape and a word before it is a colour', () => {
  test('every contract status has its own shape AND its own text', () => {
    const shapes = Object.values(STATUS_SHAPES).map((entry) => entry.shape);
    assert.deepEqual([...new Set(shapes)].sort(), shapes.slice().sort(), 'shapes must be distinct');
    for (const key of ['planned', 'active', 'paused', 'done']) {
      const described = statusDescriptor(key);
      assert.equal(described.key, key);
      assert.ok(described.shape.length > 0 && described.label.length > 0 && described.symbol.length > 0);
    }
  });

  test('an unrecognised status is reported as unknown, never mapped to a known one', () => {
    for (const value of ['blocked', '', null, 42]) {
      assert.deepEqual(statusDescriptor(value), UNKNOWN_STATUS);
    }
    assert.equal(UNKNOWN_STATUS.shape, 'triangle');
    assert.notEqual(UNKNOWN_STATUS.shape, STATUS_SHAPES['planned']?.shape);
  });
});

describe('D8 · the counts shout about what asks something now', () => {
  test('active is strong, done is quiet, and paused is strong only when it exists', () => {
    const none = overviewTiles({ active: 1, paused: 0, planned: 9, done: 47 });
    assert.deepEqual(none.map((tile) => tile.key), ['active', 'paused', 'planned', 'done']);
    assert.deepEqual(
      none.map((tile) => tile.emphasis),
      ['strong', 'quiet', 'quiet', 'quiet'],
    );
    const some = overviewTiles({ active: 1, paused: 2, planned: 9, done: 47 });
    assert.equal(some[1]?.emphasis, 'strong');
  });

  test('a missing count is zero, not a blank', () => {
    assert.deepEqual(overviewTiles({}).map((tile) => tile.value), [0, 0, 0, 0]);
  });

  test('no active cell is stated, not hidden', () => {
    assert.deepEqual(activeCellLine(null), { text: 'no active cell', recorded: false, id: null });
    assert.deepEqual(activeCellLine({ id: 'a-cell', name: 'A cell' }), { text: 'A cell', recorded: true, id: 'a-cell' });
  });
});

describe('D11 · the cells table is the complete textual reading', () => {
  test('every CellSummary field of every cell appears, in one order', () => {
    const rows = cellsTableRows(FIXTURE.cells.cells);
    assert.equal(rows.length, FIXTURE.cells.cells.length);
    for (const row of rows) assert.equal(row.cells.length, CELL_COLUMNS.length);
    assert.deepEqual(CELL_COLUMNS.map(([key]) => key),
      ['id', 'name', 'area', 'status', 'lastVisit', 'nextStep', 'dependencies']);
  });

  test('the status cell carries the symbol and the word, so colour is never the only cue', () => {
    const planned = cellsTableRows(FIXTURE.cells.cells).find((row) => row.status.key === 'planned');
    assert.ok(planned !== undefined);
    assert.match(planned.cells[3]?.text ?? '', /planned$/);
    assert.ok((planned.cells[3]?.text ?? '').startsWith(STATUS_SHAPES['planned']?.symbol ?? '!'));
  });

  test('a cell that records no last visit says so in its own cell', () => {
    const row = cellsTableRows([{ id: 'x', name: 'X', area: 'a', status: 'planned', lastVisit: null, nextStep: null, dependencies: [] }])[0];
    assert.equal(row?.cells[4]?.text, NOT_RECORDED);
    assert.equal(row?.cells[4]?.recorded, false);
  });
});

describe('D12 · the detail panel shows every contract field', () => {
  test('all eighteen fields are present for a fully recorded cell', () => {
    const { rows, evidence, unavailable } = detailRows(FIXTURE['cell-detail']['observer-dashboard']);
    assert.equal(rows.length, DETAIL_FIELDS.length);
    assert.equal(rows.filter((row) => !row.value.recorded).length, 1, 'only "decisions" is unrecorded in the fixture');
    assert.equal(evidence.length, 3);
    assert.deepEqual(unavailable, []);
  });

  test('a planned cell with nothing recorded shows the same fields, all saying so', () => {
    const { rows, evidence, unavailable } = detailRows(FIXTURE['cell-detail']['observer-auditor']);
    assert.equal(rows.length, DETAIL_FIELDS.length);
    const absent = rows.filter((row) => !row.value.recorded).map((row) => row.label);
    assert.ok(absent.includes('objective'), 'an absent objective must be shown as absent');
    assert.ok(absent.includes('boundary — in') && absent.includes('boundary — out'));
    assert.equal(evidence[1]?.value.text, NOT_RECORDED, 'an unrecorded last status must say so');
    assert.deepEqual(unavailable, ['lastVisit']);
  });

  test('a nested boundary is read one level deep, and a missing boundary object is an absence', () => {
    const { rows } = detailRows({ boundary: null });
    const boundaryIn = rows.find((row) => row.label === 'boundary — in');
    assert.equal(boundaryIn?.value.text, NOT_RECORDED);
  });
});

describe('D13 · the timeline never invents an opening', () => {
  test('the note is a constant of the module, not a string in a template', () => {
    assert.equal(TIMELINE_NOTE, 'open/resume not recorded by the protocol');
  });

  test('every logged event becomes a row, with its unrecorded fields marked', () => {
    const rows = timelineRows(FIXTURE.timeline.events);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((row) => row.kind), ['pause', 'complete', 'pause', 'reconstructed']);
    const reconstructed = rows[3];
    assert.equal(reconstructed?.lines.find((line) => line.label === 'build')?.value.text, NOT_RECORDED);
  });

  test('the fixture says in its own payload which kinds are not recorded', () => {
    assert.deepEqual(FIXTURE.timeline.notRecorded, ['open', 'resume']);
  });
});
