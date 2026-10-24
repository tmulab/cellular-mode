// report-model.mjs — the vault as a PLAIN OBJECT, ready to draw. PURE: no filesystem, no
// clock, no environment, no process (`node:crypto` computes a digest and is not an I/O
// port — the same reading as `operation-file.mjs`).
//
// Why it exists: the map the human reads must come from the vault and from NOTHING else.
// The field failure of 2026-10-22 was a hand-written panel that went stale while the log
// moved on, so every value below is a read of log.md, INDEX.md, operations/*.md, the cell
// files or the parking lot — and the only dates in the output are dates the vault already
// carries. Given the same vault this function answers the same object, byte for byte.
import { createHash } from 'node:crypto';
import { oneLine } from './fields.mjs';
import { slugify } from './slug.mjs';
import { lastEntryFor } from './log.mjs';

/** @typedef {import('./types.mjs').Cell} Cell */
/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** @typedef {import('./types.mjs').LogEntry} LogEntry */
/** @typedef {import('./types.mjs').Operation} Operation */
/** @typedef {{ name: string, slug: string, area: string, status: string, fact: string,
 *   nextStep: string }} Entry */

/** The words that make a parked line a thing waiting on the HUMAN. Only the ROLE word
 * ships: a personal name inside the tool would be this repository's human hard-coded into
 * every other adopter's map, so names are a parameter (`humanWords`), never a default.
 * @type {ReadonlyArray<string>} */
export const HUMAN_WORDS = Object.freeze(['human']);

export const STATUS_ORDER = Object.freeze(['🔵', '⏸', '📋', '✔']);
/** @type {Record<string, string>} */
const LABELS = { '🔵': 'Active', '⏸': 'Paused', '📋': 'Planned', '✔': 'Done' };
/** Strongest first: what an item's state is when several cells match it. */
const PRECEDENCE = Object.freeze(['✔', '🔵', '⏸']);
const PLANNED = '📋';
const FACT_LIMIT = 132;
/** A single bare token ("map") is too loose to claim a finish-line item: see `itemMatches`. */
const MIN_TOKENS = 2;

/**
 * PURE. sha256 over the SOURCES of the map, in a fixed order: `log.md`, `INDEX.md`, then
 * `operations/<slug>.md` sorted by slug (the order `listOperationTexts` already gives).
 * Each source is hashed as `<name>\n<text>\n`, so moving a line from one file to another
 * changes the digest instead of cancelling out.
 * @param {{ logText?: string, indexText?: string,
 *   operationTexts?: ReadonlyArray<{ slug: string, text: string }> }} [source]
 * @returns {string} 64 lowercase hex characters
 */
export function sourceFingerprint({ logText = '', indexText = '', operationTexts = [] } = {}) {
  const hash = createHash('sha256');
  /** @type {Array<[string, string]>} */
  const named = [['log.md', String(logText ?? '')], ['INDEX.md', String(indexText ?? '')],
    ...operationTexts.map((o) => /** @type {[string, string]} */ (
      [`operations/${o.slug}.md`, String(o.text ?? '')]))];
  for (const [name, text] of named) hash.update(`${name}\n${text}\n`, 'utf8');
  return hash.digest('hex');
}

/** One line, cut to `limit` characters with an ellipsis. @param {unknown} value
 * @param {number} [limit] @returns {string} */
