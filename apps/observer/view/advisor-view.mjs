// advisor-view.mjs — PURE. Turns an `observer.advisor` payload into the rows and labels the
// DOM module renders. No DOM here, so every rule below is testable in node.
//
// One decision carries this module: AN ADVISOR ANSWER MUST NEVER BE READABLE AS A FINDING.
// The auditor's verdicts are measurements with evidence; these are a model's sentences. So
// the two are different in WORD (`AI-generated interpretation — not a verification`), in
// SHAPE (the area is dashed and inset, the labels are badges rather than verdict chips) and
// in vocabulary: a recommendation has a LABEL (the model's own claim about its own footing),
// never a status.
//
// The second decision: an absent advisor is a legible state, not an error. `disabledNotice`
// produces one sentence that tells a reader the feature is optional AND that nothing else
// depends on it.
import { field } from './view-model.mjs';

/** @typedef {import('./view-model.mjs').Field} Field */
/** @typedef {{ key: string, label: string, symbol: string, tone: string, meaning: string }} Mark */

/** The sentence an area with no advisor shows. Verbatim: it is the one thing a reader of a
 * half-configured install has to understand. */
export const DISABLED_NOTICE = 'Advisor disabled (optional). Observer and Auditor work without it.';

/** The banner every answer carries, in the markup and in the payload. */
export const AI_BANNER = 'AI-generated interpretation — not a verification';

/** The four labels, in order of decreasing authority. */
export const LABELS = Object.freeze(['VERIFIED', 'INFERRED', 'PROPOSED', 'UNKNOWN']);

/** Each label as a WORD and a SHAPE before it is a colour, and with the meaning a reader
 * needs in order not to read it as a measurement.
 * @type {Readonly<Record<string, Mark>>} */
export const LABEL_MARKS = Object.freeze({
  VERIFIED: {
    key: 'VERIFIED', label: 'VERIFIED', symbol: '[v]', tone: 'verified',
    meaning: 'the model claims the supplied evidence itself states this; it is not a gate result',
  },
  INFERRED: {
    key: 'INFERRED', label: 'INFERRED', symbol: '[~]', tone: 'inferred',
    meaning: 'the model reasoned this from the supplied evidence',
  },
  PROPOSED: {
    key: 'PROPOSED', label: 'PROPOSED', symbol: '[>]', tone: 'proposed',
    meaning: 'a suggestion for something not built; nothing was measured',
  },
  UNKNOWN: {
    key: 'UNKNOWN', label: 'UNKNOWN', symbol: '[?]', tone: 'unknown',
    meaning: 'not settled by the supplied evidence - including a claim that was downgraded',
  },
});

/** A label this build does not know about. Treated as UNKNOWN, never as VERIFIED: the one
 * thing an unrecognised claim must not gain is authority. @type {Mark} */
export const UNRECOGNISED = Object.freeze({
  key: 'UNKNOWN', label: 'UNRECOGNISED LABEL', symbol: '[?]', tone: 'unknown',
  meaning: 'a label this build does not recognise; it is not a verification',
});

/** PURE. @param {unknown} label @returns {Mark} */
export function labelMark(label) {
  const key = typeof label === 'string' ? label : '';
  return LABEL_MARKS[key] ?? UNRECOGNISED;
}

/** PURE. One evidence reference, as something a reader can follow. `cell:<id>` is the only
 * kind this application can navigate to; the rest are shown as the addresses they are.
 * @param {unknown} ref @returns {{ text: string, cell: string | null, kind: string }} */
export function refTarget(ref) {
  const text = typeof ref === 'string' ? ref : '';
  if (text.startsWith('cell:')) {
    const id = text.slice('cell:'.length);
    return { text, cell: /^[a-z0-9-]{1,80}$/.test(id) && id !== 'none' ? id : null, kind: 'cell' };
  }
  const kind = text.startsWith('finding:') ? 'finding' : text.startsWith('log:') ? 'log' : 'question';
  return { text, cell: null, kind };
}

/** PURE. One row per recommendation, nothing dropped and nothing summarised away.
 * @param {unknown} recommendations
 * @returns {Array<{ id: string, kind: string, mark: Mark, statement: Field, uncertainty: Field,
 *   refs: Array<{ text: string, cell: string | null, kind: string }>, hasRefs: boolean }>} */
export function adviceRows(recommendations) {
  const list = Array.isArray(recommendations) ? recommendations : [];
  return list.map((entry) => {
    const record = /** @type {Record<string, unknown>} */ (entry ?? {});
    const refs = (Array.isArray(record['evidenceRefs']) ? record['evidenceRefs'] : []).map(refTarget);
    return {
      id: typeof record['id'] === 'string' ? record['id'] : '',
      kind: typeof record['kind'] === 'string' ? record['kind'] : '',
      mark: labelMark(record['label']),
      statement: field(record['statement']),
      uncertainty: field(record['uncertainty']),
      refs,
      // A recommendation with no reference is a recommendation grounded in nothing, and the
      // absence is shown rather than left as an empty line.
      hasRefs: refs.length > 0,
    };
  });
}

