// The last gate before a contract may be committed.
//
// RULE FOR THIS FILE: every needle is assembled from fragments at runtime, exactly as
// tests/leaks.test.mjs and tools/gates/secrets.mjs do it, so this file contains no literal
// credential, no literal machine path and no literal address — and therefore never flags
// itself in the repository's own hygiene scan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { codeOf, detailsOf } from './errors.mjs';
import { readyContract } from './fixtures/index.mjs';
import { assertPublishable, describeFindings, publicationCheck, walkStrings } from './publication.mjs';

/** @type {(...parts: string[]) => string} */
const j = (...parts) => parts.join('');

/** The ready fixture with one field rewritten. @type {(field: string, text: string) => any} */
function saying(field, text) {
  /** @type {any} */
  const copy = structuredClone(readyContract);
  copy[field] = { value: text, status: 'DECLARED' };
  return copy;
}

test('publication · the ready fixture passes, and passing says nothing about safety', () => {
  assert.deepEqual(publicationCheck(readyContract), { ok: true, findings: [] });
});

test('publication · a credential-shaped value is found, wherever it sits', () => {
  const token = j('g', 'h', 'p', '_', 'A1b2C3d4E5f6G7h8I9j0');
  const found = publicationCheck(saying('objective', `Deploy with ${token}`));
  assert.equal(found.ok, false);
  assert.deepEqual(found.findings, [{ path: 'objective.value', kind: 'forge-token' }]);
  const assignment = j('pass', 'word', '=', 'correct-horse-battery');
  assert.deepEqual(publicationCheck(saying('problem', assignment)).findings, [
    { path: 'problem.value', kind: 'credential-assignment' },
  ]);
});

test('publication · a machine-local path is found, in a value and in a basis', () => {
  const drivePath = j('D', ':', '\\', 'work', '\\', 'notes');
  assert.deepEqual(publicationCheck(saying('environment', `It runs from ${drivePath}`)).findings, [
    { path: 'environment.value', kind: 'windows-path' },
  ]);
  const homePath = j('/', 'home', '/', 'someone', '/', 'projects');
  /** @type {any} */
  const inBasis = structuredClone(readyContract);
  inBasis.technologies.approved = [{ value: 'Node.js', status: 'VERIFIED', basis: `found at ${homePath}` }];
  assert.deepEqual(publicationCheck(inBasis).findings, [
    { path: 'technologies.approved[0].basis', kind: 'home-path' },
  ]);
});

test('publication · an address or a telephone number is personal data and is found', () => {
  const address = j('ada', '@', 'example', '.', 'org');
  assert.deepEqual(publicationCheck(saying('users', `Write to ${address}`)).findings, [
    { path: 'users.value', kind: 'email-address' },
  ]);
  const international = j('+', '55', ' ', '11', ' ', '98765', '-', '4321');
  assert.deepEqual(publicationCheck(saying('users', `Call ${international}`)).findings, [
    { path: 'users.value', kind: 'phone-international' },
  ]);
  const grouped = j('555', '-', '010', '-', '1234');
  assert.deepEqual(publicationCheck(saying('users', `Ring ${grouped}`)).findings, [
    { path: 'users.value', kind: 'phone-grouped' },
  ]);
  const bracketed = j('(', '011', ')', ' ', '98765', '-', '4321');
  assert.ok(publicationCheck(saying('users', bracketed)).findings.some((f) => f.kind === 'phone-bracketed'));
});

test('publication · a finding never echoes what it objected to', () => {
  const token = j('x', 'o', 'x', 'b', '-', 'ABCDEFGH1234');
  const result = publicationCheck(saying('objective', `use ${token}`));
  const reported = JSON.stringify(result) + describeFindings(result.findings).join('\n');
  assert.ok(!reported.includes(token), 'the gate must not make a second copy of the secret');
  assert.ok(reported.includes('objective.value'), 'the path is what the person needs');
  assert.ok(reported.includes('chat-token'), 'and the shape, so they know what to look for');
});

test('publication · ordinary contract content raises nothing', () => {
  // Instants, version numbers, relative evidence paths and quantities are not personal data,
  // and a gate that cries wolf over them teaches people to add exclusions.
  /** @type {any} */
  const ordinary = structuredClone(readyContract);
  ordinary.approval = { approved: true, at: '2026-10-04T11:22:33.123Z' };
  ordinary.decisions = [{ id: 'D1', question: 'Which runtime?', proposal: 'Node.js 24.19.0', status: 'approved', at: '2026-10-04T11:22:33.123Z' }];
  ordinary.technologies.approved = [{ value: 'Node.js', status: 'VERIFIED', basis: 'package.json' }];
  ordinary.risks = [{ value: 'The list may grow past 10 000 items in 2027.', status: 'DECLARED' }];
  assert.deepEqual(publicationCheck(ordinary), { ok: true, findings: [] });
});

test('publication · every string is reached, including inside extensions', () => {
  /** @type {any} */
  const deep = structuredClone(readyContract);
  deep.extensions = { 'x-house-rule': { notes: [j('A', 'K', 'I', 'A', '0123456789ABCDEF')] } };
  assert.deepEqual(publicationCheck(deep).findings, [
    { path: 'extensions.x-house-rule.notes[0]', kind: 'cloud-access-key-id' },
  ]);
  const walked = walkStrings(readyContract).map(([path]) => path);
  assert.ok(walked.includes('schema'));
  assert.ok(walked.includes('identity.slug'));
  assert.ok(walked.includes('scope.in[0].value'));
  assert.ok(walked.includes('acceptance[0].value'));
});

test('publication · total: a non-object, and a self-referential object, are both answered', () => {
  for (const value of [null, undefined, 7, [], {}]) {
    assert.deepEqual(publicationCheck(value), { ok: true, findings: [] });
  }
  assert.deepEqual(publicationCheck('a bare string'), { ok: true, findings: [] });
  /** @type {any} */
  const loop = { a: {} };
  loop.a.back = loop;
  assert.deepEqual(publicationCheck(loop), { ok: true, findings: [] }, 'the depth cap stops the walk');
});

test('publication · one finding per path and shape, not one per occurrence', () => {
  const token = j('s', 'k', '-', 'A1b2C3d4E5f6G7h8');
  const twice = saying('objective', `${token} and ${token}`);
  assert.deepEqual(publicationCheck(twice).findings, [{ path: 'objective.value', kind: 'model-api-key' }]);
});

test('assertPublishable · the shared refusal, with its list in details', () => {
  assert.equal(assertPublishable(readyContract), undefined);
  const address = j('bob', '@', 'example', '.', 'net');
  try {
    assertPublishable(saying('users', address));
    assert.fail('an address must refuse publication');
  } catch (error) {
    assert.equal(codeOf(error), 'PUBLICATION_CHECK');
    assert.deepEqual(detailsOf(error), { findings: [{ path: 'users.value', kind: 'email-address' }] });
  }
  try {
    assertPublishable({ schema: 'wrong' });
    assert.fail('an invalid contract is refused before the publication question is asked');
  } catch (error) {
    assert.equal(codeOf(error), 'BAD_CONTRACT');
  }
});
