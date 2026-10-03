// V10..V15, V18 - the validator: what a model is ALLOWED to have said.
//
// Every test here is about the same question asked from a different angle: the model answered
// something, and what reaches a caller is only what survived a rule. The answers under test
// are the hostile doubles in `observer-advisor-answers.mjs` - rubbish, borrowed authority,
// invented references, prototype poison, a shell command and the word "approve".
//
// Pure, so none of it needs a kernel: the safety core is a function from text to findings
// about that text, which is exactly why it can be trusted with untrusted input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RECS, parseModelJson, validateOutput } from './observer-advisor/validate.mjs';
import { UNSTATED, UNSUPPORTED, plainText } from './observer-advisor/grounding.mjs';
import { HOSTILE } from './observer-advisor-answers.mjs';

test('V10 a malformed, mis-shaped, oversized or poisoned answer yields nothing and says why', () => {
  const ids = ['cell:alpha'];
  for (const [name, text] of /** @type {Array<[string, unknown]>} */ ([
    ['malformed', HOSTILE.malformed], ['oversized', HOSTILE.oversized],
    ['not a string', 42], ['null', null], ['an array', '[1,2,3]'],
  ])) {
    const out = validateOutput(text, { contextIds: ids });
    assert.deepEqual(out.recommendations, [], name);
    assert.equal(out.validation.parsed, false, name);
    assert.equal(out.validation.notes.length, 1, name);
  }
  const shape = validateOutput(HOSTILE.wrongShape, { contextIds: ids });
  assert.equal(shape.validation.parsed, true);
  assert.deepEqual(shape.recommendations, []);
  assert.match(String(shape.validation.notes[0]), /no "recommendations" array/);
});

test('V10 prototype keys are dropped by the parse itself', () => {
  const parsed = parseModelJson(HOSTILE.poisoned);
  assert.equal(parsed.ok, true);
  const value = /** @type {{ ok: true, value: Record<string, unknown> }} */ (parsed).value;
  assert.equal(Object.prototype.hasOwnProperty.call(value, '__proto__'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(value, 'constructor'), false);
  // MUTATION PROOF: the prototype itself is untouched, which is the thing a reviver that
  // merely renamed the key would not give.
  assert.equal(/** @type {Record<string, unknown>} */ ({})['polluted'], undefined);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
});

test('V11 only the declared fields survive: an invented action field cannot reach a caller', () => {
  const out = validateOutput(HOSTILE.injection, { contextIds: ['question'], contextText: '[question] q' });
  const [rec] = out.recommendations;
  assert.ok(rec !== undefined);
  assert.deepEqual(Object.keys(rec).sort(), ['evidenceRefs', 'id', 'kind', 'label', 'statement', 'uncertainty']);
  const serialised = JSON.stringify(out);
  for (const forbidden of ['"command"', '"approve"', '"capability"', '"exec"']) {
    assert.equal(serialised.includes(forbidden), false, `${forbidden} survived validation`);
  }
  // The dangerous TEXT survives, as text, in the one field that is for text. That is correct:
  // hiding it would hide what the model said. Nothing reads it as anything else.
  assert.match(rec.statement, /rm -rf/);
});

test('V12 a VERIFIED or INFERRED claim with no supplied evidence is downgraded to UNKNOWN', () => {
  const out = validateOutput(HOSTILE.ungrounded, { contextIds: ['cell:alpha'] });
  const [rec] = out.recommendations;
  // MUTATION PROOF: the assertion is on the EXACT label. A test that only checked
  // "uncertainty is set" would pass for a validator that kept the VERIFIED badge.
  assert.equal(rec?.label, 'UNKNOWN');
  assert.equal(rec?.uncertainty, UNSUPPORTED);
  assert.equal(out.validation.downgraded, 1);
  // ...and the same statement WITH a real reference keeps its label.
  const grounded = validateOutput(JSON.stringify({
    recommendations: [{
      kind: 'verification', label: 'VERIFIED', statement: 'The cell records a done criterion.',
      evidenceRefs: ['cell:alpha'], uncertainty: 'low',
    }],
  }), { contextIds: ['cell:alpha'] });
  assert.equal(grounded.recommendations[0]?.label, 'VERIFIED');
  assert.equal(grounded.validation.downgraded, 0);
});

test('V13 a reference nobody supplied is removed and recorded', () => {
  const out = validateOutput(HOSTILE.invented, { contextIds: ['cell:alpha'] });
  const [rec] = out.recommendations;
  assert.deepEqual(rec?.evidenceRefs, []);
  assert.deepEqual(out.validation.refsRemoved, ['cell:a-cell-nobody-supplied', 'log:9999']);
  assert.equal(rec?.label, 'UNKNOWN', 'nothing was left to be grounded in');
});

test('V14 a claim about tests, a build or a file the evidence does not carry is downgraded', () => {
  const claimed = validateOutput(HOSTILE.claimsResults, { contextIds: ['finding:AUD-X-001'] });
  assert.equal(claimed.recommendations[0]?.label, 'UNKNOWN');
  assert.match(String(claimed.recommendations[0]?.uncertainty), /execution result/);
  // MUTATION PROOF: the SAME statement, cited to a finding, is not downgraded - so the rule
  // is about evidence and not about vocabulary.
  const cited = validateOutput(JSON.stringify({
    recommendations: [{
      kind: 'verification', label: 'INFERRED',
      statement: 'All 453 tests pass and the build is green, so this cell is done.',
      evidenceRefs: ['finding:AUD-X-001'], uncertainty: 'low',
    }],
  }), { contextIds: ['finding:AUD-X-001'] });
  assert.equal(cited.recommendations[0]?.label, 'INFERRED');
  const path = validateOutput(JSON.stringify({
    recommendations: [{
      kind: 'architecture', label: 'INFERRED', statement: 'Split eip/plugins/unseen/thing.mjs in two.',
      evidenceRefs: ['cell:alpha'], uncertainty: 'low',
    }],
  }), { contextIds: ['cell:alpha'], contextText: '[cell:alpha] nothing about that file' });
  assert.equal(path.recommendations[0]?.label, 'UNKNOWN');
  assert.match(String(path.recommendations[0]?.uncertainty), /not in the supplied evidence/);
});

test('V15 an unknown kind is rejected, text is flattened, and silence becomes a sentence', () => {
  const out = validateOutput(HOSTILE.unknownKind, { contextIds: [] });
  assert.equal(out.recommendations.length, 1, 'the unknown kind was rejected, not renamed');
  assert.equal(out.validation.rejected, 1);
  const [rec] = out.recommendations;
  // A control character becomes a space (two words must not be silently joined); a zero-width
  // mark is DELETED (it is not a space, and keeping it would keep the disguise).
  assert.equal(rec?.statement, 'Write thenext testfirst.');
  assert.equal(rec?.uncertainty, UNSTATED);
  assert.equal(plainText('a\u0000b\u200Bc', 100), 'a bc');
  assert.equal(plainText('x'.repeat(50), 10).length, 10);
  assert.equal(out.recommendations.every((r) => /^ADV-\d{3}$/.test(r.id)), true);
});

test('V18 more recommendations than the contract admits are dropped, not truncated silently', () => {
  const out = validateOutput(HOSTILE.flood, { contextIds: [] });
  assert.equal(out.recommendations.length, MAX_RECS);
  assert.equal(out.validation.rejected, 15);
  assert.match(String(out.validation.notes.at(-1)), /more than 10 recommendations/);
});
