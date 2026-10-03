// AD28 — THE INVARIANT: no declared mode ever hides a FAIL or a security finding.
//
// Its own file, for the reason the gates suites split: this is the single most important claim
// of the Observer's adaptive integration, and the failure it prevents is a dashboard that
// looks calm. `mode-view.test.mjs` holds everything else a mode does.
//
// The claim is proved for EVERY mode, over a mixed list and over a 500-finding list, and both
// halves are asserted: the mandatory findings are SHOWN, and they are not in `hidden`.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALWAYS_SHOWN_STATUSES, MANDATORY_STATUSES, MODES, PRESENTATION_LIMIT, SECURITY_RULES,
  capFindings, isAlwaysShown, isMandatory, orderFindings,
} from '../view/mode-view.mjs';

/** @typedef {{ mark: { key: string }, rule: string, scope: string, id: string }} Row */

/** @type {(status: string, rule: string, scope?: string, id?: string) => Row} */
const row = (status, rule, scope = 'project', id = `${rule}-${status}`) => ({
  mark: { key: status }, rule, scope, id,
});

describe('AD28 · the invariant: no mode ever hides a FAIL or a security finding', () => {
  const mandatory = [
    row('FAIL', 'typecheck'),
    row('FAIL', 'acceptance-criteria', 'cell:other'),
    row('WARNING', 'secrets'),
    row('PASS', 'deps'),
    row('UNAVAILABLE', 'import-boundaries'),
    row('NOT_APPLICABLE', 'secrets', 'cell:other'),
  ];
  const noise = Array.from({ length: 40 }, (_, index) => row('PASS', 'file-size', 'project', `size-${index}`));

  test('every mandatory finding survives ordering AND capping, in every mode', () => {
    for (const mode of MODES) {
      const ordered = orderFindings([...noise, ...mandatory], mode, 'active-cell');
      const { shown, hidden } = capFindings(ordered, mode);
      const ids = shown.map((item) => item.id);
      for (const item of mandatory) {
        assert.ok(ids.includes(item.id), `${mode} dropped ${item.id}`);
        assert.equal(hidden.includes(item), false, `${mode} deferred ${item.id}`);
      }
      assert.equal(hidden.every((item) => !isMandatory(item)), true, `${mode} hid something mandatory`);
      assert.equal(hidden.every((item) => !isAlwaysShown(item)), true, `${mode} deferred something shown in full`);
      assert.equal(shown.length + hidden.length, 46, `${mode} lost a row`);
    }
  });

  test('500 findings: the cap applies to the tail only, and never to a FAIL', () => {
    const many = Array.from({ length: 500 }, (_, index) => (index % 50 === 0
      ? row('FAIL', 'tests', 'project', `fail-${index}`)
      : row('PASS', 'policy', 'project', `pass-${index}`)));
    const { shown, hidden, capped } = capFindings(orderFindings(many, 'tired'), 'tired');
    assert.equal(capped, true);
    assert.equal(shown.filter((item) => item.mark.key === 'FAIL').length, 10, 'all ten FAILs are shown');
    assert.equal(hidden.filter((item) => item.mark.key === 'FAIL').length, 0);
    assert.equal(shown.length, 10 + PRESENTATION_LIMIT);
    assert.equal(hidden.length, 500 - shown.length, 'nothing is lost: the rest is behind "show all"');
    // `show all` is total, and it is the same list in the same order.
    assert.deepEqual(capFindings(orderFindings(many, 'tired'), 'tired', true).shown.map((r) => r.id),
      orderFindings(many, 'tired').map((r) => r.id));
  });

  test('a list of nothing but mandatory findings is never capped at all', () => {
    const all = [row('FAIL', 'tests'), row('PASS', 'secrets'), row('WARNING', 'deps'), row('PASS', 'import-boundaries')];
    assert.deepEqual(capFindings(all, 'tired'), { shown: all, hidden: [], capped: false });
  });

  test('the INVARIANT is exactly FAIL plus the three named security rules', () => {
    assert.deepEqual([...MANDATORY_STATUSES], ['FAIL']);
    assert.deepEqual([...SECURITY_RULES], ['secrets', 'deps', 'import-boundaries']);
    assert.equal(isMandatory(row('FAIL', 'anything')), true);
    assert.equal(isMandatory(row('PASS', 'secrets')), true);
    assert.equal(isMandatory(row('PASS', 'deps')), true);
    assert.equal(isMandatory(row('PASS', 'import-boundaries')), true);
    assert.equal(isMandatory(row('UNAVAILABLE', 'typecheck')), false, 'not measured is not a breach');
  });

  test('what is shown in full is a SUPERSET of the invariant, never a subset', () => {
    // `WARNING` is shown in full as well: something wrong that is not a gate breach is not the
    // saving a tired reader needs. Widening this set is safe; narrowing it past the invariant
    // is what this test forbids.
    assert.deepEqual([...ALWAYS_SHOWN_STATUSES], ['FAIL', 'WARNING']);
    assert.equal(ALWAYS_SHOWN_STATUSES.includes('FAIL'), true, 'the invariant must stay inside');
    for (const status of ['FAIL', 'WARNING', 'PASS', 'UNAVAILABLE', 'NOT_APPLICABLE']) {
      for (const rule of ['secrets', 'deps', 'import-boundaries', 'file-size', 'policy']) {
        if (isMandatory(row(status, rule))) {
          assert.equal(isAlwaysShown(row(status, rule)), true, `${status}/${rule} is mandatory and must be shown`);
        }
      }
    }
    assert.equal(isAlwaysShown(row('WARNING', 'file-size')), true);
    assert.equal(isAlwaysShown(row('UNAVAILABLE', 'typecheck')), false, 'the tail is still a tail');
  });
});
