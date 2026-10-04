// The SCHEMAS, as the single source of truth for both the JS validators and the JSON files
// published under `upp/schemas/`. Written in the SDK subset (`eip/sdk/schema.mjs`) so the
// runtime's own validator can check every message, and so another language can read the
// published file instead of a translation of it.
//
// An honest limit, stated here rather than discovered later: the subset has no `oneOf`, no
// `patternProperties` and no `pattern`. So a published schema describes the SHAPE — which
// fields exist and of what type — while the CONDITIONAL rules (which `entry` belongs to
// which `runtime`, which capability ids are legal, which keys are forbidden in a
// security-sensitive section) live in `manifest.mjs` and `sections.mjs`, are specified in
// `docs/upp/SPEC.md` §4, and are the ones the conformance fixtures exercise. A shape schema
// that pretended to be the whole contract would be the dangerous artefact.
import { PERMISSIONS } from '../sdk/index.mjs';
import { UPP_MANIFEST_FIELDS, UPP_MANIFEST_TYPES } from './manifest.mjs';
import { AUTH_MODES, RUNTIMES } from './sections.mjs';
import { SUPPORTED_PROTOCOL_VERSIONS, UPP_VERSION } from './version.mjs';

/** @typedef {import('../sdk/schema.mjs').Schema} Schema */

/** An empty schema accepts anything: "no contract declared" is not "invalid". Used where the
 * shape is a plugin's own business (`input`, `output`) or where the subset cannot say it. */
/** Freeze a literal without widening it to `readonly`: the SDK's `Schema` type uses mutable
 * arrays, and a frozen-at-the-type-level array would not satisfy it. Immutability is the
 * runtime guarantee here, and the type stays the contract's own.
 * @type {<T>(value: T) => T} */
const deepFreeze = (value) => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const ANY = deepFreeze({});

/** @type {(properties: Record<string, Schema>, required?: string[]) => Schema} */
const object = (properties, required = []) => deepFreeze({
  type: 'object', properties, required: [...required], additionalProperties: false,
});
/** @type {(extra?: Partial<Schema>) => Schema} */
const text = (extra = {}) => deepFreeze({ type: 'string', minLength: 1, ...extra });
/** @type {(min?: number) => Schema} */
const whole = (min = 0) => deepFreeze({ type: 'integer', minimum: min });

/** The shape of a UPP manifest. Keys deliberately in the order of `UPP_MANIFEST_FIELDS`. */
export const MANIFEST_SCHEMA = object({
  upp: deepFreeze({ type: 'string', enum: [...SUPPORTED_PROTOCOL_VERSIONS] }),
  id: text({ maxLength: 128 }),
  version: text({ maxLength: 64 }),
  description: text({ maxLength: 1024 }),
  type: deepFreeze({ type: 'string', enum: [...UPP_MANIFEST_TYPES] }),
  runtime: deepFreeze({ type: 'string', enum: [...RUNTIMES] }),
  entry: deepFreeze({ type: 'object' }),
  capabilities: deepFreeze({ type: 'object' }),
  permissions: deepFreeze({
    type: 'array', maxItems: PERMISSIONS.length,
    items: deepFreeze({ type: 'string', enum: [...PERMISSIONS] }),
  }),
  dependencies: deepFreeze({ type: 'object' }),
  config: deepFreeze({ type: 'object' }),
  health: object({ method: text(), path: text(), intervalMs: whole(100) }),
  lifecycle: object({ startupTimeoutMs: whole(), shutdownTimeoutMs: whole() }),
  application: object({
    baseUrl: text(), healthPath: text(),
    routes: deepFreeze({ type: 'array', items: text(), maxItems: 256 }),
    auth: deepFreeze({ type: 'string', enum: [...AUTH_MODES] }),
    cors: object({
      allowedOrigins: deepFreeze({ type: 'array', items: text(), maxItems: 64 }),
    }, ['allowedOrigins']),
  }, ['baseUrl', 'healthPath', 'routes', 'auth', 'cors']),
  extensions: deepFreeze({ type: 'object' }),
}, ['upp', 'id', 'version', 'description', 'type', 'runtime', 'entry', 'capabilities']);

/** Every method of UPP 1.0, in lifecycle order. The two notifications are named apart. */
export const METHODS = Object.freeze([
  'upp.initialize', 'upp.capabilities', 'upp.execute', 'upp.cancel',
  'upp.health', 'upp.shutdown', 'upp.exit',
]);

/** A notification has no `id` and gets no answer. @type {ReadonlyArray<string>} */
export const NOTIFICATIONS = Object.freeze(['upp.cancel', 'upp.exit']);

export const HEALTH_STATUSES = Object.freeze(['ok', 'degraded', 'unhealthy']);

const EMPTY = object({});

