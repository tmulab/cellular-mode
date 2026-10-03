// mode-view.mjs — PURE. What a DECLARED mode changes about this page, and what it can never
// change. No DOM, so every rule below is testable in node.
//
// One invariant governs the whole module, written as code rather than as a promise: a `FAIL`
// and a SECURITY finding are ALWAYS SHOWN, in full, under every mode. A mode may reorder, and
// it may cap the TAIL of what is merely informative — never a verdict, never a secret, never a
// boundary breach, never a dependency finding. `tired` means "less at once", not "less is true".
//
// Three more restraints: nothing here is INFERRED (the input is a file the human caused to be
// written, and a payload this module does not recognise is read as `ready` — fail closed means
// showing MORE, not less); the mode names are LITERALS, not imported from `tools/adaptive`, so
// the Observer still builds with that module deleted and the plugin stays the one place the two
// meet; and there is no selector, so this module reads and never writes.

/** @typedef {{ enabled: boolean, mode: string, standing: string, declaredBy: string | null,
 *   source: string | null, activatedAt: string | null, expiresAt: string | null,
 *   notice: string | null }} Current */
/** @typedef {{ mark: { key: string }, rule: string, scope: string }} FindingLike */

/** The four modes. `ready` is the default and means "today's behaviour, unchanged". */
export const MODES = Object.freeze(['ready', 'tired', 'focus', 'explore']);
/** The five standings. Only `active` ever changes what this page does. */
export const STANDINGS = Object.freeze(['active', 'expired', 'invalid', 'none', 'disabled']);
/** How many merely-informative items a capping mode keeps. Small on purpose: the control that
 * reveals the rest is always present, so nothing is lost — only deferred. */
export const PRESENTATION_LIMIT = 3;
/** The audit rules that are SECURITY findings. Named, not pattern-matched: a rule added to the
 * auditor must be classified by a human, and the fail-closed direction of a mistake here is to
 * show a finding in full that did not strictly have to be. */
export const SECURITY_RULES = Object.freeze(['secrets', 'deps', 'import-boundaries']);

/** The HARD invariant: a verdict no mode may ever cap, collapse, reorder away or hide. One
 * value, and it is the one that means "evaluated and broken". */
export const MANDATORY_STATUSES = Object.freeze(['FAIL']);

/** The verdicts shown first and IN FULL. A superset of the invariant: a `WARNING` is something
 * wrong that is not a gate breach, and deferring those is not the saving a tired reader needs.
 * Widening this list is always safe; narrowing it past MANDATORY_STATUSES is not possible. */
export const ALWAYS_SHOWN_STATUSES = Object.freeze(['FAIL', 'WARNING']);
/** `ready`, no declaration: the answer for anything this build cannot read. @type {Current} */
export const NO_DECLARATION = Object.freeze({
  enabled: true,
  mode: 'ready',
  standing: 'none',
  declaredBy: null,
  source: null,
  activatedAt: null,
  expiresAt: null,
  notice: null,
});

/** PURE. The capability's answer, defensively. An unrecognised mode or standing is read as NO
 * declaration — never as a mode this page does not understand. @param {unknown} value */
export function readCurrent(value) {
  const record = /** @type {Record<string, unknown>} */ (value ?? {});
  const mode = record['mode'];
  const standing = record['standing'];
  if (typeof mode !== 'string' || !MODES.includes(mode)) return NO_DECLARATION;
  if (typeof standing !== 'string' || !STANDINGS.includes(standing)) return NO_DECLARATION;
  /** @type {(key: string) => string | null} */
  const text = (key) => (typeof record[key] === 'string' ? String(record[key]) : null);
  return {
    enabled: record['enabled'] !== false,
    mode,
    standing,
    declaredBy: text('declaredBy'),
    source: text('source'),
    activatedAt: text('activatedAt'),
    expiresAt: text('expiresAt'),
    notice: text('notice'),
  };
}

/** PURE. The mode this page presents in. Only an ACTIVE declaration of a temporary mode
 * counts; expired, invalid, absent and disabled are all `ready`. @param {Current} current */
export function presentationMode(current) {
  if (!current.enabled || current.standing !== 'active') return 'ready';
  return current.mode === 'ready' ? 'ready' : current.mode;
}

/** Minute precision, by string slicing: no clock, no locale, no timezone arithmetic in a
 * dashboard. `null` when the value is not a full ISO instant. @type {(iso: string | null) => string | null} */
const atMinute = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)
  ? iso.slice(11, 16)
  : null);

/**
 * PURE. The read-only badge. `show` is false when there is nothing a human needs to see: no
 * declaration, or the module switched off. An EXPIRED or UNREADABLE declaration DOES show,
 * because something changed with nobody doing anything and silence there is a lie.
 * @param {unknown} value @returns {{ show: boolean, mode: string, standing: string,
 *   text: string, notice: string, source: string }} */
