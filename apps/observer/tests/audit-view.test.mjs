// The AUDIT view-model: the last place an unmeasured leg could become a green tick.
//
// Every assertion here is about a DISTINCTION, not about a shape: UNAVAILABLE must differ from
// PASS in word, symbol and tone; a status this build does not know must be treated as
// unavailable rather than as a pass; a tile with the value 0 must still be rendered so a
// reader can see that nothing was unavailable. A test that only checked "a tone exists" would
// stay green with every verdict mapped to the same colour.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_STATUSES, STATUS_MARKS, UNKNOWN_MARK, auditHeadline, filterRows, findingRows,
  scopeOptions, statusMark, summaryTiles,
} from '../view/audit-view.mjs';

/** @type {(over?: Record<string, unknown>) => Record<string, unknown>} */
const finding = (over = {}) => ({
  id: 'AUD-FILE-SIZE-001',
  scope: 'project',
  rule: 'file-size',
  status: 'FAIL',
  evidence: ['tools/long.mjs', 'rule size:over-limit'],
  explanation: '205 lines > limit 200',
  action: 'split the file.',
  ...over,
});

describe('the five verdicts are five, and UNAVAILABLE is not a kind of PASS', () => {
  test('each verdict has its own word, symbol and tone', () => {
    assert.deepEqual([...AUDIT_STATUSES], ['FAIL', 'WARNING', 'UNAVAILABLE', 'NOT_APPLICABLE', 'PASS']);
    const marks = AUDIT_STATUSES.map((status) => statusMark(status));
    assert.equal(new Set(marks.map((mark) => mark.label)).size, 5, 'five words');
    assert.equal(new Set(marks.map((mark) => mark.tone)).size, 5, 'five tones');
    assert.notEqual(STATUS_MARKS['UNAVAILABLE']?.symbol, STATUS_MARKS['PASS']?.symbol);
    assert.notEqual(STATUS_MARKS['UNAVAILABLE']?.tone, STATUS_MARKS['PASS']?.tone);
    assert.match(String(STATUS_MARKS['UNAVAILABLE']?.meaning), /not a pass/i);
  });

  test('a verdict this build does not recognise is UNAVAILABLE, never PASS', () => {
    for (const value of ['GREEN', 'pass', '', null, 7, undefined]) {
      const mark = statusMark(value);
      assert.equal(mark, UNKNOWN_MARK, JSON.stringify(value));
      assert.notEqual(mark.tone, STATUS_MARKS['PASS']?.tone);
      assert.equal(mark.tone, STATUS_MARKS['UNAVAILABLE']?.tone, 'unknown is treated as unmeasured');
    }
  });
});

describe('the summary', () => {
  test('every status gets a tile, including the ones that are zero', () => {
    const tiles = summaryTiles({ PASS: 7, FAIL: 0, WARNING: 2, UNAVAILABLE: 3, NOT_APPLICABLE: 1 });
    assert.deepEqual(tiles.map((tile) => tile.key), [...AUDIT_STATUSES]);
    assert.deepEqual(tiles.map((tile) => tile.value), [0, 2, 3, 1, 7]);
    // Weight follows action: a non-zero FAIL, WARNING or UNAVAILABLE asks something now.
    assert.deepEqual(tiles.map((tile) => tile.emphasis), ['quiet', 'strong', 'strong', 'quiet', 'quiet']);
    assert.equal(tiles.find((tile) => tile.key === 'UNAVAILABLE')?.emphasis, 'strong',
      'three unmeasured legs must not be rendered as quietly as seven passes');
  });

  test('a missing or malformed summary becomes zeros, never an omitted status', () => {
    for (const value of [null, undefined, {}, { PASS: 'many' }, 7]) {
      const tiles = summaryTiles(value);
      assert.deepEqual(tiles.map((tile) => tile.key), [...AUDIT_STATUSES], JSON.stringify(value));
      assert.deepEqual(tiles.map((tile) => tile.value), [0, 0, 0, 0, 0]);
    }
  });
});

describe('the findings table', () => {
  test('one row per finding, with its evidence, explanation and suggested action', () => {
    const [row] = findingRows([finding()]);
    assert.equal(row?.id, 'AUD-FILE-SIZE-001');
    assert.equal(row?.rule, 'file-size');
    assert.equal(row?.mark.label, 'FAIL');
    assert.deepEqual(row?.evidence, ['tools/long.mjs', 'rule size:over-limit']);
    assert.equal(row?.explanation.text, '205 lines > limit 200');
    assert.equal(row?.hasAction, true);
    assert.equal(row?.action.text, 'split the file.');
  });

  test('a PASS with no action renders no action, and an absent field is not invented', () => {
    const [row] = findingRows([finding({ status: 'PASS', action: undefined, explanation: null })]);
    assert.equal(row?.hasAction, false, 'an empty suggestion box would imply there is one');
    assert.equal(row?.explanation.recorded, false);
    assert.equal(row?.explanation.text, 'not recorded');
    assert.deepEqual(findingRows(null), [], 'no findings is a list, not a throw');
    assert.deepEqual(findingRows([null])[0]?.evidence, []);
  });

  test('the scope filter is exact and its options are stable', () => {
    const rows = findingRows([
      finding({ scope: 'cell:beta' }), finding({ scope: 'project' }), finding({ scope: 'cell:alpha' }),
    ]);
    assert.deepEqual(scopeOptions(rows), ['project', 'cell:alpha', 'cell:beta']);
    assert.equal(filterRows(rows, { scope: 'cell:alpha' }).length, 1);
    assert.equal(filterRows(rows, { scope: 'cell:alph' }).length, 0, 'a scope matches exactly');
    assert.equal(filterRows(rows, {}).length, 3, 'an empty criterion means every');
  });

  test('the status filter selects by the MARK, so an unknown status is reachable too', () => {
    const rows = findingRows([
      finding({ status: 'PASS' }), finding({ status: 'UNAVAILABLE' }), finding({ status: 'NOPE' }),
    ]);
    assert.equal(filterRows(rows, { status: 'PASS' }).length, 1);
    assert.equal(filterRows(rows, { status: 'UNAVAILABLE' }).length, 1, 'the unknown one is not folded in here');
    assert.equal(filterRows(rows, { status: 'UNKNOWN' }).length, 1);
  });
});

describe('the headline', () => {
  test('"no findings" and "no audit" are different sentences', () => {
    const never = auditHeadline({ ran: false, at: null, findings: [], summary: {} });
    assert.equal(never.ran, false);
    assert.match(never.text, /no audit has run/);
    const ran = auditHeadline({ ran: true, at: '2026-10-02T10:00:00.000Z', findings: [finding()] });
    assert.equal(ran.ran, true);
    assert.match(ran.text, /^1 finding\(s\), audited at 2026-10-02T10:00:00\.000Z\./);
    // A real audit with nothing to report says so, and says when.
    assert.match(auditHeadline({ ran: true, at: '2026-10-02T10:00:00.000Z', findings: [] }).text,
      /^0 finding\(s\), audited at /);
    assert.match(auditHeadline({ ran: true, at: null, findings: [] }).text, /^0 finding\(s\), audited\.$/);
  });
});
