// The capability schemas — the contract an independent frontend is built against.
//
// Written in the SDK schema subset, which has no union and no `nullable`. A field
// that is "a string or null" is therefore expressed by OMITTING `type`: the validator
// applies the string keywords when the value is a string and nothing when it is
// `null`, which is exactly the intended meaning and stays inside the subset. The same
// idiom gives "an object of this shape, or null". `api/openapi.json` repeats these
// shapes, and a contract test validates real responses against both.
import { STATUSES } from './model.mjs';
import { DEFAULT_TIMELINE_LIMIT, RECENT_LIMIT } from './views.mjs';

/** @typedef {import('../../sdk/types.mjs').Schema} Schema */
/** @typedef {import('../../sdk/types.mjs').Capability} Capability */

/** A single field of a cell file: one line of Markdown, not a payload. */
export const MAX_FIELD = 4000;
export const MAX_TIMELINE_LIMIT = 500;
export { DEFAULT_TIMELINE_LIMIT };

/** @type {(properties: Record<string, Schema>, required: string[]) => Schema} */
const obj = (properties, required) => ({
  type: 'object', properties, required, additionalProperties: false,
});
/** An object of this shape, OR null. @type {(properties: Record<string, Schema>, required: string[]) => Schema} */
const orNull = (properties, required) => ({ properties, required, additionalProperties: false });

/** @type {Schema} */
const ID = { type: 'string', minLength: 1, maxLength: 80 };
/** @type {Schema} */
const TEXT = { type: 'string', maxLength: MAX_FIELD };
/** A string of at most MAX_FIELD characters, OR null. @type {Schema} */
const OPTIONAL_TEXT = { maxLength: MAX_FIELD };
/** @type {Schema} */
const COUNT = { type: 'integer', minimum: 0 };
/** @type {Schema} */
const COORD = { type: 'integer' };
/** @type {Schema} */
const STATUS = { type: 'string', enum: [...STATUSES] };
/** @type {Schema} */
const IDS = { type: 'array', items: ID, maxItems: 500 };

/** @type {Schema} */
export const WARNING = {
  type: 'object',
  properties: { code: ID, message: TEXT, cell: ID },
  required: ['code', 'message'],
  additionalProperties: false,
};
/** @type {Schema} */
export const FINDING = obj({ code: ID, message: TEXT }, ['code', 'message']);
/** @type {Schema} */
export const EVENT = obj({
  at: { type: 'string', minLength: 16, maxLength: 16 },
  cell: ID,
  kind: { type: 'string', enum: ['pause', 'complete', 'reconstructed'] },
  // The WORD, one vocabulary with CellSummary and GraphNode. `null` is in the enum on
  // purpose: a symbol the protocol does not define has no word, and inventing one
  // would be the fabrication this whole contract exists to refuse.
  status: { enum: [...STATUSES, null] },
  statusSymbol: { type: 'string', maxLength: 8 },
  facts: OPTIONAL_TEXT,
  decisions: OPTIONAL_TEXT,
  build: OPTIONAL_TEXT,
  nextStep: OPTIONAL_TEXT,
}, ['at', 'cell', 'kind', 'status', 'statusSymbol', 'facts', 'decisions', 'build', 'nextStep']);
/** @type {Schema} */
export const CELL_SUMMARY = obj({
  id: ID,
  name: TEXT,
  area: OPTIONAL_TEXT,
  status: STATUS,
  statusSymbol: { type: 'string', maxLength: 8 },
  lastVisit: OPTIONAL_TEXT,
  nextStep: OPTIONAL_TEXT,
  dependencies: IDS,
}, ['id', 'name', 'area', 'status', 'statusSymbol', 'lastVisit', 'nextStep', 'dependencies']);
/** @type {Schema} */
export const GRAPH_NODE = obj({
  id: ID,
  name: TEXT,
  status: STATUS,
  // The index into `layout.columns`, bounded by the four protocol statuses.
  column: { type: 'integer', minimum: 0, maximum: 3 },
  layer: COUNT,
  x: COORD,
  y: COORD,
  z: COORD,
}, ['id', 'name', 'status', 'column', 'layer', 'x', 'y', 'z']);
/** @type {Schema} */
export const GRAPH_EDGE = obj({ from: ID, to: ID }, ['from', 'to']);

