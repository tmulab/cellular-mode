// D20, V23 - the ADVISOR area's pure view-model, and the two rules the markup must keep.
//
// The question these tests ask is not "does it render": it is "could a reader mistake a
// model's sentence for a measurement". So they assert the disabled sentence verbatim, the
// label vocabulary, the AI banner, the fact that a downgrade is never silent - and, on the
// source of the browser modules, that no statement is ever assigned as markup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeProbe } from '../view/availability.mjs';
import {
  AI_BANNER, DISABLED_NOTICE, LABELS, LABEL_MARKS, UNRECOGNISED, adapterLine, adviceRows,
  advisorHeadline, disabledNotice, labelMark, refTarget, statusMeta, validationNotes,
} from '../view/advisor-view.mjs';

/** @param {string} rel */
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('V23 an absent advisor is a sentence about an OPTIONAL feature, not an error', () => {
  const absent = disabledNotice(describeProbe({ ok: false, error: { code: 'NOT_FOUND' } }));
  assert.equal(absent.disabled, true);
  assert.ok(absent.text.startsWith(DISABLED_NOTICE), absent.text);
  assert.match(absent.text, /the plugin is not installed/);
  assert.equal(absent.state, 'absent');
  // The host being down is a DIFFERENT state, and still says the feature is optional.
  const unknown = disabledNotice(describeProbe({ ok: false, error: { code: 'UPSTREAM_UNAVAILABLE' } }));
  assert.equal(unknown.state, 'unknown');
  assert.match(unknown.text, /host is not answering/);
  assert.equal(disabledNotice(describeProbe({ ok: true })).disabled, false);
  assert.equal(DISABLED_NOTICE, 'Advisor disabled (optional). Observer and Auditor work without it.');
});

test('V23 the four labels are badges with a word, a symbol and a meaning', () => {
  assert.deepEqual(LABELS, ['VERIFIED', 'INFERRED', 'PROPOSED', 'UNKNOWN']);
  for (const label of LABELS) {
    const mark = labelMark(label);
    assert.equal(mark.key, label);
    assert.ok(mark.symbol.length >= 3, label);
    assert.ok(mark.meaning.length > 20, label);
  }
  // MUTATION PROOF: a label this build does not know about is treated as UNKNOWN. A view that
  // defaulted to VERIFIED would hand a model authority by accident.
  assert.deepEqual(labelMark('TOTALLY-SURE'), UNRECOGNISED);
  assert.equal(labelMark('TOTALLY-SURE').key, 'UNKNOWN');
  assert.equal(labelMark(undefined).key, 'UNKNOWN');
  assert.notEqual(LABEL_MARKS['VERIFIED']?.tone, labelMark('nonsense').tone);
});

test('V23 a recommendation renders its statement, its uncertainty and its references', () => {
  const [row] = adviceRows([{
    id: 'ADV-001',
    kind: 'next-action',
    label: 'INFERRED',
    statement: 'Close the cell once the gate is green.',
    evidenceRefs: ['cell:observer-advisor', 'finding:AUD-SIZE-001', 'log:1', 'question'],
    uncertainty: 'read from the cell record alone',
  }]);
  assert.equal(row?.mark.key, 'INFERRED');
  assert.equal(row?.statement.text, 'Close the cell once the gate is green.');
  assert.equal(row?.uncertainty.recorded, true);
  assert.deepEqual(row?.refs.map((ref) => ref.kind), ['cell', 'finding', 'log', 'question']);
  // Only a cell reference is navigable; the others are shown as the addresses they are.
  assert.equal(row?.refs[0]?.cell, 'observer-advisor');
  assert.deepEqual(row?.refs.slice(1).map((ref) => ref.cell), [null, null, null]);
  assert.equal(refTarget('cell:none').cell, null, 'there is no cell to open when none is active');
  assert.equal(refTarget('cell:../../etc/passwd').cell, null, 'a reference is not a path');
  // A recommendation grounded in nothing says so rather than showing an empty line.
  const [bare] = adviceRows([{ id: 'ADV-001', kind: 'investigation', label: 'UNKNOWN', statement: 'x' }]);
  assert.equal(bare?.hasRefs, false);
  assert.equal(bare?.uncertainty.recorded, false);
  assert.deepEqual(adviceRows(null), []);
});

