// answers.mjs — one answer applied to a draft. PURE: no clock, no filesystem, and the
// draft it is given is never mutated.
//
// Three behaviours carry the whole module, and each is a rule of the method rather than a
// convenience:
//   * ordinary text becomes DECLARED. The human said it; nothing else is added.
//   * "I do not know" becomes UNKNOWN — never a guess dressed as an answer. Where the
//     question bank holds a deterministic recommendation, it is recorded as PROPOSED with
//     its assumptions and trade-offs, and PROPOSED is not an answer: only a recorded human
//     decision can promote it (see types.mjs for where the proposal is stored).
//   * an answer that looks like a credential, or like a path on one particular machine, is
//     REFUSED with a typed error. Refusing at the moment of typing is the only cheap moment;
//     afterwards the value is in a file, in a prompt, and possibly in version control.
import { entry, sanitizeValue } from './contract-shape.mjs';
import { BuilderError, CODES } from './errors.mjs';
import { appendField, isListField, setField } from './fields.mjs';
import { questionById } from './questions.mjs';
import { findPersonalPaths, findSensitive } from './sensitive.mjs';

/** @typedef {import('./types.mjs').Draft} Draft */
/** @typedef {import('./types.mjs').Entry} Entry */
/** @typedef {import('./types.mjs').Question} Question */

/** The answers that mean "no answer", written out instead of guessed at by a regular
 * expression. Normalised form: lower case, no diacritics, no apostrophes.
 * @type {ReadonlyArray<string>} */
export const UNKNOWN_PHRASES = Object.freeze([
  'i dont know', 'i do not know', 'dont know', 'do not know', 'idk',
  'not sure', 'im not sure', 'no idea', 'nao sei', 'no clue',
]);

/** The answers that mean "there is nothing to record here", accepted ONLY by a question the
 * bank marks `acceptsNone` — today the exclusions question. "No" to "will it hold information
 * about people?" is a statement about the project and stays DECLARED, so this list is never
 * applied to a question that did not declare it accepts one.
 * @type {ReadonlyArray<string>} */
export const NONE_PHRASES = Object.freeze([
  'none', 'nothing', 'no', 'no exclusions', 'nothing comes to mind',
  'nada', 'nenhum', 'nenhuma', 'nao', 'none for now',
]);

/** Words that may trail an "I do not know" without changing it into an answer. */
const FILLERS = Object.freeze(['yet', 'ainda', 'really', 'honestly', 'sorry', 'at all', 'right now']);

/** @type {(text: unknown) => string} */
const normalize = (text) => String(text ?? '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .replace(/['’]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** PURE. Does this answer mean "I have no answer"? An answer that merely CONTAINS the phrase
 * but also says something ("I do not know, maybe Python") is a statement and stays DECLARED.
 * @param {unknown} text @returns {boolean} */
export function isUnknownAnswer(text) {
  let current = normalize(text);
  for (;;) {
    if (UNKNOWN_PHRASES.includes(current)) return true;
    const shorter = FILLERS.reduce(
      (/** @type {string} */ acc, /** @type {string} */ filler) => (acc.endsWith(` ${filler}`) ? acc.slice(0, -(filler.length + 1)) : acc),
      current,
    );
    if (shorter === current) return false;
    current = shorter;
  }
}

/** PURE. Does this answer mean "there is nothing of this kind"? Only asked of a question that
 * accepts one. @param {unknown} text @returns {boolean} */
export function isNoneAnswer(text) {
  return NONE_PHRASES.includes(normalize(text));
}

/** PURE. A list answer, one item per line or per semicolon, list markers removed.
 * @param {string} text @returns {string[]} */
