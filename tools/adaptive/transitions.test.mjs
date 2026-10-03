// Tests for the two state transitions — AD11, AD13 and AD15 of
// tools/adaptive/ACCEPTANCE.md.
//
// There are only two transitions, and the asymmetry between them is the whole design.
// Declaring a temporary mode BUILDS a record. Declaring `ready` builds nothing: it answers
// "no session", and the caller deletes the file. Returning an empty session for `ready`
// would store the fact that somebody once declared something, which is exactly what this
// module promises not to keep.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TTL_HOURS, TTL_MAX_HOURS, TTL_MIN_HOURS, validateSession } from './schema.mjs';
import { MODES } from './modes.mjs';
import { VOCABULARY, declare, reset } from './transitions.mjs';

const NOW = '2026-10-03T14:02:00.000Z';
/** @type {(over?: Record<string, unknown>) => Record<string, unknown>} */
const options = (over = {}) => ({ source: 'cli', command: '/modocansado', now: NOW, ...over });
/** @type {(result: { ok: boolean, errors?: ReadonlyArray<{ path: string }> }) => string[]} */
const paths = (result) => (result.ok ? [] : (result.errors ?? []).map((e) => e.path));

test('transitions · declaring a temporary mode builds a record the schema accepts', () => {
  const result = declare('/modocansado', options());
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.errors));
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    schema: 1,
    mode: 'tired',
    declaredBy: 'user',
    source: 'cli',
    command: '/modocansado',
    activatedAt: NOW,
    expiresAt: '2026-10-03T18:02:00.000Z',
    scope: 'session',
  });
  assert.equal(validateSession(result.value).ok, true, 'the builder and the validator must agree');
});

test('transitions · the command is stored exactly as typed, and the mode is resolved from it', () => {
  const result = declare('/MODOCANSADO', options({ command: '/MODOCANSADO' }));
  assert.equal(result.ok && result.value?.command, '/MODOCANSADO', 'verbatim, not normalised');
  assert.equal(result.ok && result.value?.mode, 'tired');
  const bare = declare('foco', options({ command: 'foco', source: 'skill' }));
  assert.equal(bare.ok && bare.value?.mode, 'focus');
  assert.equal(bare.ok && bare.value?.source, 'skill');
});

test('transitions · declaring ready stores NOTHING, under every alias', () => {
  for (const alias of ['ready', '/ready', 'modoestoubem', '/ESTOUBEM']) {
    const result = declare(alias, options({ command: alias }));
    assert.equal(result.ok, true, `${alias} must be accepted`);
    assert.equal(result.ok && result.value, null, `${alias} must produce no session`);
  }
  const back = reset();
  assert.equal(back.ok && back.value, null, 'reset is the same transition under another name');
});

test('transitions · every temporary mode in the registry can be declared', () => {
  for (const mode of MODES.filter((m) => m.temporary)) {
    for (const token of [mode.id, ...mode.aliases]) {
      const result = declare(token, options({ command: `/${token}` }));
      assert.equal(result.ok && result.value?.mode, mode.id, `${token} -> ${mode.id}`);
    }
  }
});

test('transitions · an unknown mode is refused with the whole valid vocabulary', () => {
  const result = declare('exhausted', options({ command: '/exhausted' }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(paths(result), ['mode']);
  const message = result.errors[0]?.message ?? '';
  assert.match(message, /exhausted/, 'the message quotes what the human typed');
  for (const mode of MODES) {
    assert.match(message, new RegExp(mode.id), `the valid list must name ${mode.id}`);
    for (const alias of mode.aliases) assert.match(message, new RegExp(alias), `and ${alias}`);
  }
  for (const bad of ['', '/', null, undefined, 42, {}, 'tired now']) {
    assert.deepEqual(paths(declare(bad, options())), ['mode'], `${JSON.stringify(bad)}`);
  }
});

test('transitions · the TTL is declared, bounded, and defaults to four hours', () => {
  /** @type {(r: ReturnType<typeof declare>) => number} */
  const span = (r) => (r.ok && r.value
    ? (Date.parse(r.value.expiresAt) - Date.parse(r.value.activatedAt)) / 3_600_000
    : Number.NaN);
  assert.equal(span(declare('tired', options())), DEFAULT_TTL_HOURS);
  assert.equal(span(declare('tired', options({ ttlHours: TTL_MIN_HOURS }))), TTL_MIN_HOURS);
  assert.equal(span(declare('tired', options({ ttlHours: TTL_MAX_HOURS }))), TTL_MAX_HOURS);
  assert.equal(span(declare('tired', options({ ttlHours: 2 }))), 2);
  for (const bad of [0, 0.25, 13, -4, Number.NaN, Number.POSITIVE_INFINITY, '4', null]) {
    assert.deepEqual(paths(declare('tired', options({ ttlHours: bad }))), ['ttlHours'], `${String(bad)}`);
  }
});

test('transitions · the provenance fields are required, never defaulted', () => {
  assert.deepEqual(paths(declare('tired', options({ source: 'model' }))), ['source']);
  assert.deepEqual(paths(declare('tired', options({ source: undefined }))), ['source']);
  assert.deepEqual(paths(declare('tired', options({ command: '' }))), ['command']);
  assert.deepEqual(paths(declare('tired', options({ command: '   ' }))), ['command']);
  assert.deepEqual(paths(declare('tired', options({ command: 7 }))), ['command']);
  for (const source of ['cli', 'claude-hook', 'skill']) {
    assert.equal(declare('tired', options({ source })).ok, true, `${source} is a declared source`);
  }
});

test('transitions · `now` must be an ISO instant, and a bad one is reported, not guessed', () => {
  for (const bad of ['', 'now', '2026-10-03', '2026-10-03 14:02', '2026-13-03T00:00:00Z', null, 42]) {
    assert.deepEqual(paths(declare('tired', options({ now: bad }))), ['now'], `${String(bad)}`);
  }
  assert.equal(declare('tired', options({ now: '2026-10-03T14:02:00+02:00' })).ok, true);
});

test('transitions · the vocabulary is the registry, with nothing invented', () => {
  const expected = MODES.flatMap((m) => [m.id, ...m.aliases]);
  assert.deepEqual([...VOCABULARY], expected);
  assert.equal(Object.isFrozen(VOCABULARY), true);
});

test('transitions · nothing throws, whatever it is handed', () => {
  for (const input of [null, undefined, 0, [], {}, () => 1]) {
    assert.doesNotThrow(() => declare(input, options()));
    assert.doesNotThrow(() => declare('tired', /** @type {never} */ (/** @type {unknown} */ (input))));
  }
});