test('V23 the adapter is named, and its network status is stated out loud', () => {
  const line = adapterLine({
    adapter: 'fixture', adapterKind: 'fixture', network: false,
    contextBytes: 1234, contextItems: ['cell:a', 'log:1'], calls: 1, remaining: 19,
  });
  assert.equal(line.network, false);
  assert.match(line.text, /fixture — deterministic test adapter/);
  assert.match(line.text, /no network/);
  assert.match(line.text, /1234 bytes of context in 2 item\(s\)/);
  assert.match(line.text, /1 call\(s\) used, 19 left/);
  // An adapter that DID touch the network would say so in capitals, in the same line.
  assert.match(adapterLine({ adapter: 'x', adapterKind: 'remote', network: true }).text, /NETWORK/);
});

// The `status` capability nests the adapter (`adapter: { id, kind }`) while `advise` returns
// it flat (`adapter: "fixture"`). Reading the nested one as if it were flat is how the area
// said "unknown adapter — fixture adapter" before anything was asked — the one line whose
// whole job is to name which model is about to speak.
test('V23 the adapter is named from the STATUS payload too, not only from an answer', () => {
  const meta = statusMeta({
    enabled: true,
    adapter: { id: 'fixture', kind: 'fixture', network: false },
    network: false,
    calls: { used: 0, remaining: 20 },
  });
  assert.equal(meta.adapter, 'fixture');
  assert.equal(meta.adapterKind, 'fixture');
  assert.match(adapterLine(meta).text, /^fixture — deterministic test adapter · no network/);
  assert.match(adapterLine(meta).text, /0 call\(s\) used, 20 left/);
  // Nothing to read is reported as unknown, never as a plausible adapter name.
  assert.match(adapterLine(statusMeta(null)).text, /unknown adapter/);
});

test('V23 a downgrade, a rejection, an invented reference and a dropped item are never silent', () => {
  assert.deepEqual(validationNotes({ validation: { parsed: true, downgraded: 0, rejected: 0, refsRemoved: [] } }), []);
  const notes = validationNotes({
    contextDropped: ['log:5'],
    validation: { parsed: true, downgraded: 2, rejected: 1, refsRemoved: ['cell:ghost'] },
  });
  assert.equal(notes.length, 4);
  assert.match(String(notes[0]), /2 claim\(s\) were downgraded to UNKNOWN/);
  assert.match(String(notes[1]), /1 answer\(s\) were rejected/);
  assert.match(String(notes[2]), /invented reference\(s\) were removed: cell:ghost/);
  assert.match(String(notes[3]), /did not fit the context cap/);
  assert.match(String(validationNotes({ validation: { parsed: false } })[0]), /could not be read/);
});

test('V23 the headline distinguishes "nothing asked" from "nothing accepted"', () => {
  assert.match(advisorHeadline({}, false).text, /Nothing has been asked yet/);
  assert.match(advisorHeadline({ recommendations: [] }, true).text, /answered nothing this build could accept/);
  const answered = advisorHeadline({ recommendations: [{}, {}] }, true);
  assert.equal(answered.tone, 'answered');
  assert.match(answered.text, /2 model-written recommendation\(s\)/);
  assert.match(answered.text, /AI-generated interpretation — not a verification/);
  assert.equal(AI_BANNER, 'AI-generated interpretation — not a verification');
});

test('V23 the browser module renders text, never markup, and asks nothing on load', () => {
  // Two modules since the mode-aware cap arrived: the area and its node builders. The claim is
  // about the BROWSER CODE of this area, so both are read — splitting a file must not split a
  // security property in half.
  const rows = read('web/advisor-rows.mjs');
  const area = read('web/advisor-area.mjs') + rows;
  assert.equal(area.includes('innerHTML'), false, 'a model sentence must never be assigned as markup');
  assert.equal(area.includes('outerHTML'), false);
  assert.equal(area.includes('insertAdjacentHTML'), false);
  assert.equal(area.includes('eval('), false);
  // The first call on load is `status`, which consumes no budget; `advise` happens on click.
  assert.match(area, /await client\.call\('status'\)/);
  assert.match(area, /ask\.addEventListener\('click'/);
  assert.equal(/setInterval|setTimeout/.test(area), false, 'nothing is asked on a timer');
  assert.match(rows, /maxlength: '500'/);
  assert.equal(rows.includes('innerHTML'), false);
  assert.match(area, /data-origin/);
  // The page wires the real area now, and still declares the AI origin in the markup.
  const main = read('web/main.mjs');
  assert.match(main, /renderAdvisorArea/);
  assert.match(main, /key: ADVISOR_KEY/);
  assert.match(main, /origin: 'ai'/);
  // The two origins differ in SHAPE: the advisor section is dashed, the badges too.
  const css = read('web/app.css');
  assert.match(css, /\.badge \{[^}]*border: 1px dashed/);
  assert.match(css, /\[data-origin="ai"\][^{]*\{[^}]*border-style: dashed/);
});
