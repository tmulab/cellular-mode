// pure.test.mjs — the pure logic, no filesystem except the templates identity test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIndex, renderIndex, upsertRow } from './index-table.mjs';
import { renderCellFile, parseCellFile, makeCell } from './cell-file.mjs';
import { renderLogEntry, parseLog, lastEntryFor, HEADER as LOG_HEADER } from './log.mjs';
import { slugify, findCell } from './slug.mjs';
import { now, today } from './clock.mjs';
import { checkState, CODES } from './check.mjs';
import { renderNoActive, summaryLines, parseCurrentCell } from './projections.mjs';
import { skeletonFiles } from './skeleton.mjs';
import { REPO_ROOT } from './helpers.mjs';

/** @typedef {import('./types.mjs').IndexRow} IndexRow */

/** A complete INDEX row. Each test overrides only the fields it is actually about,
 * which keeps the fixtures short without pretending a row has fewer fields.
 * @type {(over?: Partial<IndexRow>) => IndexRow} */
const row = (over = {}) =>
  ({ name: '', slug: null, area: '', status: '', lastVisit: '', nextStep: '', ...over });

test('parseIndex: escaped pipes, link names, foreign tables, multiple tables', () => {
  const text = [
    '| Cell | Area | Status | Last visit | Next step (1 line) |',
    '|---|---|---|---|---|',
    '| [Alpha](cells/alpha.md) | tools | ⏸ | 2026-10-02 | fix the `a \\| b` split |',
    '| Beta — [full projection](x.md) | docs | 🔵 | 2026-10-03 | write 03-state |',
    '',
    '| Name | Value |',
    '|---|---|',
    '| not a cell | 7 |',
    '',
    '| Cell | Area | Status | Last visit | Next step (1 line) |',
    '|---|---|---|---|---|',
    '| Gamma | ci | 📋 | — | — |',
  ].join('\n');
  const rows = parseIndex(text);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => [r.name, r.slug, r.status]),
    [['Alpha', 'alpha', '⏸'], ['Beta', null, '🔵'], ['Gamma', null, '📋']],
  );
  assert.equal(rows[0]?.nextStep, 'fix the `a | b` split');
});

test('renderIndex/parseIndex round-trip keeps a literal pipe', () => {
  const rows = [{
    name: 'Alpha', slug: 'alpha', area: 'tools', status: '⏸',
    lastVisit: '2026-10-02', nextStep: 'run `a | b` and read the first error',
  }];
  const text = renderIndex(rows);
  assert.match(text, /a \\\| b/);
  assert.deepEqual(parseIndex(text), rows);
});

test('upsertRow replaces by slug or by name, never duplicates', () => {
  const rows = [row({ name: 'Alpha', area: 'tools', status: '📋', lastVisit: '—', nextStep: '—' })];
  const next = upsertRow(rows, row({ name: 'Alpha', slug: 'alpha', area: 'tools', status: '🔵', lastVisit: 'd', nextStep: 'x' }));
  assert.equal(next.length, 1);
  assert.equal(next[0]?.status, '🔵');
  assert.equal(next[0]?.slug, 'alpha');
  assert.equal(upsertRow(next, row({ name: 'Beta', slug: 'beta' })).length, 2);
});

test('cell file round-trips every field, including the composite lines', () => {
  const cell = makeCell({
    name: 'Index Parser',
    area: 'tools/cellmode',
    opened: '2026-10-02',
    status: '⏸',
    objective: 'parse and render INDEX.md',
    boundaryIn: 'index-table.mjs',
    boundaryOut: 'the CLI surface',
    inputs: 'vault/state/INDEX.md',
    outputs: 'row objects',
    allowed: 'read and write vault/state',
    prohibited: 'rewriting log.md',
    dependencies: 'none',
    doneCriterion: 'build green + round-trip test passes',
    lastFact: 'wrote index-table.mjs',
    build: 'green',
    decisions: 'linear scan, no regex over free text',
    openIssues: 'no cancelled state exists in the method',
    minimalContext: 'projection of log.md',
    nextStep: 'run `node --test` and read the first error',
  });
  const parsed = parseCellFile(renderCellFile(cell));
  assert.deepEqual(parsed, cell);
});

test('parseCellFile returns null when there is no cell title', () => {
  assert.equal(parseCellFile(renderNoActive([])), null);
  assert.equal(parseCurrentCell(renderNoActive([])), null);
});

