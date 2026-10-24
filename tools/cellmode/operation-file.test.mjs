// operation-file.test.mjs — the operation MODEL: `operations/<slug>.md`, the
// authorization pack's closed vocabulary, the finish-line fingerprint, and the one
// thing the addition must not break — a cell file written before the operation
// layer existed must still render byte for byte as it did.
//
// No filesystem, no CLI: every function under test is pure, and no command reads
// or writes an operation file yet (PROPOSED for R3–R5).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOperationFile, renderOperationFile, makeOperation,
  parsePack, renderPack, parseFinishLine, renderFinishLine, fingerprintFinishLine,
  PACK_GRANTS, PACK_FORBIDDEN_GRANTS, NONE,
} from './operation-file.mjs';
import { renderCellFile, parseCellFile, makeCell } from './cell-file.mjs';

const FINISH = ['ship the v2 rules', 'publish the guide', 'keep the gates green'];

const FULL = {
  name: 'Go live', opened: '2026-10-24', status: '🔵',
  finishLine: FINISH,
  pack: {
    spendCeiling: '2k tokens', publisher: 'the maintainer',
    batches: [{ op: 'deploy', limit: '1 per day' }, { op: 'ingest', limit: '500 rows' }],
    requiresYes: ['push to main', 'tag a release'],
    denied: ['touch vault/state by hand'],
    maxActiveCells: '3',
  },
  qualityBar: 'every claim carries an epistemic label',
  plannedCells: ['r2-operation-model', 'r3-op-command'],
  spendSoFar: '1.2k tokens',
};