export function truncate(value, limit = FACT_LIMIT) {
  const text = oneLine(value, '—');
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

/** @type {(cell: Cell) => string} */
const cellSlug = (cell) => oneLine(cell.id, '') || slugify(oneLine(cell.name, ''));

/**
 * THE MATCHING RULE between a finish-line item and a cell, documented here because the
 * map's finish line is only as honest as this rule.
 *
 * Both sides are slugified (`R7 generated map` -> `r7-generated-map`) and they match when
 * the two slugs are EQUAL, or when one contains the other as a run of WHOLE hyphen tokens
 * at least two tokens long: `R7 generated map` matches the cell `r7-generated-map`, and so
 * does the item `generated map`, while the single token `map` matches only a cell whose
 * slug IS `map`. A substring inside a token never matches (`maps` is not `map`).
 *
 * The rule is deliberately generous: the map is a reading aid, never a gate, and an item
 * no cell matches reads 📋 — the honest answer when the vault says nothing about it.
 * @param {unknown} item @param {string} slug @returns {boolean}
 */
export function itemMatches(item, slug) {
  const a = slugify(oneLine(item, ''));
  const b = String(slug ?? '');
  if (a === '' || b === '') return false;
  if (a === b) return true;
  const [long, short] = a.length >= b.length ? [a, b] : [b, a];
  if (short.split('-').length < MIN_TOKENS) return false;
  return `-${long}-`.includes(`-${short}-`);
}

/** The state of one finish-line item: the strongest status among the cells that match it
 * (✔ beats 🔵 beats ⏸), and 📋 when nothing matches or only planned cells do.
 * @param {unknown} item @param {ReadonlyArray<Entry>} [entries] @returns {string} */
export function itemState(item, entries = []) {
  const own = entries.filter((e) => itemMatches(item, e.slug));
  return PRECEDENCE.find((s) => own.some((e) => e.status === s)) ?? PLANNED;
}

/** One cell as the map reads it: the INDEX row (name, slug, area, status — the projection
 * the protocol derives from the log) joined to its cell file, which adds the two things the
 * row has no column for. The last fact is the cell file's, falling back to the FACTS of
 * that cell's last log entry; the log is truth, so a file that recorded none is still
 * answered for.
 * @param {ReadonlyArray<IndexRow>} [rows] @param {ReadonlyArray<Cell>} [cells]
 * @param {ReadonlyArray<LogEntry>} [logEntries] @returns {Entry[]}
 */
export function cellEntries(rows = [], cells = [], logEntries = []) {
  return rows.map((row) => {
    const slug = row.slug || slugify(oneLine(row.name, ''));
    const file = cells.find((c) => cellSlug(c) === slug);
    const logged = lastEntryFor(logEntries, row.name);
    const fact = [file?.lastFact, logged?.facts]
      .map((v) => oneLine(v, '—')).find((v) => v !== '—') ?? '—';
    return {
      name: oneLine(row.name, 'unnamed'),
      slug,
      area: oneLine(row.area, '—'),
      status: row.status,
      fact: truncate(fact),
      nextStep: truncate(oneLine(file?.nextStep, '') || oneLine(row.nextStep, '—')),
    };
  });
}

/** @type {(word: string) => string} */
const escapeRegExp = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * What is waiting on the HUMAN: the next step of every ⏸ cell, then the parking-lot lines
 * that name the human. The word match is case-insensitive and on whole words, so
 * "humanity" is not a request; the list is configurable precisely so that an adopter can
 * add their own vocabulary without the tool shipping anybody's name.
 * @param {{ entries?: ReadonlyArray<Entry>, parkingLotText?: string,
 *   humanWords?: ReadonlyArray<string> }} [input]
 * @returns {Array<{ source: string, label: string, text: string }>}
 */
export function waitingOnHuman({
  entries = [], parkingLotText = '', humanWords = HUMAN_WORDS,
} = {}) {
  const words = humanWords.map((w) => escapeRegExp(String(w ?? '').trim())).filter(Boolean);
  /** @type {(line: string) => boolean} */
  const named = (line) => words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(line));
  return [
    ...entries.filter((e) => e.status === '⏸')
      .map((e) => ({ source: 'cell', label: e.name, text: e.nextStep })),
    ...String(parkingLotText ?? '').split('\n').map((l) => l.trim())
      .filter((l) => l.startsWith('- ') && named(l))
      .map((l) => ({ source: 'parking lot', label: 'parked', text: truncate(l.slice(2)) })),
  ];
}

/**
 * The whole map, as data. Every input is already-parsed vault content: nothing here opens a
 * file (that is `state.mjs`) and nothing here draws (that is `report-svg.mjs`).
 * @param {{ project?: string, rows?: ReadonlyArray<IndexRow>,
 *   logEntries?: ReadonlyArray<LogEntry>, operation?: Operation | null,
 *   cells?: ReadonlyArray<Cell>, logText?: string, indexText?: string,
 *   operationTexts?: ReadonlyArray<{ slug: string, text: string }>,
 *   parkingLotText?: string, humanWords?: ReadonlyArray<string> }} [input]
 */
export function reportModel({
  project = '', rows = [], logEntries = [], operation = null, cells = [], logText = '',
  indexText = '', operationTexts = [], parkingLotText = '', humanWords = HUMAN_WORDS,
} = {}) {
  const entries = cellEntries(rows, cells, logEntries);
  /** @type {(status: string) => number} */
  const count = (status) => entries.filter((e) => e.status === status).length;
  return {
    project: oneLine(project, 'project'),
    fingerprint: sourceFingerprint({ logText, indexText, operationTexts }),
    operation: operation === null ? null : {
      name: oneLine(operation.name, 'unnamed'),
      id: oneLine(operation.id, '—'),
      status: operation.status,
      opened: oneLine(operation.opened),
      spend: oneLine(operation.spendSoFar),
      ceiling: oneLine(operation.pack.spendCeiling),
      finishLine: operation.finishLine.map((text) => ({
        text: truncate(text), state: itemState(text, entries),
      })),
    },
    groups: STATUS_ORDER.map((status) => ({
      status,
      label: LABELS[status] ?? status,
      cells: entries.filter((e) => e.status === status),
    })),
    waiting: waitingOnHuman({ entries, parkingLotText, humanWords }),
    totals: {
      active: count('🔵'), paused: count('⏸'), planned: count(PLANNED), done: count('✔'),
      logEntries: logEntries.length,
    },
  };
}
