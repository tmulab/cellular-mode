// O19 — `—` on a DONE cell is an INTENTIONAL absence, not a gap in the record.
//
// The file format overloads one symbol: for most fields `—` means "not recorded", but
// `cellmode complete` writes the next step as `—` on purpose, because a finished cell
// HAS no next step. Mapping both to the same `null` threw that distinction away before
// the API could publish it. `nextStepState` carries it; `nextStep` stays `null` in both
// cases, so no caller has to parse a sentinel string.
//
// The vault here is the real CLI's output (see observer-fixture.mjs), which already
// contains all four statuses: `note-storage` ✔ with `—`, `tag-filter` 🔵 with `—`,
// `search-index` 📋 with `—`, `markdown-parser` ⏸ with a real next step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadObserver, startObserverHost } from './observer-fixture.mjs';
import { valueOf } from '../kernel/assertions.mjs';
import { events } from './observer-state/views.mjs';

/** @type {(value: unknown) => Record<string, unknown>[]} */
const rows = (value) => /** @type {Record<string, unknown>[]} */ (value);

/** A model carrying only the log entries `events` reads.
 * @param {Array<{ status: string, next: string }>} entries
 * @returns {import('./observer-state/types.mjs').Model} */
const logModel = (entries) => ({
  entries: [],
  byId: new Map(),
  logEntries: entries.map((e, i) => ({
    timestamp: `2026-04-0${i + 1} 10:00`,
    date: `2026-04-0${i + 1}`,
    cell: 'a',
    status: e.status,
    facts: '—',
    decisions: '—',
    build: '—',
    next: e.next,
    note: '',
  })),
  missing: [],
  warnings: [],
  integrity: { ok: true, findings: [] },
});

test('O19 cells distinguishes an intentional "none" from an unrecorded next step', async () => {
  const o = await loadObserver();
  try {
    const list = rows(valueOf(await o.call('cells')).cells);
    assert.deepEqual(list.map((c) => [c.id, c.status, c.nextStep, c.nextStepState]), [
      // ✔ done: the protocol wrote `—` deliberately, so the absence is a FACT.
      ['note-storage', 'done', null, 'none'],
      ['markdown-parser', 'paused', 'run the parser test file and read the first list failure', 'recorded'],
      // 📋 planned: a planned cell carries an intention only — nothing was recorded.
      ['search-index', 'planned', null, 'not-recorded'],
      // 🔵 active with `—`: genuinely missing, and the auditor warns about exactly this.
      ['tag-filter', 'active', null, 'not-recorded'],
    ]);
  } finally {
    await o.cleanup();
  }
});

test('O19 cell-detail: an intentional none is NOT listed as unavailable', async () => {
  const o = await loadObserver();
  try {
    const done = valueOf(await o.call('cell-detail', { id: 'note-storage' }));
    assert.equal(done.nextStep, null, 'no sentinel string reaches the contract');
    assert.equal(done.nextStepState, 'none');
    assert.equal(
      /** @type {string[]} */ (done.unavailable).includes('nextStep'),
      false,
      'the host read this field perfectly well: it says the cell is finished',
    );
    // The same field on a cell that is NOT finished is still an honest absence.
    const active = valueOf(await o.call('cell-detail', { id: 'tag-filter' }));
    assert.equal(active.nextStepState, 'not-recorded');
    assert.ok(/** @type {string[]} */ (active.unavailable).includes('nextStep'));
    const paused = valueOf(await o.call('cell-detail', { id: 'markdown-parser' }));
    assert.equal(paused.nextStepState, 'recorded');
    assert.ok(/** @type {string[]} */ (paused.unavailable).includes('nextStep') === false);
  } finally {
    await o.cleanup();
  }
});

test('O19 a completion log entry carries none; a pause with "—" stays not recorded', () => {
  // PURE, because only a hand-written model can put `—` in a PAUSE entry: `cellmode
  // pause` requires a next step. The distinction must not collapse if one appears.
  const model = logModel([
    { status: '⏸', next: '—' },
    { status: '✔', next: '—' },
    { status: '⏸', next: 'read the first failure' },
  ]);
  assert.deepEqual(events(model).map((e) => [e.kind, e.nextStep, e.nextStepState]), [
    ['pause', 'read the first failure', 'recorded'],
    ['complete', null, 'none'],
    ['pause', null, 'not-recorded'],
  ]);
});

test('O19 the timeline and overview.recent agree with the log the CLI wrote', async () => {
  const o = await loadObserver();
  try {
    const timeline = rows(valueOf(await o.call('timeline')).events);
    assert.deepEqual(timeline.map((e) => [e.cell, e.kind, e.nextStepState]), [
      ['markdown-parser', 'pause', 'recorded'],
      ['note-storage', 'complete', 'none'],
    ]);
    assert.equal(timeline[1]?.nextStep, null, 'a completed cell has no next step');
    const recent = rows(valueOf(await o.call('overview')).recent);
    assert.deepEqual(recent.map((e) => e.nextStepState), ['recorded', 'none']);
  } finally {
    await o.cleanup();
  }
});

test('O19 the distinction survives the wire, over a real host', async () => {
  const host = await startObserverHost();
  try {
    const cells = await host.post('cells');
    const published = rows(cells.body.value.cells);
    const done = published.find((c) => c.id === 'note-storage');
    assert.equal(done?.nextStepState, 'none');
    assert.equal(done?.nextStep, null);
    assert.equal(published.find((c) => c.id === 'tag-filter')?.nextStepState, 'not-recorded');
    const detail = await host.post('cell-detail', { id: 'note-storage' });
    assert.equal(detail.body.value.nextStepState, 'none');
    const timeline = await host.post('timeline', { limit: 10 });
    assert.deepEqual(rows(timeline.body.value.events).map((e) => e.nextStepState),
      ['recorded', 'none']);
  } finally {
    await host.cleanup();
  }
});
