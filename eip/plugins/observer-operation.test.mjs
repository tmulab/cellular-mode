// O26 — the OPERATION the active cells belong to, through the real plugin and the real
// read port, over a vault written by the method's own renderers.
//
// The fixture is not hand-typed Markdown: `renderIndex`, `renderCellFile`,
// `renderOperationFile` and `renderCurrentCell` are the functions the CLI writes with, so
// this test cannot stay green while the file FORMAT moves underneath it. What it asserts
// is the three claims of the operation view: the operation is discovered from the cells
// that name it (there is no index of operations), every 🔵 cell is published, and inside
// an operation two active cells are NOT the old "two active" breach — the pack named a
// ceiling of four, and the guard reads it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { check } from '../sdk/index.mjs';
import { valueOf } from '../kernel/assertions.mjs';
import { makeCell, renderCellFile } from '../../tools/cellmode/cell-file.mjs';
import { renderIndex } from '../../tools/cellmode/index-table.mjs';
import {
  fingerprintFinishLine, makeOperation, renderOperationFile,
} from '../../tools/cellmode/operation-file.mjs';
import { renderCurrentCell } from '../../tools/cellmode/projections.mjs';
import { loadObserver } from './observer-fixture.mjs';
import { CAPABILITIES, OPERATION } from './observer-state/schemas.mjs';

/** The published `overview` contract, read once: a capability map is indexed by string. */
const OVERVIEW = /** @type {import('../sdk/types.mjs').Capability} */ (CAPABILITIES['overview']);

const FINISH_LINE = ['port the operation view', 'write the guide'];
const OPERATION_NAME = 'Parallel work';
const OPERATION_ID = 'parallel-work';

/** The operation this vault records: a 🔵 pack whose ceiling is four cells. */
const operationPatch = {
  name: OPERATION_NAME,
  opened: '2026-10-24',
  status: '🔵',
  finishLine: FINISH_LINE,
  pack: {
    spendCeiling: '0', publisher: 'the maintainer', maxActiveCells: '4',
    requiresYes: ['push'], denied: ['git push'], batches: [{ op: 'deploy', limit: '1 per day' }],
  },
  qualityBar: 'gates green, 200 lines per file',
  plannedCells: ['alpha', 'beta', 'gamma'],
  spendSoFar: '—',
};

/** Two 🔵 cells that NAME the operation, and one 📋 cell that does not. */
const CELLS = [
  { id: 'alpha', name: 'Alpha', area: 'api', status: '🔵', operation: OPERATION_NAME },
  { id: 'beta', name: 'Beta', area: 'ui', status: '🔵', operation: OPERATION_NAME },
  { id: 'gamma', name: 'Gamma', area: 'docs', status: '📋' },
];

/** @param {{ id: string, name: string, area: string, status: string, operation?: string }} c */
const cellOf = (c) => makeCell({
  ...c,
  opened: '2026-10-24',
  objective: `do the ${c.id} thing`,
  boundaryIn: `${c.id}/`,
  doneCriterion: 'gates green',
  nextStep: `write the ${c.id} test`,
  baseCommit: 'babc86e',
});

/**
 * A temp vault with an operation, written by the method's own renderers.
 * @param {{ withOperationFile?: boolean }} [options]
 */
async function operationVault({ withOperationFile = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'observer-operation-'));
  const state = join(root, 'vault', 'state');
  await mkdir(join(state, 'cells'), { recursive: true });
  await mkdir(join(state, 'operations'), { recursive: true });
  const cells = CELLS.map(cellOf);
  const rows = cells.map((cell) => ({
    name: cell.name, slug: cell.id, area: cell.area, status: cell.status,
    lastVisit: '2026-10-24', nextStep: cell.nextStep,
  }));
  await writeFile(join(state, 'INDEX.md'), renderIndex(rows), 'utf8');
  await writeFile(join(state, 'log.md'), '# LOG\n', 'utf8');
  await writeFile(join(state, 'parking-lot.md'), '# PARKING LOT\n', 'utf8');
  for (const cell of cells) {
    await writeFile(join(state, 'cells', `${cell.id}.md`), renderCellFile(cell), 'utf8');
  }
  const operation = makeOperation(operationPatch);
  if (withOperationFile) {
    await writeFile(join(state, 'operations', `${OPERATION_ID}.md`),
      renderOperationFile(operation), 'utf8');
  }
  const active = cells.filter((cell) => cell.status === '🔵');
  await writeFile(join(state, 'CURRENT-CELL.md'),
    renderCurrentCell(/** @type {import('../../tools/cellmode/types.mjs').Cell} */ (active[0]),
      operation, active), 'utf8');
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

/** @type {(value: Record<string, unknown>) => Record<string, unknown>} */
const asRecord = (value) => /** @type {Record<string, unknown>} */ (value);

