// AD28 — what a declared mode changes about this page: the badge, the order and the amount.
//
// The one thing a mode can NEVER change has its own file, `mode-invariant.test.mjs`: every
// `FAIL` and every security finding is rendered in full under every mode. Read that one first.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_DECLARATION, STANDINGS, advisorExpanded, capAdvice, capFindings, capNotice, modeBadge,
  orderFindings, presentationMode, readCurrent, timelineCellOf,
} from '../view/mode-view.mjs';

/** @typedef {{ mark: { key: string }, rule: string, scope: string, id: string }} Row */

/** @type {(status: string, rule: string, scope?: string, id?: string) => Row} */
const row = (status, rule, scope = 'project', id = `${rule}-${status}`) => ({
  mark: { key: status }, rule, scope, id,
});

/** An ACTIVE declaration of `mode`, as the plugin answers it. @type {(mode: string) => unknown} */
const declared = (mode) => ({
  enabled: true,
  mode,
  standing: 'active',
  declaredBy: 'user',
  source: 'claude-hook',
  activatedAt: '2026-10-03T13:26:00.000Z',
  expiresAt: '2026-10-03T17:26:00.000Z',
  notice: null,
});

describe('AD28 · ready and an unreadable answer both mean today\'s behaviour, exactly', () => {
  const rows = [row('WARNING', 'policy'), row('PASS', 'file-size'), row('PASS', 'state'), row('PASS', 'contract')];

  test('ready changes neither order nor length', () => {
    assert.deepEqual(orderFindings(rows, 'ready', 'a-cell'), rows);
    assert.deepEqual(capFindings(rows, 'ready'), { shown: rows, hidden: [], capped: false });
    assert.equal(advisorExpanded('ready'), false);
    assert.equal(timelineCellOf('ready', 'a-cell'), null);
  });

  test('an answer this build cannot read is read as NO declaration, never as a mode', () => {
    for (const unreadable of [null, undefined, {}, 7, 'tired', { mode: 'exhausted', standing: 'active' },
      { mode: 'tired', standing: 'invented' }, { mode: 'tired' }, { standing: 'active' }]) {
      assert.deepEqual(readCurrent(unreadable), NO_DECLARATION, `${JSON.stringify(unreadable)} must be ignored`);
      assert.equal(presentationMode(readCurrent(unreadable)), 'ready');
      assert.equal(modeBadge(unreadable).show, false, 'no badge for something nobody declared');
    }
  });

  test('only an ACTIVE declaration presents: expired, invalid and disabled are all ready', () => {
    assert.equal(presentationMode(readCurrent(declared('tired'))), 'tired');
    for (const standing of STANDINGS.filter((value) => value !== 'active')) {
      const value = { ...(/** @type {Record<string, unknown>} */ (declared('tired'))), standing };
      assert.equal(presentationMode(readCurrent(value)), 'ready', `${standing} must not present`);
    }
    const off = { ...(/** @type {Record<string, unknown>} */ (declared('tired'))), enabled: false };
    assert.equal(presentationMode(readCurrent(off)), 'ready', 'a disabled module presents nothing');
    assert.equal(presentationMode(readCurrent(declared('ready'))), 'ready');
  });
});

describe('AD28 · the badge is read-only and says exactly what was declared', () => {
  test('an active declaration: the mode, the window, and who declared it', () => {
    const badge = modeBadge(declared('tired'));
    assert.equal(badge.show, true);
    assert.equal(badge.mode, 'tired');
    assert.equal(badge.standing, 'active');
    assert.equal(badge.text, 'mode: tired · declared 13:26 · until 17:26 · declared by you');
    assert.equal(badge.notice, '');
    assert.equal(badge.source, 'source claude-hook');
  });

  test('no declaration and a disabled module both show NOTHING', () => {
    assert.equal(modeBadge({ ...NO_DECLARATION }).show, false);
    assert.equal(modeBadge({ ...NO_DECLARATION, enabled: false, standing: 'disabled' }).show, false);
  });

  test('expired and invalid DO show, because something changed with nobody doing anything', () => {
    const expired = modeBadge({
      ...(/** @type {Record<string, unknown>} */ (declared('tired'))),
      standing: 'expired',
      mode: 'ready',
      notice: 'your earlier declaration (tired, 2026-10-03 08:00) expired — back to ready',
    });
    assert.equal(expired.show, true);
    assert.equal(expired.mode, 'ready', 'an expired declaration is never presented as active');
    assert.equal(expired.text, 'mode: ready');
    assert.equal(expired.notice, 'your earlier declaration (tired, 2026-10-03 08:00) expired — back to ready');
    const invalid = modeBadge({ ...(/** @type {Record<string, unknown>} */ (declared('tired'))), standing: 'invalid', notice: null });
    assert.equal(invalid.show, true);
    assert.equal(invalid.notice, 'an earlier declaration no longer applies', 'never silent');
  });

  test('a malformed instant is omitted rather than guessed at', () => {
    const badge = modeBadge({ ...(/** @type {Record<string, unknown>} */ (declared('focus'))), activatedAt: 'soon', expiresAt: null });
    assert.equal(badge.text, 'mode: focus · declared by you');
  });
});

