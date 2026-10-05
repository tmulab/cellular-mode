// The entry invariants, asserted on the exact status strings. An epistemic label is a
// contract with the reader: if 'DECLARED' silently became 'declared', every later gate that
// counts DECLARED statements would quietly count zero, so the strings are pinned here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_VALUE_LENGTH, NOT_ASKED, PROJECT_PATHS, STATUSES, emptyContract, entry, sanitizeValue,
} from './contract-shape.mjs';
import { codeOf } from './errors.mjs';

/** @param {() => unknown} action @returns {string | null} */
function refusal(action) {
  try {
    action();
    return null;
  } catch (error) {
    return codeOf(error);
  }
}

test('entry · the five labels are exactly these, in this order', () => {
  assert.deepEqual([...STATUSES], ['DECLARED', 'VERIFIED', 'INFERRED', 'PROPOSED', 'UNKNOWN']);
  assert.deepEqual([...PROJECT_PATHS], ['new', 'existing', 'resume']);
});

test('entry · DECLARED needs no basis and carries none', () => {
  assert.deepEqual(entry('A to-do list.', 'DECLARED'), { value: 'A to-do list.', status: 'DECLARED' });
});

test('entry · every other status must carry its basis', () => {
  for (const status of ['VERIFIED', 'INFERRED', 'PROPOSED', 'UNKNOWN']) {
    assert.equal(refusal(() => entry('x', /** @type {'VERIFIED'} */ (status))), 'BAD_ENTRY', status);
    assert.equal(refusal(() => entry('x', /** @type {'VERIFIED'} */ (status), '   ')), 'BAD_ENTRY', status);
  }
  assert.deepEqual(entry('Node.js', 'VERIFIED', 'package.json'), {
    value: 'Node.js', status: 'VERIFIED', basis: 'package.json',
  });
});

test('entry · UNKNOWN never keeps a value', () => {
  assert.deepEqual(entry('maybe Python', 'UNKNOWN', NOT_ASKED), {
    value: '', status: 'UNKNOWN', basis: NOT_ASKED,
  });
});

test('entry · a status outside the five is refused', () => {
  assert.equal(refusal(() => entry('x', /** @type {'DECLARED'} */ ('declared'))), 'BAD_ENTRY');
});

test('entry · 500 characters is the ceiling, and a longer answer is refused, not cut', () => {
  const limit = 'a'.repeat(MAX_VALUE_LENGTH);
  assert.equal(entry(limit, 'DECLARED').value.length, MAX_VALUE_LENGTH);
  assert.equal(refusal(() => entry(`${limit}b`, 'DECLARED')), 'BAD_ENTRY');
});

test('entry · control characters are stripped, newline and tab survive', () => {
  const dirty = `one\ttwo\nthree${String.fromCharCode(7)}${String.fromCharCode(27)}[31m`;
  assert.equal(sanitizeValue(dirty), 'one\ttwo\nthree[31m');
  assert.equal(entry(dirty, 'DECLARED').value, 'one\ttwo\nthree[31m');
  assert.equal(sanitizeValue('a\r\nb'), 'a\nb');
});

test('emptyContract · every single field is UNKNOWN, every list empty, nothing approved', () => {
  const contract = emptyContract('new');
  assert.equal(contract.schema, 'cellular-mode/project-contract');
  assert.equal(contract.version, 1);
  assert.equal(contract.path, 'new');
  const singles = [
    contract.identity.name, contract.objective, contract.users, contract.problem,
    contract.smallestVersion, contract.security.sensitiveData, contract.environment,
    contract.involvement,
  ];
  for (const field of singles) {
    assert.deepEqual(field, { value: '', status: 'UNKNOWN', basis: NOT_ASKED });
  }
  const lists = [
    contract.scope.in, contract.scope.out, contract.requirements.functional,
    contract.requirements.nonfunctional, contract.integrations, contract.technologies.approved,
    contract.technologies.proposed, contract.security.constraints, contract.deployment,
    contract.risks, contract.openQuestions, contract.decisions, contract.acceptance,
  ];
  for (const list of lists) assert.deepEqual(list, []);
  assert.deepEqual(contract.approval, { approved: false, at: null });
  assert.deepEqual(contract.extensions, {});
  assert.equal(contract.identity.slug, '');
});

test('emptyContract · the path must be one of the three', () => {
  assert.equal(refusal(() => emptyContract(/** @type {'new'} */ ('greenfield'))), 'BAD_ENTRY');
  for (const path of PROJECT_PATHS) assert.equal(emptyContract(path).path, path);
});