/** PURE. The one line that says which model answered and what it was shown. The adapter is
 * named because "which model said this" is the first thing a reader needs.
 * @param {unknown} meta @returns {{ adapter: string, text: string, network: boolean }} */
export function adapterLine(meta) {
  const record = /** @type {Record<string, unknown>} */ (meta ?? {});
  const adapter = typeof record['adapter'] === 'string' ? record['adapter'] : 'unknown adapter';
  const kind = typeof record['adapterKind'] === 'string' ? record['adapterKind'] : 'unknown kind';
  const network = record['network'] === true;
  const bytes = typeof record['contextBytes'] === 'number' ? record['contextBytes'] : 0;
  const items = Array.isArray(record['contextItems']) ? record['contextItems'].length : 0;
  const calls = typeof record['calls'] === 'number' ? record['calls'] : 0;
  const remaining = typeof record['remaining'] === 'number' ? record['remaining'] : 0;
  const described = adapter === 'fixture' ? 'fixture — deterministic test adapter' : `${adapter} — ${kind} adapter`;
  return {
    adapter,
    network,
    text: `${described} · ${network ? 'NETWORK' : 'no network'} · ${bytes} bytes of context in`
      + ` ${items} item(s) · ${calls} call(s) used, ${remaining} left`,
  };
}

/** PURE. The `status` payload in the shape `adapterLine` reads. The two capabilities
 * describe the adapter differently — `advise` returns it flat in `meta`, `status` nests it
 * under `adapter: { id, kind }` — and reading one as if it were the other is how the area
 * ends up calling a named adapter "unknown" before anything has been asked.
 * @param {unknown} value @returns {Record<string, unknown>} */
export function statusMeta(value) {
  const record = /** @type {Record<string, unknown>} */ (value ?? {});
  const adapter = /** @type {Record<string, unknown>} */ (record['adapter'] ?? {});
  const calls = /** @type {Record<string, unknown>} */ (record['calls'] ?? {});
  return {
    adapter: adapter['id'],
    adapterKind: adapter['kind'],
    network: record['network'] === true || adapter['network'] === true,
    calls: calls['used'],
    remaining: calls['remaining'],
  };
}

/** PURE. What validation did to the answer, as sentences. Empty when it did nothing, so a
 * clean answer carries no noise — but a downgrade or a removed reference is never silent.
 * @param {unknown} meta @returns {string[]} */
export function validationNotes(meta) {
  const record = /** @type {Record<string, unknown>} */ (meta ?? {});
  const validation = /** @type {Record<string, unknown>} */ (record['validation'] ?? {});
  /** @type {string[]} */
  const notes = [];
  if (validation['parsed'] === false) notes.push('The model answer could not be read as the documented JSON.');
  const downgraded = typeof validation['downgraded'] === 'number' ? validation['downgraded'] : 0;
  if (downgraded > 0) {
    notes.push(`${downgraded} claim(s) were downgraded to UNKNOWN: the supplied evidence did not support them.`);
  }
  const rejected = typeof validation['rejected'] === 'number' ? validation['rejected'] : 0;
  if (rejected > 0) notes.push(`${rejected} answer(s) were rejected outright.`);
  const removed = Array.isArray(validation['refsRemoved']) ? validation['refsRemoved'] : [];
  if (removed.length > 0) {
    notes.push(`${removed.length} invented reference(s) were removed: ${removed.map(String).join(', ')}.`);
  }
  const dropped = Array.isArray(record['contextDropped']) ? record['contextDropped'] : [];
  if (dropped.length > 0) {
    notes.push(`${dropped.length} item(s) did not fit the context cap and were not shown to the model.`);
  }
  return notes;
}

/** PURE. The sentence above the list. It never says "no recommendations" without saying
 * whether anything was asked.
 * @param {unknown} value @param {boolean} asked
 * @returns {{ text: string, tone: 'quiet' | 'answered' }} */
export function advisorHeadline(value, asked) {
  const record = /** @type {Record<string, unknown>} */ (value ?? {});
  const count = Array.isArray(record['recommendations']) ? record['recommendations'].length : 0;
  if (!asked) {
    return { tone: 'quiet', text: 'Nothing has been asked yet. The advisor only speaks when you ask it to.' };
  }
  if (count === 0) {
    return { tone: 'quiet', text: 'The model answered nothing this build could accept. Nothing was measured either way.' };
  }
  return { tone: 'answered', text: `${count} model-written recommendation(s). ${AI_BANNER}.` };
}

/** PURE. What the area says when the plugin is not in the composition. The probe's own
 * wording is kept — it distinguishes "not installed" from "host not answering" — and the
 * disabled sentence is added, because only this area knows that its absence is harmless.
 * @param {{ state: string, text: string }} probe
 * @returns {{ state: string, text: string, disabled: boolean }} */
export function disabledNotice(probe) {
  const disabled = probe.state !== 'available';
  return {
    state: probe.state,
    disabled,
    text: disabled ? `${DISABLED_NOTICE} (${probe.text})` : probe.text,
  };
}