describe('AD28 · each mode, as presentation and nothing else', () => {
  test('tired: mandatory first and in full, then at most three others', () => {
    const rows = [
      row('PASS', 'policy', 'project', 'a'), row('PASS', 'policy', 'project', 'b'),
      row('FAIL', 'tests', 'project', 'f'), row('PASS', 'policy', 'project', 'c'),
      row('PASS', 'policy', 'project', 'd'), row('WARNING', 'secrets', 'project', 's'),
    ];
    assert.deepEqual(orderFindings(rows, 'tired').map((r) => r.id), ['f', 's', 'a', 'b', 'c', 'd']);
    const { shown, hidden } = capFindings(orderFindings(rows, 'tired'), 'tired');
    assert.deepEqual(shown.map((r) => r.id), ['f', 's', 'a', 'b', 'c']);
    assert.deepEqual(hidden.map((r) => r.id), ['d']);
    assert.match(capNotice('tired', 1), /^1 more, not shown in tired mode\. Every FAIL and every security finding is shown in full\.$/);
    assert.equal(capNotice('tired', 0), '', 'no notice when nothing is deferred');
  });

  test('focus: the active cell first, the project\'s verdicts still above it', () => {
    const rows = [
      row('PASS', 'policy', 'project', 'p1'), row('PASS', 'state', 'cell:active', 'c1'),
      row('FAIL', 'tests', 'project', 'f'), row('PASS', 'contract', 'cell:other', 'o1'),
    ];
    assert.deepEqual(orderFindings(rows, 'focus', 'active').map((r) => r.id), ['c1', 'f', 'p1', 'o1']);
    // `cell:active` must not also select `cell:active-2`: the match is exact.
    assert.deepEqual(orderFindings([row('PASS', 'state', 'cell:active-2', 'x')], 'focus', 'active').map((r) => r.id), ['x']);
    assert.equal(capFindings(rows, 'focus').capped, false, 'focus reorders, it never caps');
    assert.equal(timelineCellOf('focus', 'active'), 'active');
    assert.equal(timelineCellOf('focus', null), null, 'no active cell, no filter');
    assert.equal(timelineCellOf('focus', ''), null);
  });

  test('explore: more is shown, not less', () => {
    assert.equal(advisorExpanded('explore'), true);
    for (const mode of ['ready', 'tired', 'focus']) assert.equal(advisorExpanded(mode), false);
    assert.equal(capFindings([row('PASS', 'policy')], 'explore').capped, false);
  });

  test('the advisor list is capped by COUNT, and only in tired', () => {
    const recs = Array.from({ length: 7 }, (_, index) => ({ id: `r${index}` }));
    assert.deepEqual(capAdvice(recs, 'tired').shown.map((r) => r.id), ['r0', 'r1', 'r2']);
    assert.equal(capAdvice(recs, 'tired').hidden, 4);
    assert.equal(capAdvice(recs, 'tired', true).hidden, 0);
    for (const mode of ['ready', 'focus', 'explore']) assert.equal(capAdvice(recs, mode).hidden, 0);
    assert.deepEqual(capAdvice(recs.slice(0, 3), 'tired'), { shown: recs.slice(0, 3), hidden: 0 });
  });

  test('every function is total and mutates nothing it was given', () => {
    const rows = Object.freeze([row('FAIL', 'tests'), row('PASS', 'policy')]);
    assert.doesNotThrow(() => orderFindings(rows, 'tired'));
    assert.doesNotThrow(() => capFindings(rows, 'tired'));
    assert.equal(orderFindings(rows, 'tired') === rows, false, 'a new array, every time');
    assert.deepEqual(orderFindings([], 'tired'), []);
    assert.deepEqual(capFindings([], 'tired'), { shown: [], hidden: [], capped: false });
    assert.deepEqual(capAdvice([], 'tired'), { shown: [], hidden: 0 });
  });
});
