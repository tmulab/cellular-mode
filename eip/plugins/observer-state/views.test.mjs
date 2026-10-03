// O18 — one status vocabulary, and the refusal to invent a word.
//
// PURE: the views are given a model directly, so the edge cases the CLI cannot
// produce (a log entry carrying a status the protocol does not define) are cheap to
// state here. That case is the whole reason `status` may be null.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES } from './model.mjs';
import { events, timeline } from './views.mjs';

/** A model with just the fields these views read.
 * @param {Array<{ timestamp: string, cell: string, status: string }>} entries
 * @returns {import('./types.mjs').Model} */
const modelWith = (entries) => ({
  entries: [],
  byId: new Map(),
  logEntries: entries.map((e) => ({
    ...e, date: e.timestamp.slice(0, 10), facts: '—', decisions: '—', build: '—', next: '—', note: '',
  })),
  missing: [],
  warnings: [],
  integrity: { ok: true, findings: [] },
});

test('O18 a logged protocol symbol becomes the WORD, with the symbol alongside', () => {
  const model = modelWith([
    { timestamp: '2026-04-06 10:20', cell: 'a', status: '✔' },
    { timestamp: '2026-04-07 09:30', cell: 'b', status: '⏸' },
  ]);
  // Newest first, same as `overview.recent`.
  assert.deepEqual(events(model).map((e) => [e.status, e.statusSymbol, e.kind]), [
    ['paused', '⏸', 'pause'],
    ['done', '✔', 'complete'],
  ]);
  for (const event of events(model)) {
    assert.ok(event.status !== null && STATUSES.includes(event.status),
      'the word must come from the one declared vocabulary');
  }
});

test('O18 a symbol the protocol does not define has NO word: null, never a guess', () => {
  // Only a hand-edited log can produce this, and the observer must describe it
  // rather than pick the nearest plausible status.
  const model = modelWith([{ timestamp: '2026-04-07 09:30', cell: 'b', status: '🚀' }]);
  const [event] = events(model);
  assert.equal(event?.status, null, 'an undefined symbol must not become "planned"');
  assert.equal(event?.statusSymbol, '🚀', 'what the log said is still reported verbatim');
  assert.equal(event?.kind, 'reconstructed');
  // An empty status (a log entry with no Status field at all) is the same answer.
  const blank = events(modelWith([{ timestamp: '2026-04-07 09:31', cell: 'c', status: '' }]));
  assert.equal(blank[0]?.status, null);
  assert.equal(blank[0]?.kind, 'reconstructed');
  assert.deepEqual(timeline(model).notRecorded, ['open', 'resume']);
});
