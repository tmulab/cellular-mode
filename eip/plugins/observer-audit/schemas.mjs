// The capability schemas of `observer.audit` — the contract the UI is built against.
//
// Written in the SDK schema subset, which has no union and no `nullable`. A field that is
// "a string or null" is expressed by OMITTING `type`: the validator applies the string
// keywords when the value is a string and nothing when it is `null`. That is the same idiom
// `observer.state` uses, and `api/openapi.json` repeats these shapes with a contract test
// over real HTTP responses.
//
// `status` is an ENUM of the five verdicts. That matters more than it looks: a frontend
// cannot invent a sixth, and it cannot receive `PASS` for something nobody ran, because
// UNAVAILABLE is a value of the same field rather than an absence to interpret.
import { STATUSES } from './statuses.mjs';

/** @typedef {import('../../sdk/types.mjs').Schema} Schema */
/** @typedef {import('../../sdk/types.mjs').Capability} Capability */

/** An explanation is a paragraph a human reads, not a payload. */
export const MAX_TEXT = 2000;
/** One evidence line is an ADDRESS plus a measured value. */
export const MAX_EVIDENCE_LINE = 400;
export const MAX_EVIDENCE_LINES = 64;
/** `cell:` plus an 80-character id, with room to spare. */
export const MAX_SCOPE = 90;
export const MAX_FINDINGS = 5000;

/** @type {(properties: Record<string, Schema>, required: string[]) => Schema} */
const obj = (properties, required) => ({
  type: 'object', properties, required, additionalProperties: false,
});

/** @type {Schema} */
const NAME = { type: 'string', minLength: 1, maxLength: 64 };
/** @type {Schema} */
const SCOPE = { type: 'string', minLength: 1, maxLength: MAX_SCOPE };
/** @type {Schema} */
const TEXT = { type: 'string', maxLength: MAX_TEXT };
/** A timestamp, or `null` when no audit has run. @type {Schema} */
const OPTIONAL_AT = { maxLength: 40 };
/** @type {Schema} */
const COUNT = { type: 'integer', minimum: 0 };
/** @type {Schema} */
export const STATUS = { type: 'string', enum: [...STATUSES] };

/** @type {Schema} */
export const FINDING = obj({
  id: NAME,
  scope: SCOPE,
  rule: NAME,
  status: STATUS,
  evidence: {
    type: 'array',
    items: { type: 'string', maxLength: MAX_EVIDENCE_LINE },
    maxItems: MAX_EVIDENCE_LINES,
  },
  explanation: TEXT,
  // Optional by being absent from `required`: a PASS has nothing to suggest, and an empty
  // string would be a suggestion that says nothing.
  action: TEXT,
}, ['id', 'scope', 'rule', 'status', 'evidence', 'explanation']);

/** @type {Schema} */
export const SUMMARY = obj({
  PASS: COUNT, FAIL: COUNT, WARNING: COUNT, UNAVAILABLE: COUNT, NOT_APPLICABLE: COUNT,
}, ['PASS', 'FAIL', 'WARNING', 'UNAVAILABLE', 'NOT_APPLICABLE']);

/** @type {Schema} */
const FINDINGS = { type: 'array', items: FINDING, maxItems: MAX_FINDINGS };

/** The two capabilities. Both read-only, so both `consequential: false`: judging a
 * repository changes nothing in it, and the auditor has no port that could.
 * @type {Record<string, Capability>} */
export const CAPABILITIES = {
  'run-audit': {
    description: 'Runs every deterministic rule over this vault and repository and answers the findings,'
      + ' each with its evidence. Reads only: it never fixes anything and never runs a process.',
    consequential: false,
    input: obj({}, []),
    output: obj({ at: { type: 'string', minLength: 1, maxLength: 40 }, findings: FINDINGS, summary: SUMMARY },
      ['at', 'findings', 'summary']),
  },
  findings: {
    description: 'The findings of the LAST audit, optionally filtered by status or scope. Answers one'
      + ' UNAVAILABLE finding when no audit has run in this session — never an empty PASS.',
    consequential: false,
    input: obj({ status: STATUS, scope: SCOPE }, []),
    output: obj({ ran: { type: 'boolean' }, at: OPTIONAL_AT, findings: FINDINGS, summary: SUMMARY },
      ['ran', 'at', 'findings', 'summary']),
  },
};