export function modeBadge(value) {
  const current = readCurrent(value);
  const quiet = { show: false, mode: 'ready', standing: current.standing, text: '', notice: '', source: '' };
  if (!current.enabled || current.standing === 'none') return quiet;
  const source = current.source === null ? '' : `source ${current.source}`;
  if (current.standing === 'active') {
    const parts = [`mode: ${current.mode}`];
    const from = atMinute(current.activatedAt);
    const until = atMinute(current.expiresAt);
    if (from !== null) parts.push(`declared ${from}`);
    if (until !== null) parts.push(`until ${until}`);
    if (current.declaredBy === 'user') parts.push('declared by you');
    return {
      show: true, mode: current.mode, standing: 'active', text: parts.join(' · '), notice: '', source,
    };
  }
  // Expired or invalid: the page is in `ready`, and says why in the plugin's own words.
  return {
    show: true,
    mode: 'ready',
    standing: current.standing,
    text: 'mode: ready',
    notice: current.notice === null || current.notice === '' ? 'an earlier declaration no longer applies' : current.notice,
    source,
  };
}

/** PURE. A finding no mode may ever cap, hide or defer. @param {FindingLike} row */
export function isAlwaysShown(row) {
  return ALWAYS_SHOWN_STATUSES.includes(row.mark.key) || SECURITY_RULES.includes(row.rule);
}

/** PURE. The subset of the above that is the INVARIANT itself, independent of any presentation
 * choice: a `FAIL`, or a finding of a named security rule. @param {FindingLike} row */
export function isMandatory(row) {
  return MANDATORY_STATUSES.includes(row.mark.key) || SECURITY_RULES.includes(row.rule);
}

/** PURE. The order findings are shown in. Stable within each group, so a list does not reshuffle
 * between two renders of the same data. @template {FindingLike} T
 * @param {ReadonlyArray<T>} rows @param {string} mode @param {string | null} [activeCell] */
export function orderFindings(rows, mode, activeCell = null) {
  if (mode === 'tired') {
    return [...rows.filter(isAlwaysShown), ...rows.filter((row) => !isAlwaysShown(row))];
  }
  if (mode === 'focus' && activeCell !== null && activeCell !== '') {
    const scope = `cell:${activeCell}`;
    // Even here the always-shown findings come first: "the active cell first" must not push a
    // FAIL about the project below the fold.
    const first = rows.filter((row) => isAlwaysShown(row) || row.scope === scope);
    return [...first, ...rows.filter((row) => !first.includes(row))];
  }
  return [...rows];
}

/**
 * PURE. How much of a list a mode shows at once. `hidden` is never a loss: the caller renders a
 * "show all" control for exactly `hidden.length` items, and `showAll` returns everything. Only
 * `tired` caps, and only the tail of what is not always-shown.
 * @template {FindingLike} T
 * @param {ReadonlyArray<T>} rows @param {string} mode @param {boolean} [showAll]
 * @returns {{ shown: T[], hidden: T[], capped: boolean }} */
export function capFindings(rows, mode, showAll = false) {
  if (mode !== 'tired' || showAll) return { shown: [...rows], hidden: [], capped: false };
  /** @type {T[]} */
  const shown = [];
  /** @type {T[]} */
  const hidden = [];
  let optional = 0;
  for (const row of rows) {
    if (isAlwaysShown(row)) {
      shown.push(row);
      continue;
    }
    optional += 1;
    if (optional <= PRESENTATION_LIMIT) shown.push(row);
    else hidden.push(row);
  }
  return { shown, hidden, capped: hidden.length > 0 };
}

/** PURE. The advisor's list: a cap on COUNT, because a recommendation is never a verdict and
 * never a measurement, so there is nothing here that must be shown. @template T
 * @param {ReadonlyArray<T>} rows @param {string} mode @param {boolean} [showAll] */
export function capAdvice(rows, mode, showAll = false) {
  if (mode !== 'tired' || showAll || rows.length <= PRESENTATION_LIMIT) {
    return { shown: [...rows], hidden: 0 };
  }
  return { shown: rows.slice(0, PRESENTATION_LIMIT), hidden: rows.length - PRESENTATION_LIMIT };
}

/** PURE. `explore` is the one mode that asks for MORE: the advisor area opens with its
 * alternatives visible instead of waiting to be unfolded. @type {(mode: string) => boolean} */
export const advisorExpanded = (mode) => mode === 'explore';

/** PURE. The timeline's default filter: in `focus`, the active cell; otherwise the whole
 * project. A DEFAULT only — the area keeps its "show all" control.
 * @param {string} mode @param {string | null} activeCell */
export function timelineCellOf(mode, activeCell) {
  if (mode !== 'focus') return null;
  return typeof activeCell === 'string' && activeCell !== '' ? activeCell : null;
}

/** PURE. The sentence that tells a reader a mode is affecting WHAT THEY SEE, so a short list is
 * never mistaken for a short audit. @type {(mode: string, hidden: number) => string} */
export const capNotice = (mode, hidden) => (hidden === 0
  ? ''
  : `${hidden} more, not shown in ${mode} mode. Every FAIL and every security finding is shown in full.`);
