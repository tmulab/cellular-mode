// The exported prompt, as a document: does it carry every section a cell needs, does it say
// the same thing twice in a row, and does an unapproved contract produce a prompt that cannot
// authorise implementation? Safety lives in prompt-safety.test.mjs, size in prompt-size.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { codeOf } from './errors.mjs';
import { exportable, readyContract } from './fixtures/index.mjs';
import { proposeFirstCell } from './first-cell.mjs';
import { PROMPT_BUDGET_BYTES, PROMPT_HEADER, renderPrompt } from './prompt.mjs';
import { DRAFT_HEADER, MODE_NOTES, REQUIRED_SECTIONS } from './prompt-rules.mjs';
import { MARKER_WORD } from './prompt-data.mjs';
import { PROPOSED_LABEL, inertText } from './sanitize.mjs';
import { entriesAt } from './fields.mjs';
import { FIELD_KINDS } from './validate-parts.mjs';

/** The two implemented adapters, exercised side by side everywhere. */
const ADAPTER_IDS = ['neutral', 'claude-code'];

/** @type {(text: string, heading: string) => string} the body of one `## ` section */
function section(text, heading) {
  const start = text.indexOf(`## ${heading}\n`);
  assert.ok(start >= 0, `no such section: ${heading}`);
  const rest = text.slice(start + heading.length + 4);
  const end = rest.indexOf('\n## ');
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

test('prompt · every required section is present, in both adapters', () => {
  const { contract, cell } = exportable('simple-new');
  for (const id of ADAPTER_IDS) {
    const { text, adapter } = renderPrompt(contract, cell, id);
    assert.equal(adapter, id);
    for (const heading of REQUIRED_SECTIONS) {
      assert.ok(text.includes(`## ${heading}\n`), `${id}: missing section ${heading}`);
    }
    assert.ok(text.startsWith(`${PROMPT_HEADER}\n`), `${id}: wrong header`);
    assert.equal(text.split(`<<<${MARKER_WORD}`).length - 1, 2, `${id}: not exactly one DATA block`);
  }
});

test('prompt · the three layers are reported, and their sizes add up to the text', () => {
  const { contract, cell } = exportable('simple-new');
  const result = renderPrompt(contract, cell, 'neutral');
  assert.deepEqual(Object.keys(result.layers).sort(), ['cell', 'method', 'project']);
  for (const [name, size] of Object.entries(result.layers)) {
    assert.ok(size > 0, `${name} layer is empty`);
    assert.ok(size < result.bytes, `${name} layer is the whole prompt`);
  }
  assert.ok(result.bytes <= PROMPT_BUDGET_BYTES, `over budget: ${result.bytes}`);
  assert.deepEqual(result.warnings, []);
  assert.match(result.nonce, /^[0-9a-f]{12}$/);
});

test('prompt · deterministic: the same inputs render byte for byte, and the nonce follows the data', () => {
  const { contract, cell } = exportable('simple-new');
  const once = renderPrompt(contract, cell, 'neutral');
  const twice = renderPrompt(contract, cell, 'neutral');
  assert.equal(once.text, twice.text);
  assert.equal(once.nonce, twice.nonce);
  const other = renderPrompt(contract, { ...cell, objective: 'something else entirely' }, 'neutral');
  assert.notEqual(other.nonce, once.nonce, 'the nonce must follow the content it fences');
});

test('prompt · an unapproved contract is refused, unless a draft is asked for', () => {
  const { contract, cell } = exportable('simple-new', { approved: false });
  assert.throws(() => renderPrompt(contract, cell, 'neutral'), (error) => {
    assert.equal(codeOf(error), 'NOT_APPROVED');
    return true;
  });
  const draft = renderPrompt(contract, cell, 'neutral', { draft: true });
  assert.ok(draft.text.startsWith(`# ${DRAFT_HEADER}\n`));
  assert.match(section(draft.text, 'Objective'), /only discovery is allowed/i);
  assert.match(section(draft.text, 'Objective'), /Write no implementation/);
  assert.match(draft.warnings.join(' | '), /DRAFT: discovery only/);
  for (const heading of REQUIRED_SECTIONS) assert.ok(draft.text.includes(`## ${heading}\n`));
});

test('prompt · approved and draft differ only in the heading, the objective and the acceptance', () => {
  const { contract, cell } = exportable('simple-new', { approved: false });
  const draft = renderPrompt(contract, cell, 'neutral', { draft: true }).text;
  const live = renderPrompt({ ...contract, approval: { approved: true, at: null } }, cell, 'neutral').text;
  for (const heading of ['Role', 'Permitted operations', 'Prohibited operations', 'Required evidence', 'Human approval']) {
    assert.equal(section(draft, heading), section(live, heading), `${heading} changed with the draft flag`);
  }
  assert.notEqual(section(draft, 'Objective'), section(live, 'Objective'));
});

test('prompt · a declared mode adds one line and changes nothing else; no mode equals ready', () => {
  const { contract, cell } = exportable('simple-new');
  const plain = renderPrompt(contract, cell, 'neutral').text;
  assert.equal(renderPrompt(contract, cell, 'neutral', { mode: 'ready' }).text, plain);
  for (const mode of ['tired', 'focus', 'explore']) {
    const result = renderPrompt(contract, cell, 'neutral', { mode });
    const note = MODE_NOTES[/** @type {'tired'} */ (mode)];
    assert.ok(result.text.includes(note), `${mode}: the declared style is missing`);
    assert.deepEqual(result.warnings, []);
    for (const heading of ['Permitted operations', 'Prohibited operations', 'Required evidence', 'Human approval']) {
      assert.equal(section(result.text, heading), section(plain, heading), `${mode} changed ${heading}`);
    }
  }
});

test('prompt · an unknown mode is ignored with a warning, not obeyed', () => {
  const { contract, cell } = exportable('simple-new');
  const result = renderPrompt(contract, cell, 'neutral', { mode: 'turbo' });
  assert.equal(result.text, renderPrompt(contract, cell, 'neutral').text);
  assert.match(result.warnings.join(' | '), /unknown mode "turbo" — ignored/);
});

test('prompt · a PROPOSED value never appears without its label', () => {
  const { contract, cell } = exportable('complex-undecided');
  const { text } = renderPrompt(contract, cell, 'neutral');
  assert.ok(text.includes('Proposed, not approved'), 'the proposals have no heading of their own');
  assert.match(text, /Open questions \(UNKNOWN — ask, never assume\)/);
  const proposed = Object.keys(FIELD_KINDS)
    .flatMap((path) => entriesAt(contract, path))
    .filter((item) => item.status === 'PROPOSED')
    .map((item) => inertText(item.value))
    .filter((value) => value !== '' && text.includes(value));
  assert.ok(proposed.length > 0, 'this scenario should carry a PROPOSED value worth labelling');
  for (const value of proposed) {
    assert.equal(
      text.split(`${PROPOSED_LABEL} ${value}`).length,
      text.split(value).length,
      `an unlabelled occurrence of "${value}"`,
    );
  }
});

test('prompt · a VERIFIED fact carries its relative evidence, a DECLARED one does not', () => {
  const contract = {
    .../** @type {any} */ (readyContract),
    environment: { value: 'Node 22 on CI', status: 'VERIFIED', basis: 'package.json' },
    approval: { approved: true, at: null },
  };
  const { cell } = proposeFirstCell(contract);
  const { text } = renderPrompt(contract, cell, 'neutral');
  assert.match(text, /project\.environment: Node 22 on CI \(verified: package\.json\)/);
  assert.match(text, /project\.users: Two people in one household\.\n/);
});
