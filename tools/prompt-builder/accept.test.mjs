// prepare → approve → activate, proved as three separate events on a throwaway vault.
//
// RULE FOR THIS FILE: it writes exclusively inside the directory `mkdtemp` just created for it
// under `os.tmpdir()`, bootstrapped with cellmode's OWN `writeSkeleton`, and removes exactly
// that directory after a prefix check — the discipline of store.test.mjs and
// tools/gates/removal-rehearsal.mjs. The repository's real `vault/state/` is never touched.
//
// The last test is the point of the whole cell: the human runs `cmdOpen` afterwards and the
// boundary the Builder drafted is still there. If cellmode's activation overwrote it, planning
// a cell with a boundary would be theatre.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCellFile } from '../cellmode/cell-file.mjs';
import { statePaths } from '../cellmode/paths.mjs';
import { writeSkeleton } from '../cellmode/state.mjs';
import { cmdCheck } from '../cellmode/commands.mjs';
import { cmdOpen } from '../cellmode/transitions.mjs';
import { acceptFirstCell } from './accept.mjs';
import { approveContract } from './approve.mjs';
import { codeOf } from './errors.mjs';
import { readyContract } from './fixtures/index.mjs';
import { proposeFirstCell } from './first-cell.mjs';

const PREFIX = 'builder-accept-';
/** @type {string[]} */
const created = [];
/** Deterministic so two runs produce the same bytes. */
const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-04 09:00' });

test.after(() => {
  for (const root of created) {
    assert.ok(root.includes(PREFIX), `refusing to remove ${root}`);
    rmSync(root, { recursive: true, force: true });
  }
});

/** A temporary root with an empty cellmode vault in it. @returns {string} */
function freshRoot() {
  const root = mkdtempSync(join(tmpdir(), PREFIX));
  created.push(root);
  writeSkeleton(root);
  return root;
}

const approved = approveContract(
  /** @type {any} */ (readyContract),
  { confirm: true, now: '2026-10-04T09:00:00Z' },
);
/** @type {() => any} */
const proposal = () => proposeFirstCell(approved);

/** @param {() => unknown} action @returns {string | null} */
function refusal(action) {
  try {
    action();
    return null;
  } catch (error) {
    return codeOf(error);
  }
}

/** @type {(root: string, name: string) => string} */
const readState = (root, name) => readFileSync(join(statePaths(root).state, name), 'utf8');

test('accept · without confirmation nothing is created', () => {
  const root = freshRoot();
  const before = readState(root, 'INDEX.md');
  assert.equal(refusal(() => acceptFirstCell(root, proposal(), { contract: approved })), 'NEEDS_CONFIRMATION');
  assert.equal(refusal(() => acceptFirstCell(root, proposal(), { confirm: 'yes', contract: approved })), 'NEEDS_CONFIRMATION');
  assert.equal(readState(root, 'INDEX.md'), before);
});

test('accept · an unapproved contract cannot plan a cell', () => {
  const root = freshRoot();
  const before = readState(root, 'INDEX.md');
  assert.equal(
    refusal(() => acceptFirstCell(root, proposal(), { confirm: true, contract: readyContract })),
    'NOT_APPROVED',
  );
  assert.equal(refusal(() => acceptFirstCell(root, proposal(), { confirm: true })), 'NOT_APPROVED');
  assert.equal(readState(root, 'INDEX.md'), before);
});

test('accept · creates a 📋 planned cell, and nothing else moves', () => {
  const root = freshRoot();
  const logBefore = readState(root, 'log.md');
  const currentBefore = readState(root, 'CURRENT-CELL.md');
  const made = proposal();
  const result = acceptFirstCell(root, made, { confirm: true, contract: approved, env: ENV });
  assert.equal(result.slug, made.slug);
  assert.equal(result.kind, 'implementation');

  const index = readState(root, 'INDEX.md');
  assert.match(index, new RegExp(`\\(cells/${made.slug}\\.md\\).*\\| 📋 \\|`));
  // The table HEADER names every status, so the claim is about ROWS: no row is 🔵.
  assert.ok(!index.split('\n').some((l) => l.includes('| 🔵 |')), 'accepting must never mark a cell active');
  // A planned cell never ran: no log entry, and the active projection is untouched.
  assert.equal(readState(root, 'log.md'), logBefore);
  assert.equal(readState(root, 'CURRENT-CELL.md'), currentBefore);

  const cell = parseCellFile(readFileSync(join(statePaths(root).cells, `${made.slug}.md`), 'utf8'));
  assert.ok(cell !== null);
  assert.equal(cell.status, '📋');
  assert.equal(cell.boundaryIn, 'add an item; tick an item off');
  assert.equal(cell.boundaryOut, made.cell.boundaryOut);
  assert.equal(cell.doneCriterion, made.cell.doneCriterion);
  assert.equal(cell.allowed, made.cell.allowed);
  assert.equal(cell.prohibited, made.cell.prohibited);
  assert.equal(cell.opened, '2026-10-04');

  // cellmode's own integrity check, in-process: `cellmode check --root <tmp>`.
  const check = cmdCheck(root, { positional: [], options: {} });
  assert.match((check.lines ?? []).join(' '), /Integrity check passed · 0 active · 0 paused · 1 planned/);
});

test('accept · a slug that already names a cell is refused, not overwritten', () => {
  const root = freshRoot();
  const made = proposal();
  acceptFirstCell(root, made, { confirm: true, contract: approved, env: ENV });
  const before = readFileSync(join(statePaths(root).cells, `${made.slug}.md`), 'utf8');
  assert.equal(
    refusal(() => acceptFirstCell(root, made, { confirm: true, contract: approved, env: ENV })),
    'CELL_EXISTS',
  );
  assert.equal(readFileSync(join(statePaths(root).cells, `${made.slug}.md`), 'utf8'), before);
  assert.equal(readState(root, 'log.md').includes(made.name), false);
});

test('activate · the human opens the planned cell and the drafted boundary survives', () => {
  const root = freshRoot();
  const made = proposal();
  acceptFirstCell(root, made, { confirm: true, contract: approved, env: ENV });

  const opened = cmdOpen(root, { positional: [made.name], options: {} }, ENV);
  assert.match((opened.lines ?? []).join(' '), /promoted from 📋 \(an opening, not a resume\)/);

  const cell = parseCellFile(readFileSync(join(statePaths(root).cells, `${made.slug}.md`), 'utf8'));
  assert.ok(cell !== null);
  assert.equal(cell.status, '🔵');
  assert.equal(cell.boundaryIn, made.cell.boundaryIn);
  assert.equal(cell.boundaryOut, made.cell.boundaryOut);
  assert.equal(cell.doneCriterion, made.cell.doneCriterion);
  assert.equal(cell.allowed, made.cell.allowed);
  assert.equal(cell.prohibited, made.cell.prohibited);
  assert.equal(cell.objective, made.cell.objective);
  assert.equal(cell.nextStep, made.cell.nextStep);
  assert.ok(readState(root, 'CURRENT-CELL.md').includes(made.name), 'activation is the human\'s step');
  assert.match((cmdCheck(root, { positional: [], options: {} }).lines ?? []).join(' '), /1 active/);
});
