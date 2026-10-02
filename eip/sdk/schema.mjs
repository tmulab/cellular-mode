// A deliberately tiny JSON-Schema SUBSET. Pure logic, no I/O, no dependencies.
//
// Why a subset: the contract between plugins must be readable in one sitting. A
// full validator would be a dependency with its own semantics to learn, and
// every keyword it adds is a way for two plugins to disagree about a shape.
//
// Supported keywords (nothing else is accepted, in a value OR in a schema):
//   type · properties · required · additionalProperties:false · items · enum
//   minLength · maxLength · minimum · maximum · maxItems

export const TYPES = Object.freeze([
  'string', 'number', 'integer', 'boolean', 'object', 'array', 'null',
]);

export const KEYWORDS = Object.freeze([
  'type', 'properties', 'required', 'additionalProperties', 'items', 'enum',
  'minLength', 'maxLength', 'minimum', 'maximum', 'maxItems',
]);

/** @typedef {{ path: string, message: string }} SchemaError */
/**
 * A schema in the supported subset. Every keyword is optional: `{}` accepts anything.
 * @typedef {{ type?: string, properties?: Record<string, Schema>, required?: string[],
 *   additionalProperties?: false, items?: Schema, enum?: unknown[], minLength?: number,
 *   maxLength?: number, minimum?: number, maximum?: number, maxItems?: number }} Schema
 */

const KNOWN_KEYWORDS = new Set(KEYWORDS);
// Typed as a set of `unknown`: it is asked about arbitrary input, not about strings.
const KNOWN_TYPES = new Set(/** @type {readonly unknown[]} */ (TYPES));

/** @type {(v: unknown) => v is Record<string, unknown>} */
const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @type {(path: string, part: string | number) => string} */
const join = (path, part) => (path === '' ? String(part) : `${path}.${part}`);
/** @type {(path: string, message: string) => SchemaError} */
const err = (path, message) => ({ path, message });

/**
 * Is this schema itself legal? Returns `[{path, message}]` — empty means yes.
 * A schema is data written by a human, so it is validated like any other input.
 * @param {unknown} schema @param {string} [path] @returns {SchemaError[]}
 */
export function validateSchema(schema, path = '') {
  if (!isPlain(schema)) return [err(path, 'schema must be an object')];
  const out = [];
  for (const key of Object.keys(schema)) {
    if (!KNOWN_KEYWORDS.has(key)) {
      out.push(err(join(path, key), `unsupported schema keyword "${key}"`));
    }
  }
  const { type } = schema;
  if (type !== undefined && !KNOWN_TYPES.has(type)) {
    out.push(err(join(path, 'type'), `type must be one of ${TYPES.join(', ')}`));
  }
  if (schema.properties !== undefined) {
    if (!isPlain(schema.properties)) {
      out.push(err(join(path, 'properties'), 'properties must be an object'));
    } else {
      for (const [name, sub] of Object.entries(schema.properties)) {
        out.push(...validateSchema(sub, join(join(path, 'properties'), name)));
      }
    }
  }
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((r) => typeof r !== 'string')) {
      out.push(err(join(path, 'required'), 'required must be an array of strings'));
    }
  }
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
    out.push(err(join(path, 'additionalProperties'), 'only additionalProperties:false is supported'));
  }
  if (schema.items !== undefined) out.push(...validateSchema(schema.items, join(path, 'items')));
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
    out.push(err(join(path, 'enum'), 'enum must be a non-empty array'));
  }
  for (const n of ['minLength', 'maxLength', 'maxItems']) {
    if (schema[n] !== undefined && !Number.isInteger(schema[n])) {
      out.push(err(join(path, n), `${n} must be an integer`));
    }
  }
  for (const n of ['minimum', 'maximum']) {
    if (schema[n] !== undefined && typeof schema[n] !== 'number') {
      out.push(err(join(path, n), `${n} must be a number`));
    }
  }
  return out;
}

/** @type {(value: unknown) => string} */
function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

/** @type {(expected: unknown, value: unknown) => boolean} */
function typeMatches(expected, value) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'object') return isPlain(value);
  return actual === expected;
}

/** @type {(a: unknown, b: unknown) => boolean} */
function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (isPlain(a) && isPlain(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => sameValue(a[k], b[k]));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  return false;
}

/** @type {(schema: Schema, value: string, path: string, out: SchemaError[]) => void} */
function checkString(schema, value, path, out) {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    out.push(err(path, `must have at least ${schema.minLength} character(s)`));
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    out.push(err(path, `must have at most ${schema.maxLength} character(s)`));
  }
}

/** @type {(schema: Schema, value: number, path: string, out: SchemaError[]) => void} */
function checkNumber(schema, value, path, out) {
  if (schema.minimum !== undefined && value < schema.minimum) {
    out.push(err(path, `must be >= ${schema.minimum}`));
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    out.push(err(path, `must be <= ${schema.maximum}`));
  }
}

/** @type {(schema: Schema, value: Record<string, unknown>, path: string, out: SchemaError[]) => void} */
function checkObject(schema, value, path, out) {
  const properties = schema.properties ?? {};
  for (const name of schema.required ?? []) {
    if (!Object.hasOwn(value, name) || value[name] === undefined) {
      out.push(err(join(path, name), 'is required'));
    }
  }
  for (const [name, child] of Object.entries(value)) {
    if (Object.hasOwn(properties, name)) {
      if (child !== undefined) out.push(...validate(properties[name], child, join(path, name)));
    } else if (schema.additionalProperties === false) {
      out.push(err(join(path, name), 'is not an allowed property'));
    }
  }
}

/** @type {(schema: Schema, value: unknown[], path: string, out: SchemaError[]) => void} */
function checkArray(schema, value, path, out) {
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    out.push(err(path, `must have at most ${schema.maxItems} item(s)`));
  }
  if (schema.items !== undefined) {
    value.forEach((item, i) => out.push(...validate(schema.items, item, join(path, i))));
  }
}

/**
 * Validate `value` against `schema`. Returns `[{path, message}]`; empty = valid.
 * An absent schema validates everything: "no contract declared" is not "invalid".
 * @param {Schema|undefined} schema @param {unknown} value @param {string} [path]
 * @returns {SchemaError[]}
 */
export function validate(schema, value, path = '') {
  if (schema === undefined) return [];
  const out = [];
  if (schema.type !== undefined && !typeMatches(schema.type, value)) {
    out.push(err(path, `must be of type ${schema.type}, got ${typeOf(value)}`));
    return out;
  }
  if (schema.enum !== undefined && !schema.enum.some((option) => sameValue(option, value))) {
    out.push(err(path, `must be one of ${schema.enum.map((o) => JSON.stringify(o)).join(', ')}`));
  }
  if (typeof value === 'string') checkString(schema, value, path, out);
  if (typeof value === 'number') checkNumber(schema, value, path, out);
  if (isPlain(value)) checkObject(schema, value, path, out);
  if (Array.isArray(value)) checkArray(schema, value, path, out);
  return out;
}

/**
 * Convenience: `{ok, errors}` for callers that prefer a verdict object.
 * @param {Schema|undefined} schema @param {unknown} value
 * @returns {{ ok: boolean, errors: SchemaError[] }}
 */
export function check(schema, value) {
  const errors = validate(schema, value);
  return { ok: errors.length === 0, errors };
}