const DETAIL_FIELDS = [
  'objective', 'inputs', 'outputs', 'allowedOperations', 'prohibitedOperations',
  'doneCriterion', 'lastFact', 'build', 'decisions', 'openIssues', 'minimalContext', 'nextStep',
];

/** The five capabilities, exactly as the host publishes them. All read-only, so all
 * `consequential: false`: reading a vault is not an act in the world.
 * @type {Record<string, Capability>} */
export const CAPABILITIES = {
  overview: {
    description: 'Counts, the active cell, the five most recent recorded closures, warnings and the integrity verdict.',
    consequential: false,
    input: obj({}, []),
    output: obj({
      counts: obj({
        total: COUNT, planned: COUNT, active: COUNT, paused: COUNT, done: COUNT,
      }, ['total', 'planned', 'active', 'paused', 'done']),
      active: orNull({ id: ID, name: TEXT }, ['id', 'name']),
      recent: { type: 'array', items: EVENT, maxItems: RECENT_LIMIT },
      warnings: { type: 'array', items: WARNING, maxItems: 2000 },
      integrity: obj({
        ok: { type: 'boolean' },
        findings: { type: 'array', items: FINDING, maxItems: 2000 },
      }, ['ok', 'findings']),
    }, ['counts', 'active', 'recent', 'warnings', 'integrity']),
  },
  cells: {
    description: 'One summary per row of INDEX.md, with the dependencies each cell file declares.',
    consequential: false,
    input: obj({}, []),
    output: obj({ cells: { type: 'array', items: CELL_SUMMARY, maxItems: 5000 } }, ['cells']),
  },
  'cell-detail': {
    description: 'Every recorded field of one cell. A field the vault does not carry is null and is named in "unavailable".',
    consequential: false,
    input: obj({ id: ID }, ['id']),
    output: obj({
      id: ID,
      name: TEXT,
      status: STATUS,
      area: OPTIONAL_TEXT,
      boundary: obj({ in: OPTIONAL_TEXT, out: OPTIONAL_TEXT }, ['in', 'out']),
      dependencies: IDS,
      evidence: obj({
        logEntries: COUNT, lastStatus: OPTIONAL_TEXT, lastBuild: OPTIONAL_TEXT,
      }, ['logEntries', 'lastStatus', 'lastBuild']),
      unavailable: { type: 'array', items: ID, maxItems: 64 },
      ...Object.fromEntries(DETAIL_FIELDS.map((name) => [name, OPTIONAL_TEXT])),
    }, ['id', 'name', 'status', 'area', 'boundary', 'dependencies', 'evidence', 'unavailable',
      ...DETAIL_FIELDS]),
  },
  graph: {
    description: 'Nodes with deterministic server-side positions, and edges from DECLARED dependencies only.',
    consequential: false,
    input: obj({}, []),
    output: obj({
      nodes: { type: 'array', items: GRAPH_NODE, maxItems: 5000 },
      edges: { type: 'array', items: GRAPH_EDGE, maxItems: 20000 },
      dangling: { type: 'array', items: GRAPH_EDGE, maxItems: 20000 },
      layout: obj({
        columns: { type: 'array', items: { type: 'string' }, maxItems: 8 },
        layers: { type: 'integer', minimum: 1 },
      }, ['columns', 'layers']),
    }, ['nodes', 'edges', 'dangling', 'layout']),
  },
  timeline: {
    description: 'Recorded closures from log.md only. Opening and resuming are not logged by the protocol and are listed in "notRecorded".',
    consequential: false,
    input: obj({
      limit: { type: 'integer', minimum: 1, maximum: MAX_TIMELINE_LIMIT },
      cell: ID,
    }, []),
    output: obj({
      events: { type: 'array', items: EVENT, maxItems: MAX_TIMELINE_LIMIT },
      notRecorded: { type: 'array', items: ID, maxItems: 8 },
    }, ['events', 'notRecorded']),
  },
};
