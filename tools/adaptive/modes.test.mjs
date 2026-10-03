// Tests for the Cellular Adaptive registry — AD1..AD5, AD23, AD24, AD26 of
// tools/adaptive/ACCEPTANCE.md.
//
// Two of them are not assertions about a function but about the SHAPE of the module:
// AD26 reads the source of the pure modules and insists there is no code path that picks
// a mode from observed behaviour. A rule like that cannot be expressed as a unit test of
// a function, because the defect it guards against is a function that does not exist yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripNoise } from '../gates/top-level.mjs';
import * as modes from './modes.mjs';
import { ADAPTABLE, DEFAULT_MODE, INVARIANTS, MODES, MODE_IDS, resolveMode } from './modes.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** @type {(rel: string) => string} */
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
/** @type {(rel: string) => number} */
const lines = (rel) => {
  const parts = read(rel).split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.length;
};

// ------------------------------------------------------------- AD2 registry -----
test('modes · the registry is frozen data with exactly four modes', () => {
  assert.equal(Object.isFrozen(MODES), true);
  assert.deepEqual([...MODE_IDS], ['ready', 'tired', 'focus', 'explore']);
  for (const mode of MODES) {
    assert.equal(Object.isFrozen(mode), true, `${mode.id} record must be frozen`);
    assert.equal(Object.isFrozen(mode.aliases), true, `${mode.id} aliases must be frozen`);
    assert.equal(mode.policyFile, `adaptive/policies/${mode.id}.md`);
  }
});

test('modes · ready is the default and the only non-temporary mode', () => {
  assert.equal(DEFAULT_MODE, 'ready');
  const temporary = MODES.filter((m) => m.temporary).map((m) => m.id);
  assert.deepEqual(temporary, ['tired', 'focus', 'explore']);
  assert.equal(MODES.find((m) => m.id === 'ready')?.temporary, false);
});

test('modes · the alias table is exactly the one the spec declares', () => {
  /** @type {Record<string, string[]>} */
  const expected = {
    ready: ['modoestoubem', 'estoubem'],
    tired: ['modocansado', 'cansado'],
    focus: ['modofoco', 'foco'],
    explore: ['modoexplorar', 'explorar'],
  };
  for (const mode of MODES) assert.deepEqual([...mode.aliases], expected[mode.id]);
});

// ---------------------------------------------------------- AD3 resolveMode -----
test('modes · resolveMode accepts the id and the aliases, slashed or bare, any case', () => {
  const table = [
    ['/tired', 'tired'], ['tired', 'tired'], ['/modocansado', 'tired'], ['cansado', 'tired'],
    ['/ready', 'ready'], ['modoestoubem', 'ready'], ['/ESTOUBEM', 'ready'],
    ['/focus', 'focus'], ['MODOFOCO', 'focus'], ['/foco', 'focus'],
    [' /explorar ', 'explore'], ['Explore', 'explore'], ['/modoexplorar', 'explore'],
  ];
  for (const [input, want] of table) assert.equal(resolveMode(input), want, `resolveMode(${JSON.stringify(input)})`);
});

test('modes · resolveMode returns null for everything else, and never throws', () => {
  const rejected = [
    '', ' ', '/', '//tired', 'tired now', 'tire', 'tiredness', 'cansadoo', 'pause',
    '/cell', 'modo', 'ready!', '\\tired', 'tired/', undefined, null, 42, {}, ['tired'], true,
  ];
  for (const input of rejected) assert.equal(resolveMode(input), null, `resolveMode(${JSON.stringify(input)})`);
});

// --------------------------------------------------- AD1 the policy documents ---
test('modes · every policy file exists and fits its injection budget', () => {
  assert.ok(lines('adaptive/policies/boundaries.md') <= 12, 'boundaries.md budget is 12 lines');
  for (const mode of MODES) {
    const count = lines(mode.policyFile);
    assert.ok(count > 0, `${mode.policyFile} must not be empty`);
    assert.ok(count <= 25, `${mode.policyFile} has ${count} lines, budget is 25`);
  }
  assert.equal(modes.BOUNDARIES_POLICY, 'adaptive/policies/boundaries.md');
});

