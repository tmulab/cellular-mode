// The only disk-touching module, exercised on a throwaway directory.
//
// RULE FOR THIS FILE: it writes exclusively inside the directory `mkdtemp` just created for
// it under `os.tmpdir()`, and removes exactly that directory — the same discipline
// tools/gates/removal-rehearsal.mjs follows, for the same reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  BUILDER_REL, DRAFT_FILE, builderPath, listProjectFiles, readCellState, readDraft, writeDraft,
} from './store.mjs';
import { writeIndex, writeSkeleton } from '../cellmode/state.mjs';
import { applyAnswer } from './answers.mjs';
import { emptyDraft } from './draft.mjs';
import { codeOf } from './errors.mjs';

/** @type {string[]} */
const created = [];

/** A fresh temporary root. @returns {string} */
function freshRoot() {
  const root = mkdtempSync(join(tmpdir(), 'builder-store-'));
  created.push(root);
  return root;
}

test.after(() => {
  for (const root of created) {
    assert.ok(root.includes('builder-store-'), `refusing to remove ${root}`);
    rmSync(root, { recursive: true, force: true });
  }
});

/** @param {() => unknown} action @returns {string | null} */
function refusal(action) {
  try {
    action();
    return null;
  } catch (error) {
    return codeOf(error);
  }
}

test('store · a draft round-trips, and absent means null', () => {
  const root = freshRoot();
  assert.equal(readDraft(root), null);
  const { draft } = applyAnswer(emptyDraft('new'), 'objective', 'A to-do list for one person.');
  const file = writeDraft(root, draft);
  assert.equal(file, join(root, 'vault', 'builder', DRAFT_FILE));
  assert.deepEqual(readDraft(root), draft);
  assert.ok(readFileSync(file, 'utf8').endsWith('\n'), 'the file is a line-terminated document');
});

test('store · the write is atomic: no temporary file survives it', () => {
  const root = freshRoot();
  writeDraft(root, emptyDraft('existing'));
  assert.deepEqual(readdirSync(join(root, 'vault', 'builder')), [DRAFT_FILE]);
  // The walk ignores the Builder's own directory: a draft is not part of the project.
  assert.deepEqual(listProjectFiles(root), []);
  assert.equal(BUILDER_REL, 'vault/builder');
});

test('store · nothing is written outside vault/builder/', () => {
  const root = freshRoot();
  assert.equal(builderPath(root, DRAFT_FILE), join(root, 'vault', 'builder', DRAFT_FILE));
  assert.equal(refusal(() => builderPath(root, '../../escape.json')), 'OUTSIDE_ROOT');
  assert.equal(refusal(() => builderPath(root, '..')), 'OUTSIDE_ROOT');
  assert.equal(refusal(() => builderPath(root, join('nested', '..', '..', 'escape.json'))), 'OUTSIDE_ROOT');
  // An absolute path elsewhere under the temporary directory is still elsewhere.
  assert.equal(refusal(() => builderPath(root, resolve(tmpdir(), 'escape.json'))), 'OUTSIDE_ROOT');
  // A nested name inside the directory is fine.
  assert.equal(builderPath(root, 'archive/old.json'), join(root, 'vault', 'builder', 'archive', 'old.json'));
});

test('store · a file that is not a version-1 draft is refused, not overwritten', () => {
  const root = freshRoot();
  mkdirSync(join(root, 'vault', 'builder'), { recursive: true });
  const file = join(root, 'vault', 'builder', DRAFT_FILE);
  writeFileSync(file, '{ not json', 'utf8');
  assert.equal(refusal(() => readDraft(root)), 'BAD_DRAFT');
  writeFileSync(file, JSON.stringify({ schema: 'something-else', version: 1 }), 'utf8');
  assert.equal(refusal(() => readDraft(root)), 'BAD_DRAFT');
  assert.equal(refusal(() => writeDraft(root, /** @type {import('./types.mjs').Draft} */ (/** @type {unknown} */ ({ schema: 'x' })))), 'BAD_DRAFT');
  assert.equal(readFileSync(file, 'utf8'), JSON.stringify({ schema: 'something-else', version: 1 }));
});

test('store · the walk is read-only, capped, and reads text for manifests only', () => {
  const root = freshRoot();
  mkdirSync(join(root, 'src', 'deep'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'left-pad'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"name":"temp-fixture"}\n', 'utf8');
  writeFileSync(join(root, 'README.md'), '# notes\n', 'utf8');
  writeFileSync(join(root, 'src', 'index.mjs'), 'export const a = 1;\n', 'utf8');
  writeFileSync(join(root, 'src', 'deep', 'nested.mjs'), 'export const b = 2;\n', 'utf8');
  writeFileSync(join(root, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1;\n', 'utf8');

  const files = listProjectFiles(root);
  const paths = files.map((f) => f.path);
  // Sorted by name within each directory (locale order), so the walk is reproducible.
  assert.deepEqual(paths, ['package.json', 'README.md', 'src/deep/nested.mjs', 'src/index.mjs']);
  assert.equal(files.find((f) => f.path === 'package.json')?.text, '{"name":"temp-fixture"}\n');
  assert.equal(files.find((f) => f.path === 'README.md')?.text, undefined);
  assert.equal(listProjectFiles(root, { maxFiles: 2 }).length, 2);
  assert.deepEqual(listProjectFiles(root, { maxDepth: 1 }).map((f) => f.path), ['package.json', 'README.md', 'src/index.mjs']);
});

test('store · the vault is read through cellmode, and an absent vault is not an error', () => {
  const root = freshRoot();
  assert.deepEqual(readCellState(root), { exists: false, active: null, paused: [] });

  writeSkeleton(root);
  assert.deepEqual(readCellState(root), { exists: true, active: null, paused: [] });

  writeIndex(root, [
    { name: 'import csv', slug: 'import-csv', area: 'data', status: '⏸', lastVisit: '2026-10-01', nextStep: 'map columns' },
    { name: 'report view', slug: 'report-view', area: 'ui', status: '🔵', lastVisit: '2026-10-02', nextStep: 'render totals' },
    { name: 'old idea', slug: 'old-idea', area: 'ui', status: '✔', lastVisit: '2026-09-30', nextStep: '—' },
  ]);
  assert.deepEqual(readCellState(root), { exists: true, active: 'report view', paused: ['import csv'] });
});
