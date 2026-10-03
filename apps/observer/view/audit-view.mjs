// audit-view.mjs — PURE. Turns an `observer.audit` payload into the rows and labels the DOM
// module renders. No DOM here, so every rule below is testable in node.
//
// One decision carries this module, and it is the same one the backend is built on:
// UNAVAILABLE IS NOT A KIND OF PASS. So it gets its own word, its own symbol, its own tone
// and its own tile — and a status this build does not recognise falls back to UNAVAILABLE's
// treatment, never to PASS. Rendering an unmeasured leg as a green tick is the failure the
// whole feature exists to prevent, and the last place it could happen is here.
import { field } from './view-model.mjs';

/** @typedef {import('./view-model.mjs').Field} Field */
/** @typedef {{ key: string, label: string, symbol: string, tone: string, meaning: string }} Mark */

/** The five verdicts, in reporting order: what is broken first, what was not measured next,
 * what holds last. A reader scanning from the top meets the actionable things first. */
export const AUDIT_STATUSES = Object.freeze(['FAIL', 'WARNING', 'UNAVAILABLE', 'NOT_APPLICABLE', 'PASS']);

/** Each verdict as a WORD and a SHAPE before it is a colour: colour alone fails for a
 * colour-blind reader, in high contrast mode and on a printed page.
 * @type {Readonly<Record<string, Mark>>} */
export const STATUS_MARKS = Object.freeze({
  FAIL: {
    key: 'FAIL', label: 'FAIL', symbol: '[x]', tone: 'fail',
    meaning: 'the rule was evaluated and is broken',
  },
  WARNING: {
    key: 'WARNING', label: 'WARNING', symbol: '[!]', tone: 'warning',
    meaning: 'something is wrong that is not a gate breach',
  },
  UNAVAILABLE: {
    key: 'UNAVAILABLE', label: 'UNAVAILABLE', symbol: '[?]', tone: 'unavailable',
    meaning: 'NOT measured — this is not a pass',
  },
  NOT_APPLICABLE: {
    key: 'NOT_APPLICABLE', label: 'NOT APPLICABLE', symbol: '[–]', tone: 'na',
    meaning: 'the rule has nothing to judge here',
  },
  PASS: {
    key: 'PASS', label: 'PASS', symbol: '[+]', tone: 'pass',
    meaning: 'the rule was evaluated and holds',
  },
});

/** A verdict this build does not know about. Reported as unknown and treated as UNAVAILABLE,
 * because the one thing it must never be treated as is a pass. @type {Mark} */
export const UNKNOWN_MARK = Object.freeze({
  key: 'UNKNOWN', label: 'UNKNOWN STATUS', symbol: '[?]', tone: 'unavailable',
  meaning: 'a verdict this build does not recognise; it is not a pass',
});

/** PURE. @param {unknown} status @returns {Mark} */
export function statusMark(status) {
  const key = typeof status === 'string' ? status : '';
  return STATUS_MARKS[key] ?? UNKNOWN_MARK;
}

/** PURE. One tile per status, every status present — a reader must be able to see that
 * nothing was UNAVAILABLE, which an omitted tile would hide.
 * @param {unknown} summary
 * @returns {Array<{ key: string, label: string, value: number, symbol: string, tone: string,
 *   meaning: string, emphasis: 'strong' | 'quiet' }>} */
export function summaryTiles(summary) {
  const source = /** @type {Record<string, unknown>} */ (summary ?? {});
  return AUDIT_STATUSES.map((key) => {
    const raw = source[key];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    const mark = statusMark(key);
    // Weight follows ACTION: a non-zero FAIL, WARNING or UNAVAILABLE asks something of you
    // now. A row of green passes is reassurance, and reassurance is quiet.
    const strong = value > 0 && key !== 'PASS' && key !== 'NOT_APPLICABLE';
    return {
      key,
      label: mark.label,
      value,
      symbol: mark.symbol,
      tone: mark.tone,
      meaning: mark.meaning,
      emphasis: strong ? 'strong' : 'quiet',
    };
  });
}

/** The columns of the findings table, in reading order.
 * @type {ReadonlyArray<readonly [string, string]>} */
export const FINDING_COLUMNS = Object.freeze([
  /** @type {readonly [string, string]} */ (['status', 'status']),
  /** @type {readonly [string, string]} */ (['rule', 'rule']),
  /** @type {readonly [string, string]} */ (['scope', 'scope']),
  /** @type {readonly [string, string]} */ (['id', 'id']),
]);

/** PURE. One row per finding, nothing dropped and nothing summarised away.
 * @param {unknown} findings
 * @returns {Array<{ id: string, rule: string, scope: string, mark: Mark, evidence: string[],
 *   explanation: Field, action: Field, hasAction: boolean }>} */
export function findingRows(findings) {
  const list = Array.isArray(findings) ? findings : [];
  return list.map((entry) => {
    const record = /** @type {Record<string, unknown>} */ (entry ?? {});
    const action = field(record['action']);
    return {
      id: typeof record['id'] === 'string' ? record['id'] : '',
      rule: typeof record['rule'] === 'string' ? record['rule'] : '',
      scope: typeof record['scope'] === 'string' ? record['scope'] : '',
      mark: statusMark(record['status']),
      evidence: Array.isArray(record['evidence']) ? record['evidence'].map((line) => String(line)) : [],
      explanation: field(record['explanation']),
      action,
      // A PASS has nothing to suggest, and an empty suggestion box would imply it does.
      hasAction: action.recorded,
    };
  });
}

/** PURE. The scopes present in a result, for the filter. `project` first when it is there,
 * then the cells in order: a list that reshuffles when a finding appears is a list nobody
 * can use twice.
 * @param {ReadonlyArray<{ scope: string }>} rows @returns {string[]} */
export function scopeOptions(rows) {
  const scopes = [...new Set(rows.map((row) => row.scope).filter((scope) => scope !== ''))].sort();
  return scopes.includes('project') ? ['project', ...scopes.filter((s) => s !== 'project')] : scopes;
}

/** PURE. The client-side filter. An empty criterion means "every", and a criterion matches
 * EXACTLY, so `cell:a` never also selects `cell:ab`.
 * @template {{ mark: Mark, scope: string }} T
 * @param {ReadonlyArray<T>} rows @param {{ status?: string, scope?: string }} [criteria]
 * @returns {T[]} */
export function filterRows(rows, { status = '', scope = '' } = {}) {
  return rows.filter((row) => (status === '' || row.mark.key === status)
    && (scope === '' || row.scope === scope));
}

/** PURE. The sentence above the table. It never says "no findings" without saying whether an
 * audit ran: those are different states of the world, and one of them is reassuring.
 * @param {unknown} value @returns {{ text: string, ran: boolean }} */
export function auditHeadline(value) {
  const record = /** @type {Record<string, unknown>} */ (value ?? {});
  const ran = record['ran'] !== false;
  const at = field(record['at']);
  const findings = Array.isArray(record['findings']) ? record['findings'].length : 0;
  if (!ran) {
    return { ran: false, text: 'no audit has run in this session — nothing has been measured yet.', };
  }
  const when = at.recorded ? ` at ${at.text}` : '';
  return { ran: true, text: `${findings} finding(s), audited${when}.` };
}