test('renderOperationFile/parseOperationFile round-trip a full operation file', () => {
  const text = renderOperationFile(FULL);
  assert.match(text, /^# Operation: Go live\n/);
  assert.match(text, /\*\*ID:\*\* go-live · \*\*Opened:\*\* 2026-10-24 · \*\*Status:\*\* 🔵\n/);
  assert.match(text, /\*\*Finish line \(frozen\):\*\* 1\. ship the v2 rules · 2\. publish the guide · 3\. keep the gates green\n/);
  assert.match(text, /\*\*Authorization pack:\*\* spend ceiling: 2k tokens · publisher: the maintainer · batches: deploy → 1 per day; ingest → 500 rows · requires-yes: push to main, tag a release · denied: touch vault\/state by hand · max-active-cells: 3\n/);
  assert.match(text, /\*\*Planned cells:\*\* r2-operation-model, r3-op-command\n/);
  assert.match(text, /\*\*Spend so far:\*\* 1\.2k tokens\n/);

  const parsed = parseOperationFile(text);
  assert.notEqual(parsed, null);
  assert.deepEqual(parsed, makeOperation(FULL));
  assert.equal(renderOperationFile(parsed ?? {}), text, 'render ∘ parse ∘ render is stable');
});

test('parseOperationFile: no title is not an operation file; empty fields read as —', () => {
  assert.equal(parseOperationFile('# Cell: Alpha\n**ID:** alpha\n'), null);
  assert.equal(parseOperationFile(''), null);
  const bare = renderOperationFile({ name: 'Bare' });
  assert.match(bare, /\*\*Finish line \(frozen\):\*\* —\n/);
  assert.match(bare, /\*\*Authorization pack:\*\* —\n/);
  assert.match(bare, /\*\*Planned cells:\*\* —\n/);
  const parsed = parseOperationFile(bare);
  assert.deepEqual(parsed?.finishLine, []);
  assert.deepEqual(parsed?.pack.batches, []);
  assert.equal(parsed?.qualityBar, NONE);
});

test('parsePack accepts the six grants of the closed vocabulary, and only those', () => {
  assert.equal(PACK_GRANTS.length, 6);
  const line = [
    'spend ceiling: 2k tokens', 'publisher: the maintainer', 'batches: deploy → 1 per day',
    'requires-yes: push to main', 'denied: rm -rf', 'max-active-cells: 3',
  ].join(' · ');
  const pack = parsePack(line);
  assert.equal(pack.spendCeiling, '2k tokens');
  assert.equal(pack.publisher, 'the maintainer');
  assert.deepEqual(pack.batches, [{ op: 'deploy', limit: '1 per day' }]);
  assert.deepEqual(pack.requiresYes, ['push to main']);
  assert.deepEqual(pack.denied, ['rm -rf']);
  assert.equal(pack.maxActiveCells, '3');
  assert.equal(renderPack(pack), line);
  assert.equal(renderPack('—'), NONE);
  assert.equal(renderPack(''), NONE);
});

test('parsePack rejects an unknown grant by name', () => {
  for (const key of ['autonomy', 'spend', 'anything goes']) {
    assert.throws(() => parsePack(`spend ceiling: 2k · ${key}: yes`), {
      message: `PACK_UNKNOWN_GRANT: ${key}`,
    }, key);
  }
  assert.throws(() => parsePack('publisher the maintainer'), { message: 'PACK_UNKNOWN_GRANT: publisher the maintainer' });
});

test('parsePack rejects every deny-listed grant by name — a pack cannot grant these', () => {
  assert.ok(PACK_FORBIDDEN_GRANTS.length >= 6);
  for (const key of PACK_FORBIDDEN_GRANTS) {
    assert.throws(() => parsePack(`${key}: approved`), {
      message: `PACK_FORBIDDEN_GRANT: ${key}`,
    }, key);
    assert.throws(() => parsePack(`publisher: the maintainer · ${key.toUpperCase()}: yes`), {
      message: `PACK_FORBIDDEN_GRANT: ${key}`,
    }, `${key} uppercased`);
  }
  for (const key of ['skip-gates', 'skip-tests', 'destructive', 'protected-resources']) {
    assert.ok(PACK_FORBIDDEN_GRANTS.includes(key), `${key} is on the deny-list`);
  }
});

test('a batch grant without a limit is not a grant', () => {
  assert.throws(() => parsePack('batches: deploy'), { message: 'PACK_BATCH_WITHOUT_LIMIT: deploy' });
  assert.throws(() => parsePack('batches: deploy →'), { message: 'PACK_BATCH_WITHOUT_LIMIT: deploy' });
  assert.deepEqual(parsePack('batches: deploy -> 1 per day').batches, [{ op: 'deploy', limit: '1 per day' }]);
});

test('the finish-line fingerprint is stable under the documented normalization', () => {
  const base = fingerprintFinishLine(FINISH);
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(fingerprintFinishLine(renderFinishLine(FINISH)), base, 'as written == as a list');
  assert.equal(fingerprintFinishLine(['  ship   the v2   rules ', 'PUBLISH the guide', 'Keep the gates green']),
    base, 'whitespace and case are normalized away');
  assert.equal(fingerprintFinishLine([...FINISH].reverse()), base, 'reordering is not a move');
  assert.equal(fingerprintFinishLine('3. keep the gates green · 1. ship the v2 rules · 2. publish the guide'),
    base, 'renumbering is not a move');
  assert.notEqual(fingerprintFinishLine([...FINISH, 'and one more thing']), base,
    'adding an item IS a move');
  assert.notEqual(fingerprintFinishLine(FINISH.slice(1)), base, 'dropping an item IS a move');
  assert.equal(fingerprintFinishLine([]), fingerprintFinishLine('—'));
  assert.equal(makeOperation({ name: 'x', finishLine: FINISH }).fingerprint, base,
    'a new operation fingerprints its own finish line');
});

test('parseFinishLine/renderFinishLine: numbering is rendering, not content', () => {
  assert.deepEqual(parseFinishLine('1. a · 2) b · c'), ['a', 'b', 'c']);
  assert.deepEqual(parseFinishLine('—'), []);
  assert.equal(renderFinishLine(['a', 'b']), '1. a · 2. b');
  assert.equal(renderFinishLine([]), NONE);
});

// --- backward compatibility of the cell file -------------------------------
// A cell file written today has no Operation/Base commit/Spend line. Rendering it
// must produce exactly the same bytes as before the fields existed, which is
// asserted here against a fixture written out in full, line by line.
const LEGACY_CELL = [
  '# Cell: Index Parser',
  '**ID:** index-parser',
  '**Area:** tools/cellmode',
  '**Opened:** 2026-10-02 · **Status:** 🔵',
  '**Objective:** parse INDEX.md',
  '**Boundary:** in: index-table.mjs | NOT in: the CLI surface',
  '**Inputs:** INDEX.md · **Outputs:** rows',
  '**Allowed operations:** — · **Prohibited operations:** —',
  '**Dependencies:** —',
  '**Done criterion (binary):** build green + round-trip test',
  '**Last fact:** —',
  '**Build/typecheck:** —',
  '**Decisions:** —',
  '**Open issues:** —',
  '**Minimal context (≤5 lines):** —',
  '',
  '## ➜ NEXT STEP (doable in <5 min, without thinking)',
  'run `node --test` and read the first failure',
  '',
].join('\n');

test('a cell file with no operation fields round-trips byte-identically', () => {
  const parsed = parseCellFile(LEGACY_CELL);
  assert.notEqual(parsed, null);
  assert.equal(parsed?.operation, '');
  assert.equal(parsed?.baseCommit, '');
  assert.equal(parsed?.spend, '');
  assert.equal(renderCellFile(parsed ?? {}), LEGACY_CELL, 'byte-identical');
  assert.equal(renderCellFile(makeCell({ name: 'Index Parser' })).includes('**Operation:**'), false,
    'an empty optional field writes no line at all');
});

test('the operation fields appear, in file order, only when they carry a value', () => {
  const text = renderCellFile({
    ...(parseCellFile(LEGACY_CELL) ?? {}),
    operation: 'Go live', baseCommit: 'ab1fa0e', spend: '1.2k tokens',
  });
  assert.equal(text, LEGACY_CELL.replace(
    '**Opened:** 2026-10-02 · **Status:** 🔵\n',
    '**Opened:** 2026-10-02 · **Status:** 🔵\n**Operation:** Go live\n**Base commit:** ab1fa0e\n**Spend:** 1.2k tokens\n',
  ));
  assert.deepEqual(parseCellFile(text), parseCellFile(LEGACY_CELL) === null ? null : {
    ...(parseCellFile(LEGACY_CELL) ?? {}), operation: 'Go live', baseCommit: 'ab1fa0e', spend: '1.2k tokens',
  });
  const only = renderCellFile({ name: 'Solo', operation: 'Go live' });
  assert.match(only, /\*\*Status:\*\* 🔵\n\*\*Operation:\*\* Go live\n\*\*Objective:\*\*/);
  assert.equal(only.includes('**Base commit:**'), false);
  assert.equal(only.includes('**Spend:**'), false);
});
