// PURE. The bounded context: the ONLY thing a model is ever shown.
//
// This module is half of the advisor's safety story (the other half is `validate.mjs`). What
// it does is choose a small, named, measured subset of the project and refuse to grow:
//
//   the ACTIVE cell's recorded fields, the cells it DECLARES as dependencies, the last N log
//   entries, the verdicts of the last audit (id, status, rule, scope — never the evidence
//   lines), and the human's question.
//
// What it therefore never contains: the rest of the vault, the repository, the full history,
// any file's text, any absolute path. A model cannot leak what it was never shown, and this
// is where "was never shown" is decided — once, in a pure function, with a byte cap measured
// in bytes and a record of everything that did not fit.
//
// Every item carries a STABLE id (`cell:<id>`, `log:<n>`, `finding:<AUD-…>`, `question`).
// Those ids are the whole vocabulary a recommendation may cite, which is what makes the
// grounding check in `validate.mjs` decidable instead of a matter of opinion.

/** @typedef {import('./types.mjs').AdvisorContext} AdvisorContext */
/** @typedef {import('./types.mjs').ContextItem} ContextItem */
/** @typedef {import('./types.mjs').AdvisorModel} AdvisorModel */
/** @typedef {import('./types.mjs').AdvisorFindings} AdvisorFindings */

/** How many recorded closures are in the window. Five is "the recent past", not "history". */
export const DEFAULT_LOG_ENTRIES = 5;
/** The byte cap. 8 KiB is a few screens of Markdown: enough for one cell, far too little for
 * a vault, which is exactly the property wanted. */
export const DEFAULT_MAX_BYTES = 8192;
/** One field of one cell, as shown. A long field is truncated with a marker, never silently. */
export const MAX_FIELD_CHARS = 300;
/** The question, as shown. The capability refuses a longer one before this is reached. */
export const MAX_QUESTION_CHARS = 500;
/** How many findings are offered to the model at most, before the byte cap even applies. */
export const MAX_FINDINGS = 60;

/** The id of the question item: there is exactly one, so it needs no ordinal. */
export const QUESTION_ID = 'question';

/** @type {(value: unknown, max?: number) => string} */
const line = (value, max = MAX_FIELD_CHARS) => {
  const text = String(value ?? '').replace(/\s+/gu, ' ').trim();
  if (text === '' || text === '—') return '';
  return text.length <= max ? text : `${text.slice(0, max)}… [truncated]`;
};

/** @type {(parts: ReadonlyArray<[string, unknown]>) => string} */
const fields = (parts) => parts
  .map(([name, value]) => [name, line(value)])
  .filter(([, value]) => value !== '')
  .map(([name, value]) => `${String(name)}=${String(value)}`)
  .join('; ');

/** @type {(entry: AdvisorModel['entries'][number]) => Record<string, unknown>} */
const cellOf = (entry) => /** @type {Record<string, unknown>} */ (entry.cell ?? {});

/** PURE. The active cell as one item, with the fields the protocol records and nothing else.
 * @param {AdvisorModel['entries'][number]} entry @returns {ContextItem} */
export function activeItem(entry) {
  const cell = cellOf(entry);
  return {
    id: `cell:${entry.id}`,
    kind: 'cell',
    text: `[cell:${entry.id}] ACTIVE CELL ${fields([
      ['name', entry.name], ['status', entry.status], ['objective', cell['objective']],
      ['boundary.in', cell['boundaryIn']], ['boundary.out', cell['boundaryOut']],
      ['inputs', cell['inputs']], ['outputs', cell['outputs']],
      ['dependencies', entry.dependencies.join(', ')], ['doneCriterion', cell['doneCriterion']],
      ['lastFact', cell['lastFact']], ['build', cell['build']],
      ['openIssues', cell['openIssues']], ['nextStep', entry.nextStep],
    ])}`,
  };
}

/** PURE. One DECLARED dependency, as the little that a dependency means here.
 * @param {AdvisorModel['entries'][number]} entry @returns {ContextItem} */
export function dependencyItem(entry) {
  return {
    id: `cell:${entry.id}`,
    kind: 'dependency',
    text: `[cell:${entry.id}] DECLARED DEPENDENCY ${fields([
      ['name', entry.name], ['status', entry.status], ['nextStep', entry.nextStep],
    ])}`,
  };
}

