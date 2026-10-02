// The schema subset is the narrowest part of the contract, so it is pinned hard:
// what it accepts, what it refuses, and the fact that a SCHEMA is itself data
// that must pass validation before anybody trusts it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { check, validate, validateSchema } from './schema.mjs';

/** @typedef {import('./schema.mjs').Schema} Schema */
/** @typedef {import('./schema.mjs').SchemaError} SchemaError */

/** @type {(errors: ReadonlyArray<SchemaError>, path: string) => string} */
const messageAt = (errors, path) => errors.find((e) => e.path === path)?.message ?? '';

/** @type {Schema} */
const invoiceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['customer', 'lines'],
  properties: {
    customer: { type: 'string', minLength: 2, maxLength: 60 },
    currency: { type: 'string', enum: ['EUR', 'USD', 'BRL'] },
    lines: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sku', 'amount'],
        properties: { sku: { type: 'string' }, amount: { type: 'number', minimum: 0, maximum: 1e6 } },
      },
    },
    draft: { type: 'boolean' },
  },
};

test('schema · a legal schema reports no problem', () => {
  assert.deepEqual(validateSchema(invoiceSchema), []);
});

test('schema · a schema with an unsupported keyword is itself a contract error', () => {
  const errors = validateSchema({ type: 'string', pattern: '^a+$', format: 'email' });
  assert.deepEqual(errors.map((e) => e.path).sort(), ['format', 'pattern']);
  assert.match(messageAt(errors, 'format'), /unsupported schema keyword/);
});

test('schema · unsupported keywords are caught in nested positions too', () => {
  const errors = validateSchema({
    type: 'object',
    properties: { lines: { type: 'array', items: { type: 'string', pattern: 'x' } } },
  });
  assert.deepEqual(errors, [{
    path: 'properties.lines.items.pattern',
    message: 'unsupported schema keyword "pattern"',
  }]);
});

test('schema · only additionalProperties:false is supported', () => {
  assert.deepEqual(validateSchema({ type: 'object', additionalProperties: true }), [
    { path: 'additionalProperties', message: 'only additionalProperties:false is supported' },
  ]);
  assert.deepEqual(validateSchema({ type: 'tuple' })[0]?.path, 'type');
});

test('schema · a valid value passes with an empty error list', () => {
  const value = { customer: 'Northwind Ltd', currency: 'EUR', lines: [{ sku: 'A-1', amount: 10.5 }] };
  assert.deepEqual(check(invoiceSchema, value), { ok: true, errors: [] });
});

test('schema · a missing required property is reported at its own path', () => {
  const errors = validate(invoiceSchema, { customer: 'Northwind Ltd' });
  assert.deepEqual(errors, [{ path: 'lines', message: 'is required' }]);
});

test('schema · an undeclared property is refused when additionalProperties is false', () => {
  const errors = validate(invoiceSchema, { customer: 'Northwind Ltd', lines: [], vatId: 'X' });
  assert.deepEqual(errors, [{ path: 'vatId', message: 'is not an allowed property' }]);
});

test('schema · type, enum, bounds and array limits all report structured paths', () => {
  const errors = validate(invoiceSchema, {
    customer: 'N',
    currency: 'GBP',
    lines: [
      { sku: 'A', amount: -1 },
      { sku: 'B', amount: 1 },
      { sku: 'C', amount: 1 },
      { sku: 'D', amount: 1 },
    ],
    draft: 'yes',
  });
  const found = errors.map((e) => `${e.path}`).sort();
  assert.deepEqual(found, ['currency', 'customer', 'draft', 'lines', 'lines.0.amount']);
  assert.match(messageAt(errors, 'lines.0.amount'), /must be >= 0/);
  assert.match(messageAt(errors, 'lines'), /at most 3 item/);
});

test('schema · integer and number are distinguished, null is its own type', () => {
  assert.deepEqual(validate({ type: 'integer' }, 2.5)[0]?.message, 'must be of type integer, got number');
  assert.deepEqual(validate({ type: 'number' }, 2.5), []);
  assert.deepEqual(validate({ type: 'null' }, null), []);
  assert.equal(validate({ type: 'object' }, []).length, 1);
  assert.equal(validate({ type: 'array' }, {}).length, 1);
});

test('schema · enum compares by value, not by reference', () => {
  const schema = { enum: [{ unit: 'kg' }, { unit: 'lb' }] };
  assert.deepEqual(validate(schema, { unit: 'lb' }), []);
  assert.equal(validate(schema, { unit: 'oz' }).length, 1);
});

test('schema · an absent schema declares no contract and so refuses nothing', () => {
  assert.deepEqual(validate(undefined, { anything: true }), []);
});