/** `params` per method. An absent entry would mean "unvalidated", so every method has one. */
export const PARAMS_SCHEMA_BY_METHOD = Object.freeze({
  'upp.initialize': object({
    protocolVersions: deepFreeze({ type: 'array', items: text({ maxLength: 16 }), maxItems: 64 }),
    host: object({ name: text({ maxLength: 128 }), version: text({ maxLength: 64 }), capabilities: deepFreeze({ type: 'object' }) }, ['name', 'version']),
    config: deepFreeze({ type: 'object' }),
    extensions: deepFreeze({ type: 'object' }),
  }, ['protocolVersions', 'host']),
  'upp.capabilities': EMPTY,
  'upp.execute': object({
    capability: text({ maxLength: 128 }), input: ANY, deadlineMs: whole(),
  }, ['capability', 'input']),
  // `id` is an integer OR a string, which the subset cannot say; `validateMessage` proves it.
  'upp.cancel': object({ id: ANY }, ['id']),
  'upp.health': EMPTY,
  'upp.shutdown': EMPTY,
  'upp.exit': EMPTY,
});

/** `result` per method that has one. The two notifications are absent on purpose. */
export const RESULT_SCHEMA_BY_METHOD = Object.freeze({
  'upp.initialize': object({
    protocolVersion: text({ maxLength: 16 }),
    manifest: deepFreeze({ type: 'object' }),
    extensions: deepFreeze({ type: 'object' }),
  }, ['protocolVersion', 'manifest']),
  'upp.capabilities': object({ capabilities: deepFreeze({ type: 'object' }) }, ['capabilities']),
  'upp.execute': object({ output: ANY }, ['output']),
  'upp.health': object({
    status: deepFreeze({ type: 'string', enum: [...HEALTH_STATUSES] }),
    detail: deepFreeze({ type: 'string', maxLength: 1024 }),
  }, ['status']),
  'upp.shutdown': EMPTY,
});

/** The error object every failure carries. `data.code` is a kernel CODE; no stack, ever. */
export const ERROR_SCHEMA = object({
  code: deepFreeze({ type: 'integer' }),
  message: text({ maxLength: 4096 }),
  data: object({
    code: text({ maxLength: 64 }),
    details: deepFreeze({
      type: 'array', maxItems: 256,
      items: object({ path: deepFreeze({ type: 'string' }), message: text({ maxLength: 1024 }) }, ['path', 'message']),
    }),
  }, ['code']),
}, ['code', 'message', 'data']);

/** @type {(title: string, description: string, body: Record<string, unknown>) => Record<string, unknown>} */
const document = (title, description, body) => ({
  $comment: 'GENERATED from eip/upp/schemas.mjs - do not edit by hand. '
    + 'Written in the SDK schema subset (eip/sdk/schema.mjs): type, properties, required, '
    + 'additionalProperties:false, items, enum, minLength, maxLength, minimum, maximum, maxItems. '
    + 'SHAPE only: the conditional rules (entry per runtime, capability ids, forbidden keys in a '
    + 'security-sensitive section) are specified in docs/upp/SPEC.md and enforced by '
    + 'eip/upp/manifest.mjs. Do not read this file as the whole contract.',
  upp: UPP_VERSION,
  title,
  description,
  ...body,
});

/** The publishable manifest schema. Plain JSON: no functions, no undefined, no cycles.
 * @returns {Record<string, unknown>} */
export function manifestSchemaDocument() {
  return document('UPP 1.0 plugin manifest',
    'The shape of a Universal Plugin Protocol manifest.',
    { fields: [...UPP_MANIFEST_FIELDS], schema: MANIFEST_SCHEMA });
}

/** The publishable message schema: methods, params, results and the error object.
 * @returns {Record<string, unknown>} */
export function messageSchemaDocument() {
  return document('UPP 1.0 messages',
    'JSON-RPC 2.0 method set, parameter and result shapes, and the error object.',
    {
      jsonrpc: '2.0',
      methods: [...METHODS],
      notifications: [...NOTIFICATIONS],
      params: PARAMS_SCHEMA_BY_METHOD,
      results: RESULT_SCHEMA_BY_METHOD,
      error: ERROR_SCHEMA,
    });
}

/** The two files published under `upp/schemas/`, each with the function that produces it.
 * Declared HERE, beside the schemas themselves, so the writer under `upp/schemas/` is a thin
 * disk shell and a test can compare the committed bytes without importing anything that
 * writes. A test that had to load the writer would regenerate the files it was checking —
 * the exact false green this split removes.
 * @type {ReadonlyArray<{ file: string, document: () => Record<string, unknown> }>} */
export const PUBLISHED_SCHEMAS = Object.freeze([
  Object.freeze({ file: 'manifest.schema.json', document: manifestSchemaDocument }),
  Object.freeze({ file: 'message.schema.json', document: messageSchemaDocument }),
]);

/** Two spaces and a trailing newline: the shape a reviewer reads in a diff and every editor
 * leaves alone. The committed bytes are compared exactly, so the formatting is part of the
 * contract between the generator and the files.
 * @param {Record<string, unknown>} document @returns {string} */
export function renderSchemaFile(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}