/** PURE. One recorded closure. `n` is the ordinal within the WINDOW, counting back from the
 * most recent, so `log:1` always means "the last thing recorded".
 * @param {Record<string, unknown>} entry @param {number} n @returns {ContextItem} */
export function logItem(entry, n) {
  return {
    id: `log:${n}`,
    kind: 'log',
    text: `[log:${n}] ${fields([
      ['at', entry['timestamp']], ['cell', entry['cell']], ['status', entry['status']],
      ['facts', entry['facts']], ['decisions', entry['decisions']],
      ['build', entry['build']], ['next', entry['next']],
    ])}`,
  };
}

/** PURE. One audit verdict: its id, its rule, its status, its scope. NOT its evidence —
 * the evidence lines are addresses into the repository and are the auditor's to publish.
 * @param {Record<string, unknown>} finding @returns {ContextItem | null} */
export function findingItem(finding) {
  const id = typeof finding['id'] === 'string' ? finding['id'] : '';
  if (!/^[A-Za-z0-9:_-]{1,120}$/.test(id)) return null;
  return {
    id: `finding:${id}`,
    kind: 'finding',
    text: `[finding:${id}] ${fields([
      ['rule', finding['rule']], ['status', finding['status']], ['scope', finding['scope']],
    ])}`,
  };
}

/**
 * PURE. The whole context, assembled in PRIORITY order and cut at the byte cap.
 *
 * Priority is the order of the list below: the question, the active cell, the audit verdicts,
 * the declared dependencies, then the log window. Truncation drops from the END of that order,
 * so what is cut is always the least specific thing, and what is cut is always NAMED.
 * @param {{ model: AdvisorModel, findings?: AdvisorFindings, question?: string,
 *   logEntries?: number, maxBytes?: number }} input
 * @returns {AdvisorContext}
 */
export function buildContext({
  model, findings = {}, question = '', logEntries = DEFAULT_LOG_ENTRIES, maxBytes = DEFAULT_MAX_BYTES,
}) {
  const entries = [...(model.entries ?? [])];
  const active = entries.find((entry) => entry.status === 'active') ?? null;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const declared = active === null
    ? []
    : active.dependencies.map((id) => byId.get(id)).filter((entry) => entry !== undefined);
  const log = [...(model.logEntries ?? [])].slice(-Math.max(0, logEntries)).reverse();
  const verdicts = [...(findings.findings ?? [])].slice(0, MAX_FINDINGS);

  /** @type {ContextItem[]} */
  const candidates = [];
  const asked = line(question, MAX_QUESTION_CHARS);
  if (asked !== '') candidates.push({ id: QUESTION_ID, kind: 'question', text: `[question] ${asked}` });
  if (active === null) {
    candidates.push({
      id: 'cell:none',
      kind: 'cell',
      text: '[cell:none] NO ACTIVE CELL is recorded in this vault, so there is no current unit of work.',
    });
  } else {
    candidates.push(activeItem(active));
  }
  for (const finding of verdicts) {
    const item = findingItem(/** @type {Record<string, unknown>} */ (finding ?? {}));
    if (item !== null) candidates.push(item);
  }
  for (const entry of declared) {
    if (entry !== undefined) candidates.push(dependencyItem(entry));
  }
  log.forEach((entry, index) => {
    candidates.push(logItem(/** @type {Record<string, unknown>} */ (entry ?? {}), index + 1));
  });

  /** @type {ContextItem[]} */
  const items = [];
  /** @type {string[]} */
  const dropped = [];
  let bytes = 0;
  for (const item of candidates) {
    const cost = Buffer.byteLength(`${item.text}\n`, 'utf8');
    // Strictly greater: the cap is a cap, and the first item is kept even if the cap is
    // absurdly small only because the capability validates the limits before getting here.
    if (items.length > 0 && bytes + cost > maxBytes) {
      dropped.push(item.id);
      continue;
    }
    items.push(item);
    bytes += cost;
  }
  const text = items.map((item) => item.text).join('\n');
  return {
    text,
    ids: [...new Set(items.map((item) => item.id))],
    items,
    // MEASURED, not accumulated: the number reported is the number of bytes in the string
    // that is actually handed over, which is the only version of it anybody can check.
    bytes: Buffer.byteLength(text, 'utf8'),
    cap: maxBytes,
    dropped,
  };
}
