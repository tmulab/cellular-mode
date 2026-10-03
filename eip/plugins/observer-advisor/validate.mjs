// PURE. The safety core: model text in, validated recommendations out.
//
// The single assumption of this module is that THE MODEL IS UNTRUSTED. Not malicious
// necessarily - just unaccountable: it can answer with anything, and nothing it answers is
// evidence of anything. So its text is treated the way a server treats a request body:
//
//   parsed strictly (size cap, JSON only, prototype keys dropped by the parse itself);
//   rebuilt field by field, so a property the contract does not name CANNOT reach a caller -
//     `command`, `approve`, `exec`, `tool` do not survive, because the output is constructed
//     here rather than copied;
//   GROUNDED by `grounding.mjs`: a VERIFIED or INFERRED claim must cite at least one id that
//     was actually in the context, or it is downgraded to UNKNOWN; a reference to something
//     that was never supplied is removed and recorded;
//   checked for borrowed authority: a statement claiming tests passed, a build succeeded or a
//     file exists, when the evidence says nothing of the kind, is downgraded.
//
// And one thing this module does NOT do, anywhere, by construction: act. There is no call, no
// spawn, no fetch, no write and no capability invocation in this file. A recommendation is a
// string with a label on it.
import { GROUNDED_LABELS, LABELS, REC_KINDS } from './model.mjs';
import {
  MAX_STATEMENT, MAX_UNCERTAINTY, UNSTATED, UNSUPPORTED, borrowedAuthority, groundRefs, plainText,
} from './grounding.mjs';

/** @typedef {import('./types.mjs').Label} Label */
/** @typedef {import('./types.mjs').Rec} Rec */
/** @typedef {import('./types.mjs').Validated} Validated */

/** The model answer's own size cap. Measured in bytes, before parsing. */
export const MAX_OUTPUT_BYTES = 16384;
/** How many recommendations one answer may carry. More than this is noise, not advice. */
export const MAX_RECS = 10;
/** How many notes the validation record keeps. */
export const MAX_NOTES = 20;

/** Keys that are never a data field, dropped by the parse itself. */
export const POISON_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

/**
 * PURE. Strict parse. Answers a reason instead of throwing, because "the model answered
 * rubbish" is a normal Tuesday and not a fault of this process.
 * @param {unknown} text
 * @returns {{ ok: true, value: Record<string, unknown> } | { ok: false, reason: string }}
 */
export function parseModelJson(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'the adapter did not answer with text' };
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_OUTPUT_BYTES) {
    return { ok: false, reason: `the answer is ${bytes} bytes, over the ${MAX_OUTPUT_BYTES}-byte cap` };
  }
  /** @type {unknown} */
  let parsed;
  try {
    // The reviver is the defence, not a clean-up afterwards: a dangerous key never becomes a
    // property of anything, because returning `undefined` from a reviver deletes it.
    parsed = JSON.parse(text, (key, value) => (POISON_KEYS.includes(key) ? undefined : value));
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : 'parse failed';
    return { ok: false, reason: `the answer is not JSON: ${why}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'the answer is not a JSON object' };
  }
  return { ok: true, value: /** @type {Record<string, unknown>} */ (parsed) };
}

/** @type {(value: unknown) => Label} */
const labelOf = (value) => (LABELS.includes(/** @type {Label} */ (value))
  ? /** @type {Label} */ (value)
  : 'UNKNOWN');

/** @type {(parsed: boolean, notes: string[]) => Validated} */
const nothing = (parsed, notes) => ({
  recommendations: [],
  validation: { parsed, accepted: 0, rejected: 0, downgraded: 0, refsRemoved: [], notes },
});

/**
 * PURE. The whole validation, including grounding. Nothing is copied from the model: every
 * field of every answer is rebuilt from a checked value, which is why an invented property
 * cannot reach a caller even if nobody thought to forbid that particular name.
 * @param {unknown} text the adapter's raw answer
 * @param {{ contextIds: ReadonlyArray<string>, contextText?: string }} supplied
 * @returns {Validated}
 */
export function validateOutput(text, { contextIds, contextText = '' }) {
  /** @type {string[]} */
  const notes = [];
  /** @type {string[]} */
  const refsRemoved = [];
  /** @type {(sentence: string) => void} */
  const note = (sentence) => {
    if (notes.length < MAX_NOTES) notes.push(plainText(sentence, 160));
  };
  const parsed = parseModelJson(text);
  if (!parsed.ok) return nothing(false, [parsed.reason]);
  const listed = parsed.value['recommendations'];
  if (!Array.isArray(listed)) return nothing(true, ['the answer carries no "recommendations" array']);

  /** @type {Rec[]} */
  const recommendations = [];
  let rejected = 0;
  let downgraded = 0;
  for (const entry of listed) {
    if (recommendations.length >= MAX_RECS) {
      rejected += 1;
      note(`more than ${MAX_RECS} recommendations were offered; the rest were dropped`);
      continue;
    }
    const record = /** @type {Record<string, unknown>} */ (entry ?? {});
    const kind = REC_KINDS.find((known) => known === record['kind']);
    const statement = plainText(record['statement'], MAX_STATEMENT);
    if (kind === undefined || statement === '') {
      rejected += 1;
      note(kind === undefined
        ? `a recommendation named an unknown kind: ${JSON.stringify(String(record['kind'])).slice(0, 40)}`
        : 'a recommendation carried no statement');
      continue;
    }
    const { kept, removed } = groundRefs(record['evidenceRefs'], contextIds);
    for (const ref of removed) {
      if (!refsRemoved.includes(ref)) refsRemoved.push(ref);
    }
    if (removed.length > 0) {
      note(`${removed.length} reference(s) were not in the supplied context and were removed`);
    }
    let label = labelOf(record['label']);
    let uncertainty = plainText(record['uncertainty'], MAX_UNCERTAINTY) || UNSTATED;
    const borrowed = borrowedAuthority(statement, kept, contextText);
    if (borrowed !== null && label !== 'UNKNOWN') {
      label = 'UNKNOWN';
      uncertainty = borrowed;
      downgraded += 1;
      note(`a recommendation was downgraded to UNKNOWN: ${borrowed}`);
    } else if (GROUNDED_LABELS.includes(label) && kept.length === 0) {
      label = 'UNKNOWN';
      uncertainty = UNSUPPORTED;
      downgraded += 1;
      note('a recommendation claiming to be grounded cited no supplied evidence and was downgraded');
    }
    recommendations.push({
      id: `ADV-${String(recommendations.length + 1).padStart(3, '0')}`,
      kind,
      label,
      statement,
      evidenceRefs: kept,
      uncertainty,
    });
  }
  return {
    recommendations,
    validation: {
      parsed: true, accepted: recommendations.length, rejected, downgraded, refsRemoved, notes,
    },
  };
}