test('O26 the operation the cells name is published, with its pack and its finish line', async () => {
  const vault = await operationVault();
  const observer = await loadObserver({ root: vault.root, offerWritePort: false });
  try {
    const overview = valueOf(await observer.call('overview'));
    const operation = asRecord(/** @type {Record<string, unknown>} */ (overview['operation']));
    assert.notEqual(overview['operation'], null, 'the 🔵 operation a cell names must be found');
    assert.equal(operation['id'], OPERATION_ID);
    assert.equal(operation['name'], OPERATION_NAME);
    assert.equal(operation['status'], '🔵');
    assert.deepEqual(operation['finishLine'], FINISH_LINE);
    assert.equal(operation['fingerprint'], fingerprintFinishLine(FINISH_LINE),
      'the finish line is published with the fingerprint that proves it did not move');
    assert.deepEqual(operation['pack'], {
      spendCeiling: '0',
      publisher: 'the maintainer',
      batches: [{ op: 'deploy', limit: '1 per day' }],
      requiresYes: ['push'],
      denied: ['git push'],
      maxActiveCells: '4',
    });
    assert.deepEqual(operation['plannedCells'], ['alpha', 'beta', 'gamma']);
    assert.equal(operation['qualityBar'], 'gates green, 200 lines per file');
    // And the payload is the one the contract declares, validated by the SDK itself.
    assert.deepEqual(check(OVERVIEW.output, overview).errors, []);
  } finally {
    await observer.cleanup();
    await vault.cleanup();
  }
});

test('O26 every 🔵 cell is published, and two of them inside an operation is not a breach', async () => {
  const vault = await operationVault();
  const observer = await loadObserver({ root: vault.root, offerWritePort: false });
  try {
    const overview = valueOf(await observer.call('overview'));
    const activeCells = /** @type {Array<Record<string, unknown>>} */ (overview['activeCells']);
    assert.equal(activeCells.length, 2, 'both 🔵 cells, not just the first');
    assert.deepEqual(activeCells.map((cell) => cell['id']), ['alpha', 'beta']);
    assert.deepEqual(activeCells.map((cell) => cell['status']), ['active', 'active']);
    // `active` still answers the first of them: an older caller keeps working.
    assert.deepEqual(overview['active'], { id: 'alpha', name: 'Alpha' });
    const integrity = asRecord(/** @type {Record<string, unknown>} */ (overview['integrity']));
    const findings = /** @type {Array<{ code: string, message: string }>} */ (integrity['findings']);
    const codes = findings.map((finding) => finding.code);
    assert.equal(codes.includes('two-active'), false,
      `two active cells under a ceiling of four is the pack's own rule: ${JSON.stringify(findings)}`);
    assert.equal(codes.includes('over-ceiling'), false, JSON.stringify(findings));
    assert.deepEqual(findings, [], JSON.stringify(findings));
  } finally {
    await observer.cleanup();
    await vault.cleanup();
  }
});

test('O26 an operation file the vault does not carry is a WARNING, never an invented operation', async () => {
  const vault = await operationVault({ withOperationFile: false });
  const observer = await loadObserver({ root: vault.root, offerWritePort: false });
  try {
    const overview = valueOf(await observer.call('overview'));
    assert.equal(overview['operation'], null, 'no file, no operation — and no guess');
    const warnings = /** @type {Array<{ code: string, message: string }>} */ (overview['warnings']);
    const missing = warnings.filter((w) => w.code === 'operation-file-missing');
    assert.equal(missing.length, 1, JSON.stringify(warnings));
    assert.match(String(missing[0]?.message), /operations\/parallel-work\.md/);
    // Without the operation, the two 🔵 cells ARE the old breach: the ceiling came from
    // the pack, and a missing pack grants nothing.
    const integrity = asRecord(/** @type {Record<string, unknown>} */ (overview['integrity']));
    const findings = /** @type {Array<{ code: string }>} */ (integrity['findings']);
    assert.deepEqual(findings.map((f) => f.code).filter((c) => c === 'two-active'), ['two-active']);
  } finally {
    await observer.cleanup();
    await vault.cleanup();
  }
});

test('O26 api/openapi.json documents the operation exactly as the plugin declares it', async () => {
  const document = JSON.parse(await readFile(
    fileURLToPath(new URL('../../api/openapi.json', import.meta.url)), 'utf8'));
  const overview = document.components.schemas.ObserverOverview;
  // The one `$ref` inside the operation block, inlined so the two shapes are comparable.
  const documented = overview.properties.operation;
  documented.properties.pack.properties.batches.items = document.components.schemas.ObserverPackBatch;
  assert.deepEqual(documented, JSON.parse(JSON.stringify(OPERATION)),
    'the document and the manifest must describe one operation, not two');
  assert.deepEqual(overview.required, OVERVIEW.output.required);
  assert.equal(overview.properties.activeCells.items.$ref,
    '#/components/schemas/ObserverCellSummary');
});
