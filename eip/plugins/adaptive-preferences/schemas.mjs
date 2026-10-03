// The capability schema of `adaptive.preferences` — one capability, one output shape.
//
// The shape is NOT a new contract: it is exactly `EffectiveMode` from
// `tools/adaptive/types.mjs`, field for field, so the dashboard and the CLI report the same
// five standings in the same words. Inventing a second, "nicer" shape here is how a reader
// ends up with two answers to "what mode is this".
//
// Written in the SDK schema subset, which has no union and no `nullable`. "A string or null"
// is expressed by OMITTING `type` (the string keywords then apply only to strings); "one of
// these values or null" is expressed by putting `null` IN the enum, which `check` compares by
// value. Both idioms stay inside the subset, and `validateSchema` proves it.
import { MODE_IDS } from '../../../tools/adaptive/modes.mjs';
import { SOURCES } from '../../../tools/adaptive/schema.mjs';

/** @typedef {import('../../sdk/types.mjs').Schema} Schema */
/** @typedef {import('../../sdk/types.mjs').Capability} Capability */

/** The five standings, in the order `tools/adaptive/types.mjs` documents them. A reader must
 * be able to tell `expired` from `none` and `invalid` from both. */
export const STANDINGS = Object.freeze(['active', 'expired', 'invalid', 'none', 'disabled']);

/** A notice is one human sentence, not a payload. */
export const MAX_NOTICE = 400;

/** An ISO 8601 instant, as long as `Date.prototype.toISOString` ever writes one. */
export const MAX_INSTANT = 40;

/** @type {Schema} */
export const CURRENT = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    mode: { type: 'string', enum: [...MODE_IDS] },
    standing: { type: 'string', enum: [...STANDINGS] },
    declaredBy: { enum: ['user', null] },
    source: { enum: [...SOURCES, null] },
    activatedAt: { maxLength: MAX_INSTANT },
    expiresAt: { maxLength: MAX_INSTANT },
    notice: { maxLength: MAX_NOTICE },
  },
  required: ['enabled', 'mode', 'standing', 'declaredBy', 'source', 'activatedAt', 'expiresAt', 'notice'],
  additionalProperties: false,
};

/** @type {Readonly<Record<string, Capability>>} */
export const CAPABILITIES = Object.freeze({
  current: {
    description: 'The mode the human declared and whether that declaration still stands, read'
      + ' from .cellular/adaptive/. Reports; never interprets, never infers, never writes.',
    consequential: false,
    input: {
      type: 'object', properties: {}, required: [], additionalProperties: false,
    },
    output: CURRENT,
  },
});
