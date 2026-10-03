// Tests for temporal validity — AD10, AD11 and AD16 of tools/adaptive/ACCEPTANCE.md.
//
// The subject is a reader meeting a file it did not write. Five situations have to stay
// distinguishable, because collapsing any two of them tells the human something false:
// nothing declared (`none`), a declaration still inside its window (`active`), one whose
// window has closed (`expired`), one that cannot be read as a declaration (`invalid`), and
// a module the human turned off (`disabled`). Only the last four can be confused by a bug,
// and the one that matters most is `invalid` rendered as `none` — a broken file reported as
// "the human declared nothing".
//
// `now` is a parameter. There is no clock in this module, so every case below is exact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TTL_HOURS } from './schema.mjs';
import { effectiveMode, isEnabled, standing, ttlHoursOf } from './validity.mjs';

const AT = '2026-10-03T14:02:00.000Z';
const UNTIL = '2026-10-03T18:02:00.000Z';
/** @type {(over?: Record<string, unknown>) => Record<string, unknown>} */
const session = (over = {}) => ({
  schema: 1, mode: 'tired', declaredBy: 'user', source: 'cli', command: '/modocansado',
  activatedAt: AT, expiresAt: UNTIL, scope: 'session', ...over,
});
/** @type {(iso: string, hours: number) => string} */
const plus = (iso, hours) => new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
/** @type {(enabled: boolean, ttlHours?: number) => import('./types.mjs').Preferences} */
const prefs = (enabled, ttlHours = 4) => ({ schema: 1, enabled, ttlHours });

test('validity · nothing declared is `none`, silently: absence is the default', () => {
  for (const absent of [null, undefined]) {
    const result = effectiveMode(absent, AT, null);
    assert.equal(result.standing, 'none');
    assert.equal(result.mode, 'ready');
    assert.equal(result.notice, null, 'a missing file is not an event to report');
    assert.equal(result.enabled, true);
    assert.deepEqual([result.declaredBy, result.source, result.activatedAt, result.expiresAt],
      [null, null, null, null]);
  }
});

test('validity · a declaration inside its window is active, and carries its own dates', () => {
  const result = effectiveMode(session(), plus(AT, 2), null);
  assert.deepEqual(result, {
    enabled: true,
    mode: 'tired',
    standing: 'active',
    declaredBy: 'user',
    source: 'cli',
    activatedAt: AT,
    expiresAt: UNTIL,
    notice: null,
  });
});

test('validity · the window is half-open: expiresAt itself is already expired', () => {
  assert.equal(standing(session(), plus(UNTIL, -0.001), null), 'active', 'one instant before');
  assert.equal(standing(session(), UNTIL, null), 'expired', 'exactly at expiresAt');
  assert.equal(standing(session(), plus(UNTIL, 0.001), null), 'expired', 'one instant after');
  assert.equal(standing(session(), AT, null), 'active', 'at activatedAt');
});

test('validity · an expired declaration says so, once, and falls back to ready', () => {
  const result = effectiveMode(session(), plus(UNTIL, 1), null);
  assert.equal(result.standing, 'expired');
  assert.equal(result.mode, 'ready', 'an expired declaration is never honoured');
  assert.equal(result.activatedAt, AT, 'the dates stay readable so the notice can be checked');
  const notice = String(result.notice);
  assert.match(notice, /tired/, 'the notice names what expired');
  assert.match(notice, /2026-10-03 14:02/, 'the notice says when it was declared');
  assert.match(notice, /expired/);
  assert.match(notice, /back to ready/);
  assert.equal(notice.includes('\n'), false, 'one line, never a paragraph');
});

test('validity · an unreadable declaration is `invalid`, never `none`, and always says so', () => {
  const broken = [
    session({ mode: 'ready' }),
    session({ schema: 2 }),
    session({ note: 'an extra key nobody declared' }),
    session({ expiresAt: 'tomorrow' }),
    session({ expiresAt: plus(AT, 48) }),
    { mode: 'tired' },
    {},
    'tired',
    42,
    [],
    true,
  ];
  for (const value of broken) {
    const result = effectiveMode(value, AT, null);
    assert.equal(result.standing, 'invalid', `${JSON.stringify(value)} must be invalid`);
    assert.equal(result.mode, 'ready');
    assert.match(String(result.notice), /session\.json/, 'the notice names the file');
    assert.match(String(result.notice), /back to ready/);
    assert.equal(String(result.notice).includes('\n'), false);
    assert.deepEqual([result.declaredBy, result.activatedAt, result.expiresAt], [null, null, null]);
  }
});

test('validity · `disabled` wins over everything and leaks nothing', () => {
  const off = prefs(false);
  for (const value of [session(), null, { broken: true }]) {
    const result = effectiveMode(value, AT, off);
    assert.deepEqual(result, {
      enabled: false,
      mode: 'ready',
      standing: 'disabled',
      declaredBy: null,
      source: null,
      activatedAt: null,
      expiresAt: null,
      notice: null,
    });
  }
  assert.equal(isEnabled(off), false);
  assert.equal(isEnabled(prefs(true)), true);
  assert.equal(isEnabled(null), true, 'the module is on until the human turns it off');
});

test('validity · the TTL is read from preferences, never estimated', () => {
  assert.equal(ttlHoursOf(null), DEFAULT_TTL_HOURS);
  assert.equal(ttlHoursOf(undefined), DEFAULT_TTL_HOURS);
  assert.equal(ttlHoursOf(prefs(true, 2)), 2);
  assert.equal(ttlHoursOf(prefs(true, 0.5)), 0.5);
  assert.equal(DEFAULT_TTL_HOURS, 4, 'the documented default is 4 hours');
});

test('validity · a preference file is honoured for enabled and ttl, and for nothing else', () => {
  // A window of 2 hours makes the stored 4-hour declaration outlive the preference, and the
  // STORED window is what counts: the TTL is applied when a mode is declared, not on read.
  const twoHours = prefs(true, 2);
  assert.equal(standing(session(), plus(AT, 3), twoHours), 'active');
  assert.equal(standing(session(), plus(AT, 5), twoHours), 'expired');
});

test('validity · `now` is a parameter, and a bad one is a contract breach, not a guess', () => {
  for (const bad of ['', 'now', '2026-10-03', '2026-13-03T00:00:00Z', null, 42, undefined]) {
    assert.throws(() => standing(session(), /** @type {string} */ (/** @type {unknown} */ (bad)), null), TypeError);
  }
});

test('validity · no input shape makes the reader throw', () => {
  const shapes = [null, undefined, 0, '', [], {}, { schema: 1 }, session({ mode: null }),
    Object.create(null), new Date(), () => 1];
  shapes.forEach((value, i) => {
    assert.doesNotThrow(() => effectiveMode(value, AT, null), `shape #${i}`);
    assert.equal(effectiveMode(value, AT, null).mode, 'ready', `shape #${i} must fall back to ready`);
  });
});

test('validity · a file the caller could not even parse is `invalid`, with the caller\'s own line', () => {
  const read = '.cellular/adaptive/session.json is not valid JSON';
  const result = effectiveMode(null, AT, null, read);
  assert.equal(result.standing, 'invalid', 'a read error must never be reported as an absence');
  assert.equal(result.mode, 'ready');
  assert.equal(result.notice, `${read} — back to ready`);
  assert.equal(standing(session(), AT, null, read), 'invalid', 'the read error wins over a parseable value');
  assert.equal(standing(session(), AT, null, ''), 'active', 'an empty string is not an error');
  assert.equal(standing(session(), AT, null, null), 'active');
});
