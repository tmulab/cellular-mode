// Session routing: where a request to start lands, and what it refuses to overwrite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFindings, startSession } from './session.mjs';
import { inspectProject } from './inspect.mjs';
import { emptyContract } from './contract-shape.mjs';
import { emptyDraft } from './draft.mjs';
import { codeOf } from './errors.mjs';
import { existingRepo, pausedProject } from './fixtures/index.mjs';

/** @type {import('./types.mjs').CellState} */
const NO_CELLS = { exists: false, active: null, paused: [] };
/** @type {import('./types.mjs').CellState} */
const ACTIVE = { exists: true, active: 'report view', paused: [] };

test('session · a new project starts from a contract in which nothing is known', () => {
  const result = startSession('new');
  assert.equal(result.action, 'new-draft');
  assert.ok(result.draft !== undefined);
  assert.deepEqual(result.draft, emptyDraft('new'));
  assert.match(result.message, /UNKNOWN/);
});

test('session · an existing repository starts with its findings already VERIFIED', () => {
  const inspection = inspectProject(existingRepo.files);
  const result = startSession('existing', { inspection, cellState: NO_CELLS });
  assert.equal(result.action, 'new-draft');
  const draft = result.draft;
  assert.ok(draft !== undefined);
  assert.deepEqual(draft.contract.identity.name, { value: 'invoice-tidy', status: 'VERIFIED', basis: 'package.json' });
  assert.equal(draft.contract.identity.slug, 'invoice-tidy');
  assert.ok(draft.contract.technologies.approved.length >= 2);
  assert.deepEqual(draft.asked, []);
  assert.match(result.message, /nothing in the project was modified/);
});

test('session · resuming a project whose cells are recorded defers to /cell by name', () => {
  const result = startSession('resume', { cellState: pausedProject.cellState });
  assert.equal(result.action, 'defer-to-cell');
  assert.equal(result.draft, undefined);
  assert.match(result.message, /import-csv/);
  assert.match(result.message, /\/cell/);
  const withActive = startSession('resume', { cellState: { exists: true, active: 'report view', paused: ['import-csv'] } });
  assert.equal(withActive.action, 'defer-to-cell');
  assert.match(withActive.message, /report view, import-csv/);
});

test('session · resuming with no cell but an open draft continues the draft itself', () => {
  const draft = { ...emptyDraft('new'), asked: ['objective'], skipped: ['users'] };
  const result = startSession('resume', { cellState: NO_CELLS, existingDraft: draft });
  assert.equal(result.action, 'continue-draft');
  assert.equal(result.draft, draft, 'the open draft is continued, not replaced');
  assert.match(result.message, /1 question\(s\) answered, 1 skipped/);
});

test('session · resuming with nothing recorded says so and asks only what is needed', () => {
  const result = startSession('resume');
  assert.equal(result.action, 'nothing-to-resume');
  assert.equal(result.draft, undefined);
  assert.match(result.message, /nothing to resume/);
  assert.match(result.message, /new project or an existing repository/);
});

test('session · a new project is never started silently over recorded work', () => {
  for (const path of /** @type {const} */ (['new', 'existing'])) {
    const overCells = startSession(path, { cellState: ACTIVE });
    assert.equal(overCells.action, 'confirm-needed');
    assert.equal(overCells.draft, undefined);
    assert.match(overCells.message, /report view/);
    assert.match(overCells.message, /nothing was changed/);

    const overDraft = startSession(path, { cellState: NO_CELLS, existingDraft: emptyDraft('new') });
    assert.equal(overDraft.action, 'confirm-needed');
    assert.equal(overDraft.draft, undefined);
    assert.match(overDraft.message, /discovery draft is already open/);
  }
});

test('session · an unrecognised path is refused', () => {
  try {
    startSession(/** @type {'new'} */ ('greenfield'));
    assert.fail('expected a refusal');
  } catch (error) {
    assert.equal(codeOf(error), 'BAD_ENTRY');
  }
});

test('mergeFindings · list fields are appended to, single fields are set, slug follows cellmode', () => {
  const merged = mergeFindings(emptyContract('existing'), [
    { field: 'identity.name', entry: { value: 'Invoice Tidy!', status: 'VERIFIED', basis: 'package.json' } },
    { field: 'integrations', entry: { value: 'Existing agent instructions: AGENTS.md', status: 'VERIFIED', basis: 'AGENTS.md' } },
    { field: 'integrations', entry: { value: 'Existing agent instructions: CLAUDE.md', status: 'VERIFIED', basis: 'CLAUDE.md' } },
  ]);
  assert.equal(merged.identity.name.value, 'Invoice Tidy!');
  assert.equal(merged.identity.slug, 'invoice-tidy');
  assert.equal(merged.integrations.length, 2);
  assert.equal(merged.objective.status, 'UNKNOWN', 'merging says nothing about what was not found');
});
