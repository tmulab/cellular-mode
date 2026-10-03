// PURE. The five verdicts, the finding factory, the id rule and the summary.
//
// One sentence governs this module: UNAVAILABLE IS NOT A KIND OF PASS. It gets its own
// counter, its own id prefix and its own rendering, and `summarise` can never fold it into
// the green number — because the summary is a `Record<Status, number>` built from the
// declared list, not a pair of "ok" and "problems" buckets that somebody has to remember
// to keep apart.

/** @typedef {import('./types.mjs').Draft} Draft */
/** @typedef {import('./types.mjs').Finding} Finding */
/** @typedef {import('./types.mjs').Status} Status */
/** @typedef {import('./types.mjs').Summary} Summary */

/** The closed set, in reporting order: what is broken first, what was not measured last. */
export const STATUSES = Object.freeze(
  /** @type {ReadonlyArray<Status>} */ (['FAIL', 'WARNING', 'UNAVAILABLE', 'NOT_APPLICABLE', 'PASS']),
);

/** The scope of a finding about the project as a whole. */
export const PROJECT = 'project';

/** `cell:<id>` — the only other scope shape the contract admits.
 * @type {(id: string) => string} */
export const cellScope = (id) => `cell:${id}`;

/** PURE. @param {unknown} value @returns {value is Status} */
export const isStatus = (value) => typeof value === 'string'
  && STATUSES.includes(/** @type {Status} */ (value));

/**
 * PURE. One draft finding. `evidence` is normalised to strings so no object, and therefore
 * no absolute path and no raw file text, can slip into a report through a lazy caller.
 * @param {{ rule: string, status: Status, explanation: string, scope?: string,
 *   evidence?: ReadonlyArray<unknown>, action?: string }} input @returns {Draft}
 */
export function draft({ rule, status, explanation, scope = PROJECT, evidence = [], action }) {
  return {
    scope,
    rule,
    status,
    evidence: evidence.map((item) => String(item)),
    explanation,
    ...(action === undefined ? {} : { action }),
  };
}

/** The sort key of a finding: its address. Two findings of one rule are ordered by it, so
 * the numbering below depends on the inputs and never on the order the checks happened to
 * run in. @type {(d: Draft) => string} */
const keyOf = (d) => `${d.scope}\u0000${d.evidence.join('\u0000')}\u0000${d.explanation}`;

/** `cell-contract` -> `CELL-CONTRACT`. @type {(rule: string) => string} */
const token = (rule) => rule.toUpperCase();

/**
 * PURE. Closes every draft with a deterministic id, `AUD-<RULE>-<nnn>`.
 *
 * DETERMINISM, precisely: findings are grouped by rule in the order the rules first appear,
 * each group is sorted by the address key above, and the ordinal follows that sort. The
 * same inputs therefore always produce the same ids — and because the key is built from the
 * evidence, a finding's address is always printed beside its id, so an id that shifts when
 * a neighbour appears never loses the thing it pointed at.
 * @param {ReadonlyArray<Draft>} drafts @returns {Finding[]}
 */
export function assignIds(drafts) {
  /** @type {Map<string, Draft[]>} */
  const groups = new Map();
  for (const item of drafts) {
    const bucket = groups.get(item.rule);
    if (bucket === undefined) groups.set(item.rule, [item]);
    else bucket.push(item);
  }
  /** @type {Finding[]} */
  const out = [];
  for (const [rule, bucket] of groups) {
    const sorted = [...bucket].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
    sorted.forEach((item, index) => {
      out.push({ id: `AUD-${token(rule)}-${String(index + 1).padStart(3, '0')}`, ...item });
    });
  }
  return out;
}

/** PURE. One count per status, every status present. A status with no findings is `0`,
 * never missing: a reader must be able to see that nothing was UNAVAILABLE.
 * @param {ReadonlyArray<Finding>} findings @returns {Summary} */
export function summarise(findings) {
  /** @type {Summary} */
  const summary = { PASS: 0, FAIL: 0, WARNING: 0, UNAVAILABLE: 0, NOT_APPLICABLE: 0 };
  for (const finding of findings) {
    if (isStatus(finding.status)) summary[finding.status] += 1;
  }
  return summary;
}

/** PURE. The filter `findings` applies. An absent criterion matches everything; a `scope`
 * matches exactly, so `cell:a` never also selects `cell:ab`.
 * @param {ReadonlyArray<Finding>} findings
 * @param {{ status?: string, scope?: string }} [criteria] @returns {Finding[]} */
export function filterFindings(findings, { status, scope } = {}) {
  return findings.filter((finding) => (status === undefined || finding.status === status)
    && (scope === undefined || finding.scope === scope));
}