test('log entries render and parse back, newest last', () => {
  const first = { timestamp: '2026-10-02 09:00', cell: 'Alpha', status: '⏸', facts: 'a', decisions: 'd', build: 'green', next: 'n' };
  const second = { ...first, timestamp: '2026-10-02 10:00', status: '✔', next: '—', note: 'tired but fine' };
  const text = LOG_HEADER + renderLogEntry(first) + renderLogEntry(second);
  const entries = parseLog(text);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.status, '⏸');
  assert.equal(entries[1]?.note, 'tired but fine');
  assert.equal(lastEntryFor(entries, 'alpha')?.status, '✔');
  assert.equal(lastEntryFor(entries, 'nobody'), null);
  assert.equal(parseLog(LOG_HEADER).length, 0);
});

test('log entry omits the optional personal note when empty', () => {
  const text = renderLogEntry({ timestamp: '2026-10-02 09:00', cell: 'A', status: '⏸', facts: 'f', next: 'n' });
  assert.equal(text.includes('Personal note'), false);
  assert.equal(parseLog(text)[0]?.decisions, '—');
});

test('slugify and findCell: exact wins over substring, several matches are ambiguous', () => {
  assert.equal(slugify('Índice & Parser!'), 'indice-parser');
  assert.equal(slugify('   '), 'cell');
  const rows = [row({ name: 'api', slug: 'api' }), row({ name: 'api cache', slug: 'api-cache' })];
  assert.equal(findCell(rows, 'API').kind, 'exact');
  assert.equal(findCell(rows, 'cache').row?.slug, 'api-cache');
  assert.equal(findCell(rows, 'ap').kind, 'ambiguous');
  assert.equal(findCell(rows, 'nope').kind, 'none');
  assert.equal(findCell(rows, '').kind, 'none');
});

test('clock honours CELLMODE_NOW and refuses a malformed value', () => {
  assert.equal(now({ CELLMODE_NOW: '2026-10-02 09:00' }), '2026-10-02 09:00');
  assert.equal(today({ CELLMODE_NOW: '2026-10-02 09:00' }), '2026-10-02');
  assert.throws(() => now({ CELLMODE_NOW: 'yesterday' }), /CELLMODE_NOW/);
  assert.match(now({}), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test('checkState is silent on a consistent state and on planned cells', () => {
  const rows = [
    row({ name: 'Alpha', slug: 'alpha', status: '⏸', nextStep: 'n', lastVisit: '2026-10-02' }),
    row({ name: 'Gamma', slug: 'gamma', status: '📋', nextStep: '—', lastVisit: '—' }),
  ];
  const log = parseLog(renderLogEntry({ timestamp: '2026-10-02 09:00', cell: 'Alpha', status: '⏸', facts: 'f', next: 'n' }));
  assert.deepEqual(checkState({ indexRows: rows, logEntries: log, current: null }), []);
});

test('checkState flags a 🔵 row with no CURRENT-CELL projection', () => {
  const rows = [row({ name: 'Alpha', slug: 'alpha', status: '🔵', nextStep: 'n', lastVisit: 'd' })];
  const findings = checkState({ indexRows: rows, logEntries: [], current: null });
  assert.deepEqual(findings.map((f) => f.code), [CODES.CURRENT_MISMATCH]);
});

test('projections: no-active form and the summarized waiting list', () => {
  const paused = Array.from({ length: 9 }, (_, i) => row({
    name: `C${i}`, status: '⏸', nextStep: `step ${i}`, lastVisit: `2026-10-0${(i % 9) + 1}`,
  }));
  const text = renderNoActive(paused);
  assert.match(text, /No active cell · 9 paused — see INDEX\.md/);
  assert.equal(text.split('\n').filter((l) => l.startsWith('- ')).length, 3);
  const summary = summaryLines(paused);
  assert.ok(summary.length <= 8, `summary was ${summary.length} lines`);
  assert.match(String(summary[summary.length - 1]), /and 3 more/);
  assert.match(renderNoActive([]), /0 paused/);
});

test('templates/vault/state is byte-identical to what init writes', () => {
  const dir = join(REPO_ROOT, 'templates', 'vault', 'state');
  for (const [rel, content] of Object.entries(skeletonFiles())) {
    assert.equal(readFileSync(join(dir, ...rel.split('/')), 'utf8'), content, `templates/.../${rel}`);
  }
});