export function splitList(text) {
  return text
    .split(/[\n;]/)
    .map((part) => part.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((part) => part !== '');
}

/** PURE. Where a recommendation for `field` belongs: a technology nobody approved goes to
 * the `proposed` list, never to `approved`. Every other list field holds its own proposals.
 * @param {string} field @returns {string} */
export function proposalField(field) {
  return field.endsWith('.approved') ? `${field.slice(0, -'.approved'.length)}.proposed` : field;
}

/** Throws rather than records. The message names the SHAPE that was found and never echoes
 * the text, so a refusal cannot leak what it refused into a log.
 * @param {string} text @returns {void} */
function refuseUnrecordable(text) {
  const secret = findSensitive(text)[0];
  if (secret !== undefined) {
    throw new BuilderError(
      CODES.SECRET_LIKE,
      `that answer looks like ${secret.why} — never record credentials here; say what it is for instead`,
    );
  }
  const personal = findPersonalPaths(text)[0];
  if (personal !== undefined) {
    throw new BuilderError(
      CODES.ABSOLUTE_PATH,
      `that answer contains ${personal.why} — use a path relative to the project, such as src/app`,
    );
  }
}

/** @param {Draft} base @param {Question} question @returns {{ draft: Draft, notes: string[] }} */
function applyUnknown(base, question) {
  const { field } = question;
  const list = isListField(base.contract, field);
  /** @type {string[]} */
  const notes = [`${field} stays UNKNOWN — nothing was invented`];
  let contract = list
    ? base.contract
    : setField(base.contract, field, entry('', 'UNKNOWN', `answered "I do not know" at question ${question.id}`));
  let proposals = base.proposals;
  const recommendation = question.unknownRecommendation;
  if (recommendation !== undefined) {
    const proposed = entry(recommendation.value, 'PROPOSED', `recommendation:${question.id}`
      + ` — assumes ${recommendation.assumptions}; trade-off: ${recommendation.tradeoffs}`);
    const target = proposalField(field);
    if (list) contract = appendField(contract, target, [proposed]);
    else proposals = [...proposals, { questionId: question.id, field, entry: proposed }];
    notes.push(
      `a PROPOSED option was recorded for ${target} — nothing is approved`,
      `  PROPOSED: ${recommendation.value}`,
      `  assumes ${recommendation.assumptions}; trade-off: ${recommendation.tradeoffs}`,
      `  accept it with: decide accept-proposal ${question.id} --confirm`,
    );
  }
  return { draft: { ...base, contract, proposals }, notes };
}

/**
 * PURE. Applies one answer and returns a NEW draft plus notes written for the human.
 * Throws `BuilderError` with code `SECRET_LIKE`, `ABSOLUTE_PATH`, `UNKNOWN_QUESTION` or
 * `BAD_ENTRY`; nothing is recorded when it throws.
 * @param {Draft} draft @param {unknown} questionId @param {unknown} text
 * @returns {{ draft: Draft, notes: string[] }}
 */
export function applyAnswer(draft, questionId, text) {
  const question = questionById(questionId);
  if (question === null) {
    throw new BuilderError(CODES.UNKNOWN_QUESTION, `no such question: ${String(questionId)}`);
  }
  const clean = sanitizeValue(text).trim();
  refuseUnrecordable(clean);
  if (clean === '') {
    throw new BuilderError(CODES.BAD_ENTRY, 'an empty answer records nothing — answer it, skip it, or say you do not know');
  }
  const asked = draft.asked.includes(question.id) ? draft.asked : [...draft.asked, question.id];
  /** @type {Draft} */
  const base = { ...draft, asked };
  if (isUnknownAnswer(clean)) return applyUnknown(base, question);
  if (question.acceptsNone === true && isNoneAnswer(clean)) {
    return {
      draft: base,
      notes: [`${question.field}: you declared there is nothing to record — the question is`
        + ' answered and the field stays empty; nothing was invented'],
    };
  }
  const { field } = question;
  if (isListField(base.contract, field)) {
    const items = splitList(clean);
    if (items.length === 0) {
      throw new BuilderError(CODES.BAD_ENTRY, `${field} needs at least one item, one per line`);
    }
    const contract = appendField(base.contract, field, items.map((value) => entry(value, 'DECLARED')));
    return { draft: { ...base, contract }, notes: [`recorded ${items.length} item(s) under ${field} as DECLARED`] };
  }
  const contract = setField(base.contract, field, entry(clean, 'DECLARED'));
  return { draft: { ...base, contract }, notes: [`recorded ${field} as DECLARED`] };
}

/** PURE. Records that a question was passed over. A skipped question is not asked again, and
 * the field keeps whatever it already says — usually UNKNOWN, which is the honest answer.
 * @param {Draft} draft @param {unknown} questionId @returns {Draft} */
export function skipQuestion(draft, questionId) {
  const question = questionById(questionId);
  if (question === null) {
    throw new BuilderError(CODES.UNKNOWN_QUESTION, `no such question: ${String(questionId)}`);
  }
  if (draft.skipped.includes(question.id)) return draft;
  return { ...draft, skipped: [...draft.skipped, question.id] };
}