test('modes · a policy file states the mode and its aliases in its first line', () => {
  for (const mode of MODES) {
    const first = read(mode.policyFile).split('\n')[0] ?? '';
    assert.match(first, new RegExp(`\`/${mode.id}\``), `${mode.policyFile} must name /${mode.id}`);
    for (const alias of mode.aliases) assert.match(first, new RegExp(alias), `${mode.policyFile}: ${alias}`);
  }
});

// -------------------------------------- AD24 no mode hides a finding or a prompt -
test('modes · every temporary policy puts security findings and approvals out of reach', () => {
  for (const mode of MODES.filter((m) => m.temporary)) {
    const text = read(mode.policyFile).toLowerCase();
    assert.match(text, /security (finding|notification)/, `${mode.policyFile}: security findings`);
    assert.match(text, /approval prompt/, `${mode.policyFile}: approval prompts`);
  }
  const boundaries = read('adaptive/policies/boundaries.md').toLowerCase();
  assert.match(boundaries, /always shown/);
  assert.match(boundaries, /not an authorization/);
});

// ------------------------------------------ AD4 / AD5 / AD23 the two data lists --
test('modes · INVARIANTS covers the declared ground, as data', () => {
  assert.equal(Object.isFrozen(INVARIANTS), true);
  const text = INVARIANTS.map((i) => i.statement).join(' | ').toLowerCase();
  const required = [
    /typecheck/, /build/, /tests?\b/, /security finding/, /approval/, /acceptance criteria/,
    /unknown/, /least privilege|permission/, /one active cell/, /append/, /uncertainty/,
    /authorization/, /declared/,
  ];
  for (const re of required) assert.match(text, re, `INVARIANTS must cover ${re}`);
  for (const item of INVARIANTS) {
    assert.match(item.id, /^INV-\d{2}$/);
    assert.equal(Object.isFrozen(item), true);
  }
  assert.ok(INVARIANTS.length >= 9, `expected the full list, got ${INVARIANTS.length}`);
});

test('modes · ADAPTABLE names only presentational dimensions, never an invariant one', () => {
  assert.equal(Object.isFrozen(ADAPTABLE), true);
  const forbidden = /\b(gate|approval|permission|credential|secret|security|test)/i;
  for (const item of ADAPTABLE) {
    assert.match(item.id, /^ADA-\d{2}$/);
    assert.equal(Object.isFrozen(item), true);
    const text = `${item.dimension} ${item.note}`;
    assert.doesNotMatch(text, forbidden, `ADAPTABLE ${item.id} must not touch an invariant`);
  }
  assert.ok(ADAPTABLE.length >= 6, `expected the dimension list, got ${ADAPTABLE.length}`);
});

test('modes · INVARIANTS is mode-independent: nothing in the module can vary it', () => {
  const before = JSON.stringify(INVARIANTS);
  for (const mode of MODES) assert.equal(resolveMode(mode.id), mode.id);
  assert.equal(JSON.stringify(INVARIANTS), before);
  assert.throws(() => {
    /** @type {{ push: (v: unknown) => void }} */ (/** @type {unknown} */ (INVARIANTS)).push({ id: 'INV-99' });
  }, TypeError);
});

// ---------------------------------------------- AD26 nothing infers a human state -
test('modes · resolveMode is the only function the registry exports', () => {
  const functions = Object.entries(modes).filter(([, v]) => typeof v === 'function').map(([k]) => k);
  assert.deepEqual(functions, ['resolveMode'], 'a second mode-producing function needs a new criterion');
});

test('modes · no pure module contains a path that picks a mode from behaviour', () => {
  for (const rel of ['tools/adaptive/modes.mjs', 'tools/adaptive/schema.mjs', 'tools/adaptive/types.mjs']) {
    const code = stripNoise(read(rel));
    assert.doesNotMatch(code, /infer|detect|classif|diagnos|heuristic/i, `${rel}: no state guessing`);
    assert.doesNotMatch(code, /Date\.now|performance\.now|process\.hrtime/, `${rel}: no clock-driven mode`);
    assert.doesNotMatch(code, /node:(fs|child_process|os|http)/, `${rel}: must stay pure`);
  }
});
