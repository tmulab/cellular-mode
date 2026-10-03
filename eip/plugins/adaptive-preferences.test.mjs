// AD27 — what `current` ANSWERS, for each of the five standings.
//
// Five situations, five distinguishable answers. Collapsing any two of them would report
// something untrue, and the two that matter most are the quiet ones: an EXPIRED declaration is
// not an active one, and an INVALID file is not an absence. Every expectation below is the
// whole object, field for field, because a partial assertion is how a field starts lying.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_SESSION, EXPIRED_SESSION, NOW, loadAdaptive, readyAnswer,
} from './adaptive-preferences-fixture.mjs';
import { PREFERENCES_LABEL, SESSION_LABEL, parseState, readPreferences } from './adaptive-preferences/index.mjs';
import { valueOf } from '../kernel/assertions.mjs';

/** @type {(options: Parameters<typeof loadAdaptive>[0]) => Promise<Record<string, unknown>>} */
async function answer(options) {
  const a = await loadAdaptive(options);
  try {
    return /** @type {Record<string, unknown>} */ (valueOf(await a.call()));
  } finally {
    await a.cleanup();
  }
}

test('AD27 ACTIVE: the declaration is reported verbatim, with its window and its source', async () => {
  assert.deepEqual(await answer({ session: ACTIVE_SESSION }), {
    enabled: true,
    mode: 'tired',
    standing: 'active',
    declaredBy: 'user',
    source: 'claude-hook',
    activatedAt: '2026-10-03T13:26:00.000Z',
    expiresAt: '2026-10-03T17:26:00.000Z',
    notice: null,
  });
  // `command` is NOT published: the text a human typed is in their own file, and a dashboard
  // has no use for it. The schema forbids the extra key, so this is a tested decision.
  assert.equal('command' in await answer({ session: ACTIVE_SESSION }), false);
});

test('AD27 NONE: no declaration is `ready`, with nothing to report — absence is not an event', async () => {
  assert.deepEqual(await answer({}), readyAnswer('none'));
  assert.deepEqual(await answer({ preferences: { schema: 1, enabled: true, ttlHours: 4 } }),
    readyAnswer('none'), 'preferences without a declaration are still no declaration');
});

test('AD27 EXPIRED: back to `ready`, the mode NOT honoured, and the human told once', async () => {
  const value = await answer({ session: EXPIRED_SESSION });
  assert.equal(value['standing'], 'expired');
  assert.equal(value['mode'], 'ready', 'an expired declaration is never honoured');
  assert.equal(value['notice'], 'your earlier declaration (tired, 2026-10-03 08:00) expired — back to ready');
  assert.equal(value['expiresAt'], '2026-10-03T12:00:00.000Z', 'the window is still reported, so the reader can see why');
  // The boundary is HALF-OPEN: the instant of expiry is already expired. (`activatedAt` is
  // moved back because a window must be non-empty to be a valid declaration at all.)
  const atBoundary = await answer({ session: { ...EXPIRED_SESSION, expiresAt: NOW } });
  assert.equal(atBoundary['standing'], 'expired');
  const oneMsBefore = await answer({ session: { ...EXPIRED_SESSION, expiresAt: '2026-10-03T13:26:00.001Z' } });
  assert.equal(oneMsBefore['standing'], 'active', 'one millisecond of window left is still a window');
});

test('AD27 INVALID: a file that cannot be read as a declaration is never rendered as `none`', async () => {
  const notJson = await answer({ sessionText: '{ "mode": "tired"' });
  assert.equal(notJson['standing'], 'invalid');
  assert.equal(notJson['mode'], 'ready');
  assert.equal(notJson['notice'], `${SESSION_LABEL} is not valid JSON — back to ready`);

  // Unknown keys, a bad mode, a window that runs backwards and a missing field: each is a
  // file somebody wrote, reported rather than repaired, deleted or guessed at.
  for (const broken of [
    { ...ACTIVE_SESSION, extra: 'x' },
    { ...ACTIVE_SESSION, mode: 'ready' },
    { ...ACTIVE_SESSION, mode: 'exhausted' },
    { ...ACTIVE_SESSION, expiresAt: '2026-10-03T10:00:00.000Z' },
    { ...ACTIVE_SESSION, declaredBy: 'agent' },
    { ...ACTIVE_SESSION, source: 'inferred' },
    { schema: 2, mode: 'tired' },
    [ACTIVE_SESSION],
    'tired',
  ]) {
    const value = await answer({ session: broken });
    assert.equal(value['standing'], 'invalid', `${JSON.stringify(broken).slice(0, 50)} must be invalid`);
    assert.equal(value['mode'], 'ready');
    assert.match(String(value['notice']), /could not be read as a declaration — back to ready/);
  }
});

test('AD27 DISABLED: the human turned the module off, so no mode applies and nothing is shown', async () => {
  const value = await answer({ session: ACTIVE_SESSION, preferences: { schema: 1, enabled: false, ttlHours: 4 } });
  assert.deepEqual(value, readyAnswer('disabled', { enabled: false }));
  assert.equal(value['mode'], 'ready', 'a disabled module reports no declared mode, even with one on disk');
});

test('AD27 an unusable PREFERENCE file is reported instead of a mode, never around it', async () => {
  const notJson = await answer({ session: ACTIVE_SESSION, preferencesText: 'nope' });
  assert.equal(notJson['standing'], 'invalid');
  assert.equal(notJson['mode'], 'ready');
  assert.equal(notJson['notice'], `${PREFERENCES_LABEL} is not valid JSON — back to ready`);
  // A preference file may NEVER carry a mode: that is the whole point of the forbidden keys,
  // and a reader that accepted one would turn a temporary declaration into a persistent trait.
  const withMode = await answer({ session: ACTIVE_SESSION, preferences: { schema: 1, enabled: true, mode: 'tired' } });
  assert.equal(withMode['standing'], 'invalid');
  assert.match(String(withMode['notice']), /not a valid preference file \(mode: /);
  const outOfBounds = await answer({ session: ACTIVE_SESSION, preferences: { schema: 1, enabled: true, ttlHours: 99 } });
  assert.equal(outOfBounds['standing'], 'invalid');
});

test('AD27 a longer declared TTL is honoured, because validity is DECLARED and not estimated', async () => {
  // The window lives in the session file; the preference only decides what a NEW declaration
  // gets. So a 12-hour preference does not extend a declaration that already expired.
  const value = await answer({
    session: EXPIRED_SESSION,
    preferences: { schema: 1, enabled: true, ttlHours: 12 },
  });
  assert.equal(value['standing'], 'expired', 'a preference never re-opens a closed window');
});

test('AD27 the two pure readers are total: no throw, no partial value', () => {
  assert.deepEqual(parseState(null, SESSION_LABEL), { value: null, error: null });
  assert.deepEqual(parseState('[]', SESSION_LABEL), { value: [], error: null });
  assert.deepEqual(parseState('{', SESSION_LABEL), { value: null, error: `${SESSION_LABEL} is not valid JSON` });
  assert.deepEqual(readPreferences(null), { value: null, error: null });
  assert.deepEqual(readPreferences('{"schema":1}'), { value: { schema: 1, enabled: true, ttlHours: 4 }, error: null });
  assert.equal(readPreferences('{"schema":1,"condition":"tired"}').value, null);
  assert.match(String(readPreferences('{"schema":1,"condition":"tired"}').error), /^.cellular\/adaptive\/preferences\.json is not a valid preference file/);
});
