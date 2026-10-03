// The four non-graph views. PURE: they shape a model that has already been read.
//
// One rule runs through all of them: a field the vault does not carry is `null` AND
// its name is listed in `unavailable`. A dash rendered as the string "—" would look
// like data, and an omitted key would look like a bug in the reader. Saying "this is
// not recorded, and here is its name" is the only honest third option.
import { slugify } from '../../../tools/cellmode/slug.mjs';
import { STATUS_BY_SYMBOL, field, nextStepState } from './model.mjs';

/** @typedef {import('../../../tools/cellmode/types.mjs').LogEntry} LogEntry */
/** @typedef {import('./types.mjs').Entry} Entry */
/** @typedef {import('./types.mjs').Model} Model */
/** @typedef {import('./types.mjs').TimelineEvent} TimelineEvent */

/** What the protocol does NOT record. `open` and `resume` leave no log entry, so the
 * observer says so instead of synthesising one from a file timestamp. */
export const NOT_RECORDED = Object.freeze(['open', 'resume']);

/** Newest first, everywhere: `recent` and `timeline` read the same way. */
export const RECENT_LIMIT = 5;
export const DEFAULT_TIMELINE_LIMIT = 100;

/** The logged status decides the kind. A third value means the log carries something
 * the protocol does not define, and 'reconstructed' says exactly that.
 * @type {(status: string) => 'pause' | 'complete' | 'reconstructed'} */
const kindOf = (status) => {
  if (status === '⏸') return 'pause';
  if (status === '✔') return 'complete';
  return 'reconstructed';
};

/** The protocol symbol as the WORD the whole API publishes — `CellSummary.status`,
 * `GraphNode.status` and `TimelineEvent.status` speak one vocabulary, so a caller
 * never has to know which of them chose the symbol. A symbol the protocol does not
 * define has no word: `null` plus the raw `statusSymbol`, never an invented status.
 * @type {(symbol: string) => string | null} */
const wordOf = (symbol) => /** @type {Record<string, string | undefined>} */ (
  STATUS_BY_SYMBOL)[symbol] ?? null;

/** Log entries name a CELL BY NAME; the API speaks ids. Resolving here keeps
 * `timeline {cell}` and `TimelineEvent.cell` in one vocabulary.
 * @type {(model: Model) => (name: string) => string} */
const idResolver = (model) => {
  /** @type {Map<string, string>} */
  const byName = new Map();
  for (const entry of model.entries) {
    byName.set(entry.name.trim().toLowerCase(), entry.id);
    byName.set(entry.id, entry.id);
  }
  return (name) => byName.get(String(name).trim().toLowerCase()) ?? slugify(name);
};

/** PURE. Log entries -> events, newest first.
 * @param {Model} model @returns {TimelineEvent[]} */
export function events(model) {
  const idOf = idResolver(model);
  return model.logEntries
    .map((e) => {
      // A logged COMPLETION with `—` is the protocol saying "there is no next step";
      // the same dash in a pause entry is a next step the record is missing.
      const kind = kindOf(e.status);
      return {
        at: e.timestamp,
        cell: idOf(e.cell),
        kind,
        status: wordOf(e.status),
        statusSymbol: e.status,
        facts: field(e.facts),
        decisions: field(e.decisions),
        build: field(e.build),
        nextStep: field(e.next),
        nextStepState: nextStepState(e.next, kind === 'complete'),
      };
    })
    .reverse();
}

/** @param {Model} model @param {{ limit?: number, cell?: string }} [input] */
export function timeline(model, { limit = DEFAULT_TIMELINE_LIMIT, cell } = {}) {
  const all = events(model);
  const scoped = cell === undefined ? all : all.filter((e) => e.cell === cell);
  return { events: scoped.slice(0, limit), notRecorded: [...NOT_RECORDED] };
}

/** @param {Model} model */
export function overview(model) {
  /** @type {(status: string) => number} */
  const count = (status) => model.entries.filter((e) => e.status === status).length;
  const active = model.entries.find((e) => e.status === 'active');
  return {
    counts: {
      total: model.entries.length,
      planned: count('planned'),
      active: count('active'),
      paused: count('paused'),
      done: count('done'),
    },
    active: active === undefined ? null : { id: active.id, name: active.name },
    recent: events(model).slice(0, RECENT_LIMIT),
    warnings: model.warnings.map((w) => ({ ...w })),
    integrity: { ok: model.integrity.ok, findings: model.integrity.findings.map((f) => ({ ...f })) },
  };
}

/** @param {Model} model */
export function cells(model) {
  return {
    cells: model.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      area: entry.area,
      status: entry.status,
      statusSymbol: entry.statusSymbol,
      lastVisit: entry.lastVisit,
      nextStep: entry.nextStep,
      nextStepState: entry.nextStepState,
      dependencies: [...entry.dependencies],
    })),
  };
}

/** The last log entry for this cell, which is the cell's EVIDENCE: the detail view
 * may show a cell file, but only the log can say that anything ran.
 * @type {(model: Model, id: string) => { logEntries: number, lastStatus: string | null,
 *   lastBuild: string | null }} */
function evidenceFor(model, id) {
  const own = events(model).filter((e) => e.cell === id);
  const last = own[0];
  return {
    logEntries: own.length,
    lastStatus: last?.status ?? null,
    lastBuild: last?.build ?? null,
  };
}

/**
 * PURE. The full detail of one cell, or `null` when the id names no cell. The id is
 * matched against the parsed index and is never concatenated into a path, so an id
 * shaped like a traversal is simply a cell that does not exist.
 * @param {Model} model @param {string} id
 */
export function cellDetail(model, id) {
  const entry = model.byId.get(id);
  if (entry === undefined) return null;
  const c = entry.cell;
  /** @type {Record<string, string | null>} */
  const optional = {
    area: entry.area,
    objective: field(c?.objective),
    inputs: field(c?.inputs),
    outputs: field(c?.outputs),
    allowedOperations: field(c?.allowed),
    prohibitedOperations: field(c?.prohibited),
    doneCriterion: field(c?.doneCriterion),
    lastFact: field(c?.lastFact),
    build: field(c?.build),
    decisions: field(c?.decisions),
    openIssues: field(c?.openIssues),
    minimalContext: field(c?.minimalContext),
    nextStep: entry.nextStep,
  };
  const boundary = { in: field(c?.boundaryIn), out: field(c?.boundaryOut) };
  // `unavailable` means "the host could not read this". A completed cell's empty next
  // step WAS read, and it says the cell is finished — listing it would turn a recorded
  // fact into a missing one, which is the same lie in the other direction.
  const unavailable = Object.entries(optional)
    .filter(([name, value]) => value === null
      && !(name === 'nextStep' && entry.nextStepState === 'none'))
    .map(([name]) => name);
  if (boundary.in === null) unavailable.push('boundary.in');
  if (boundary.out === null) unavailable.push('boundary.out');
  return {
    id: entry.id,
    name: entry.name,
    status: entry.status,
    ...optional,
    nextStepState: entry.nextStepState,
    boundary,
    dependencies: [...entry.dependencies],
    evidence: evidenceFor(model, entry.id),
    unavailable: unavailable.sort(),
  };
}
