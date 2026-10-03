// Tests for the Cellular Adaptive validators — AD6, AD7 and AD25 of
// tools/adaptive/ACCEPTANCE.md.
//
// Both validators are STRICT and TOTAL: every input is answered, nothing throws, and an
// unknown key is a rejection rather than a field that quietly survives a round trip. The
// preference table is the one that matters most: a temporary declaration that can be
// written into a persistent file stops being temporary, so that rejection has its own
// message and its own criterion.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONDITION_KEY_MESSAGE, DEFAULT_TTL_HOURS, FORBIDDEN_PREFERENCE_KEYS, TTL_MAX_HOURS,
  TTL_MIN_HOURS, UNKNOWN_KEY_MESSAGE, validatePreferences, validateSession,
} from './schema.mjs';

/** @type {(over?: Record<string, unknown>) => Record<string, unknown>} */
const session = (over = {}) => ({
  schema: 1,
  mode: 'tired',
  declaredBy: 'user',
  source: 'cli',
  command: '/modocansado',
  activatedAt: '2026-10-03T14:02:00.000Z',
  expiresAt: '2026-10-03T18:02:00.000Z',
  scope: 'session',
  ...over,
});
/** @type {(key: string) => Record<string, unknown>} */
const without = (key) => Object.fromEntries(Object.entries(session()).filter(([k]) => k !== key));
/** @type {(value: unknown) => string[]} */
const paths = (value) => {
  const result = validateSession(value);
  return result.ok ? [] : result.errors.map((e) => e.path);
};

// ------------------------------------------------------------- AD6 the session ---
test('schema · a session carrying exactly the declared contract is accepted', () => {
  const result = validateSession(session());
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.errors));
  assert.deepEqual(result.ok ? result.value : null, session());
});

test('schema · an unknown key is rejected, not ignored', () => {
  const result = validateSession(session({ note: 'anything', reason: 'tired of this' }));
  assert.equal(result.ok, false);
  assert.deepEqual(paths(session({ note: 'x' })), ['note']);
  if (!result.ok) {
    assert.deepEqual(result.errors.map((e) => e.path), ['note', 'reason']);
    for (const error of result.errors) assert.equal(error.message, UNKNOWN_KEY_MESSAGE);
  }
});

test('schema · every declared key is required', () => {
  for (const key of ['schema', 'mode', 'declaredBy', 'source', 'command', 'activatedAt', 'expiresAt', 'scope']) {
    assert.deepEqual(paths(without(key)), [key], `missing ${key} must be reported on its own path`);
  }
});

test('schema · ready is never stored, and an unknown mode is not a mode', () => {
  const ready = validateSession(session({ mode: 'ready' }));
  assert.equal(ready.ok, false);
  const message = ready.ok ? '' : (ready.errors[0]?.message ?? '');
  assert.match(message, /never stored/, 'the ready rejection must say why, not just "invalid"');
  assert.deepEqual(paths(session({ mode: 'ready' })), ['mode']);
  for (const mode of ['TIRED', 'cansado', 'rested', '', null, 7]) {
    assert.deepEqual(paths(session({ mode })), ['mode'], `mode ${JSON.stringify(mode)}`);
  }
});

test('schema · the fixed-value fields accept nothing else', () => {
  assert.deepEqual(paths(session({ schema: 2 })), ['schema']);
  assert.deepEqual(paths(session({ schema: '1' })), ['schema']);
  assert.deepEqual(paths(session({ declaredBy: 'agent' })), ['declaredBy']);
  assert.deepEqual(paths(session({ source: 'model' })), ['source']);
  assert.deepEqual(paths(session({ scope: 'global' })), ['scope']);
  assert.deepEqual(paths(session({ command: '' })), ['command']);
  assert.deepEqual(paths(session({ command: '   ' })), ['command']);
  for (const source of ['cli', 'claude-hook', 'skill']) {
    assert.equal(validateSession(session({ source })).ok, true, `source ${source} is declared`);
  }
});

test('schema · a date must be a full ISO instant with a zone', () => {
  const bad = [
    '2026-10-03 14:02', '2026-10-03T14:02:00', '2026-13-03T14:02:00Z', '03/10/2026',
    'yesterday', '', 1759500000000, null, '2026-10-03',
  ];
  for (const value of bad) {
    assert.deepEqual(paths(session({ activatedAt: value })), ['activatedAt'], `activatedAt ${JSON.stringify(value)}`);
  }
  assert.equal(validateSession(session({ activatedAt: '2026-10-03T14:02:00+02:00', expiresAt: '2026-10-03T18:02:00+02:00' })).ok, true);
});

