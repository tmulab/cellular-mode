// PURE. Grounding: the half of the safety core that decides whether a claim is ALLOWED to
// keep its label.
//
// The rule is one sentence: a model may only claim what the evidence it was handed says. So
// two mechanisms live here, and they are different in kind:
//
//   groundRefs      - a reference is kept only if it is an id of the supplied context. An
//                     invented reference is REMOVED and recorded; it is never repaired,
//                     resolved or looked up, because resolving it would mean reading
//                     something the model asked for.
//   borrowedAuthority - a statement that asserts an execution result (tests, build,
//                     typecheck, "is done") or names a file it was not shown is claiming the
//                     authority of a measurement nobody took.
//
// `plainText` is here too, because the same idea covers it: text that arrives from a model is
// text, and a control character, a zero-width space or a bidi override is a way of making a
// string look like something other than what it is.
//
// The invisible-character class is built with `new RegExp` from an ESCAPED string on purpose:
// writing those code points as literals in source is exactly how a file ends up containing
// characters a reader cannot see and a compiler refuses.

/** One statement: a sentence, not a document. */
export const MAX_STATEMENT = 600;
/** One uncertainty: a clause. */
export const MAX_UNCERTAINTY = 300;
/** How many references one recommendation may carry. */
export const MAX_REFS = 8;

/** The sentence a downgraded claim carries. Verbatim, because tests assert on it and a human
 * reads it: "the model said this, and nothing in what it was given supports it". */
export const UNSUPPORTED = 'unsupported by supplied evidence';
/** What an answer with no uncertainty of its own gets. Never an empty string: a blank field
 * reads as "no uncertainty", which is the opposite of what silence means. */
export const UNSTATED = 'not stated by the model';

/** C0 and C1 control characters: replaced by a space, never deleted, so two words cannot be
 * silently joined into one. */
export const CONTROLS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]', 'gu');

/** Zero-width marks, line and paragraph separators, and bidirectional overrides. Deleted:
 * they carry no meaning in a sentence and every one of them is a way to disguise text. */
export const INVISIBLES = new RegExp(
  '[\\u200B-\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', 'gu',
);

/** A claim about something only an EXECUTION can establish. Deliberately narrow: it matches
 * assertions ("tests pass", "the build is green"), not mentions ("the verification legs"). */
export const RESULT_CLAIM = new RegExp([
  'tests?\\s+(?:all\\s+)?(?:pass|passed|passing|are\\s+green|succeed)',
  'typecheck(?:\\s+|ed\\s+|s\\s+)(?:pass|passed|passes|is\\s+clean|clean)',
  'build\\s+(?:pass|passed|passes|succeeded|succeeds|is\\s+green|green)',
  'gates?\\s+(?:are\\s+)?green',
  '\\d+\\s+tests?\\s+(?:pass|passed|passing|green)',
  '(?:is|was)\\s+(?:now\\s+)?(?:done|complete|completed|finished|verified)',
  'ha(?:s|ve)\\s+been\\s+(?:done|completed|implemented|verified|tested)',
].join('|'), 'iu');

/** A repository-looking path inside a statement. A model naming a file it was not shown is
 * either guessing or quoting training data; either way it is not evidence. */
export const PATH_CLAIM = new RegExp(
  '(?:[\\w.-]+/)+[\\w.-]+\\.(?:mjs|cjs|js|ts|json|md|css|html|yml|yaml)', 'gu',
);

/** PURE. Model text as plain text: no controls, no invisibles, one line, capped.
 * @param {unknown} value @param {number} max @returns {string} */
export function plainText(value, max) {
  if (typeof value !== 'string') return '';
  const flattened = value
    .replace(CONTROLS, ' ')
    .replace(INVISIBLES, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (flattened.length <= max) return flattened;
  return `${flattened.slice(0, Math.max(1, max - 3))}...`;
}

/** PURE. The references that were really supplied, in order, deduplicated. Everything else is
 * removed and handed back so the caller can RECORD it.
 * @param {unknown} value @param {ReadonlyArray<string>} contextIds
 * @returns {{ kept: string[], removed: string[] }} */
export function groundRefs(value, contextIds) {
  const listed = Array.isArray(value) ? value.slice(0, MAX_REFS * 4) : [];
  /** @type {string[]} */
  const kept = [];
  /** @type {string[]} */
  const removed = [];
  for (const raw of listed) {
    const ref = plainText(raw, 140);
    if (ref === '') continue;
    if (contextIds.includes(ref)) {
      if (!kept.includes(ref) && kept.length < MAX_REFS) kept.push(ref);
    } else if (!removed.includes(ref)) {
      removed.push(ref);
    }
  }
  return { kept, removed };
}

/** PURE. Why this statement may not keep its label, or `null` when it may.
 * @param {string} statement @param {ReadonlyArray<string>} kept @param {string} contextText
 * @returns {string | null} */
export function borrowedAuthority(statement, kept, contextText) {
  // A `finding:` reference is the only thing in this architecture that carries an execution
  // verdict, because the auditor is the only thing that reads one.
  if (RESULT_CLAIM.test(statement) && !kept.some((ref) => ref.startsWith('finding:'))) {
    return 'claims an execution result that the supplied evidence does not record';
  }
  for (const path of statement.match(PATH_CLAIM) ?? []) {
    if (!contextText.includes(path)) return `names "${path}", which is not in the supplied evidence`;
  }
  return null;
}