test('schema · the declaration must expire after it was made, within the TTL bounds', () => {
  const at = '2026-10-03T14:02:00.000Z';
  /** @type {(hours: number) => string} */
  const plus = (hours) => new Date(Date.parse(at) + hours * 3600_000).toISOString();
  assert.deepEqual(paths(session({ activatedAt: at, expiresAt: at })), ['expiresAt'], 'equal is not after');
  assert.deepEqual(paths(session({ activatedAt: at, expiresAt: plus(-1) })), ['expiresAt'], 'before is not after');
  assert.deepEqual(paths(session({ activatedAt: at, expiresAt: plus(0.25) })), ['expiresAt'], 'under the floor');
  assert.deepEqual(paths(session({ activatedAt: at, expiresAt: plus(13) })), ['expiresAt'], 'over the ceiling');
  assert.equal(validateSession(session({ activatedAt: at, expiresAt: plus(TTL_MIN_HOURS) })).ok, true, 'the floor itself is valid');
  assert.equal(validateSession(session({ activatedAt: at, expiresAt: plus(TTL_MAX_HOURS) })).ok, true, 'the ceiling itself is valid');
  assert.equal(validateSession(session({ activatedAt: at, expiresAt: plus(DEFAULT_TTL_HOURS) })).ok, true, 'the default fits');
});

test('schema · a non-object is answered, never thrown at', () => {
  for (const value of [null, undefined, [], 'tired', 42, true, () => 1]) {
    const result = validateSession(value);
    assert.equal(result.ok, false, `validateSession(${typeof value})`);
    assert.deepEqual(result.ok ? [] : result.errors.map((e) => e.path), ['']);
  }
});

test('schema · every error is a { path, message } pair with a non-empty message', () => {
  const result = validateSession(session({ mode: 'nope', scope: 'global', extra: 1 }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  for (const error of result.errors) {
    assert.deepEqual(Object.keys(error).sort(), ['message', 'path']);
    assert.equal(typeof error.path, 'string');
    assert.ok(error.message.length > 0);
  }
});

// --------------------------------------------- AD7 / AD25 the preference file ----
test('schema · preferences accept the declared keys and fill the documented defaults', () => {
  const minimal = validatePreferences({ schema: 1 });
  assert.deepEqual(minimal.ok ? minimal.value : null, { schema: 1, enabled: true, ttlHours: DEFAULT_TTL_HOURS });
  const full = validatePreferences({ schema: 1, enabled: false, ttlHours: 2, communication: 'concise' });
  assert.deepEqual(full.ok ? full.value : null, { schema: 1, enabled: false, ttlHours: 2, communication: 'concise' });
});

test('schema · preferences reject every condition key, with a message that says why', () => {
  const expected = [
    'mode', 'modes', 'condition', 'conditions', 'tired', 'ready', 'focus', 'explore',
    'declaredBy', 'activatedAt', 'expiresAt', 'command', 'scope', 'source',
  ];
  assert.deepEqual([...FORBIDDEN_PREFERENCE_KEYS], expected);
  for (const key of expected) {
    const result = validatePreferences({ schema: 1, [key]: 'tired' });
    assert.equal(result.ok, false, `preferences must reject ${key}`);
    if (result.ok) continue;
    assert.deepEqual(result.errors.map((e) => e.path), [key]);
    assert.equal(result.errors[0]?.message, CONDITION_KEY_MESSAGE);
  }
  assert.notEqual(CONDITION_KEY_MESSAGE, UNKNOWN_KEY_MESSAGE, 'the two rejections are different facts');
  assert.match(CONDITION_KEY_MESSAGE, /temporary/);
});

test('schema · preferences are strict about everything else too', () => {
  /** @type {(value: unknown) => string[]} */
  const bad = (value) => {
    const result = validatePreferences(value);
    return result.ok ? [] : result.errors.map((e) => e.path);
  };
  assert.deepEqual(bad({ schema: 1, nickname: 'x' }), ['nickname']);
  assert.deepEqual(bad({ enabled: true }), ['schema']);
  assert.deepEqual(bad({ schema: 1, enabled: 'yes' }), ['enabled']);
  assert.deepEqual(bad({ schema: 1, ttlHours: 0.25 }), ['ttlHours']);
  assert.deepEqual(bad({ schema: 1, ttlHours: 12.5 }), ['ttlHours']);
  assert.deepEqual(bad({ schema: 1, ttlHours: '4' }), ['ttlHours']);
  assert.deepEqual(bad({ schema: 1, ttlHours: Number.NaN }), ['ttlHours']);
  assert.deepEqual(bad({ schema: 1, communication: 'terse' }), ['communication']);
  assert.deepEqual(bad(null), ['']);
  assert.deepEqual(bad('concise'), ['']);
  assert.equal(validatePreferences({ schema: 1, ttlHours: TTL_MIN_HOURS }).ok, true);
  assert.equal(validatePreferences({ schema: 1, ttlHours: TTL_MAX_HOURS }).ok, true);
});
