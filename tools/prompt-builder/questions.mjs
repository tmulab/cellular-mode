// questions.mjs — the question bank, as DATA, plus the one function that picks the next
// question. PURE: no clock, no filesystem.
//
// Rules the bank obeys, and the reasons:
//   * one sentence, plain words, no method jargon. Somebody who has never heard of a cell
//     has to be able to answer. "What should this thing do for whoever uses it?" — not
//     "state the objective of the deliverable".
//   * a question is only in the bank if its answer CHANGES THE NEXT STEP. Discovery that
//     collects what nobody will read is the thing this module exists to avoid.
//   * a recommendation is hand-written and deterministic, and only where a reasonable
//     default exists. There is none for the objective, the users, the problem or sensitive
//     data: recommending an objective would be inventing the project, and recommending an
//     answer about personal data would be deciding someone else's risk for them.
//   * `priority` is spaced by ten so a later cell can insert a question without renumbering.
import { isAnswered, isVerified } from './fields.mjs';

/** @typedef {import('./types.mjs').AskedQuestion} AskedQuestion */
/** @typedef {import('./types.mjs').Draft} Draft */
/** @typedef {import('./types.mjs').Question} Question */

const ALL = Object.freeze(/** @type {import('./types.mjs').ProjectPath[]} */ (['new', 'existing', 'resume']));
const BUILDING = Object.freeze(/** @type {import('./types.mjs').ProjectPath[]} */ (['new', 'existing']));

/** The declared working modes this module understands. Anything else is treated as `ready`:
 * a mode is a comfort, never a gate, so an unknown one must not change an answer.
 * @type {ReadonlyArray<string>} */
export const MODES = Object.freeze(['ready', 'tired', 'focus', 'explore']);

/** @type {ReadonlyArray<Question>} */
export const QUESTIONS = Object.freeze([
  {
    id: 'objective',
    field: 'objective',
    prompt: 'In one sentence, what should this project do?',
    help: 'Say it as you would to a friend; no technical words needed.',
    paths: ALL,
    priority: 10,
  },
  {
    id: 'users',
    field: 'users',
    prompt: 'Who will use it?',
    help: 'A person, a team, another program, or only you.',
    paths: BUILDING,
    priority: 20,
  },
  {
    id: 'problem',
    field: 'problem',
    prompt: 'What goes wrong today that this is meant to fix?',
    help: 'The annoyance or the loss, not the solution.',
    paths: BUILDING,
    priority: 30,
  },
  {
    id: 'smallest-version',
    field: 'smallestVersion',
    prompt: 'What is the smallest version that would already be useful?',
    help: 'The first thing worth using, even if a lot is still missing.',
    paths: BUILDING,
    priority: 40,
    unknownRecommendation: {
      value: 'Smallest version: one complete path a single person can use once, end to end',
      assumptions: 'one path is enough to learn whether the idea works',
      tradeoffs: 'the first version will look poor next to the full idea',
    },
  },
  {
    id: 'scope-in',
    field: 'scope.in',
    prompt: 'What must be included? List one item per line.',
    help: 'Only what the first useful version needs.',
    paths: ALL,
    priority: 50,
    unknownRecommendation: {
      value: 'Scope: whatever the smallest useful version needs, decided in a first discovery cell',
      assumptions: 'the objective is clear enough to derive the first items from',
      tradeoffs: 'work cannot start until that cell has produced the list',
    },
  },
  {
    id: 'sensitive-data',
    field: 'security.sensitiveData',
    prompt: 'Will it hold information about people, money or health?',
    help: 'Names, messages, payments, medical notes, documents — anything that is not yours to leak.',
    paths: BUILDING,
    priority: 60,
  },
  {
    id: 'technologies',
    field: 'technologies.approved',
    prompt: 'Is there a language, framework or service it must use?',
    help: 'Say "I do not know" if nothing is decided — that is a normal answer.',
    paths: BUILDING,
    priority: 70,
    unknownRecommendation: {
      value: 'Decide technology in a first architecture/discovery cell',
      assumptions: 'no existing system forces a choice and nothing is in production yet',
      tradeoffs: 'the first cell produces a decision rather than a running feature',
    },
  },
  {
    id: 'involvement',
    field: 'involvement',
    prompt: 'How involved do you want to be while it is built?',
    help: 'Decide everything yourself, approve each step, or only look at the result.',
    paths: ALL,
    priority: 80,
    unknownRecommendation: {
      value: 'guided: the agent proposes, you approve each decision',
      assumptions: 'you want to stay in control without writing the proposals yourself',
      tradeoffs: 'more interruptions than handing the work over entirely',
    },
  },
  {
    id: 'environment',
    field: 'environment',
    prompt: 'Where should it run?',
    help: 'Your own machine, a server, a phone, a web page — whatever you have in mind.',
    paths: BUILDING,
    priority: 90,
    unknownRecommendation: {
      value: 'Run on the machine it is developed on until a real need moves it',
      assumptions: 'nobody outside depends on it yet',
      tradeoffs: 'deployment questions are postponed, not answered',
    },
  },
  {
    id: 'acceptance',
    field: 'acceptance',
    prompt: 'How will you know it works? List one check per line.',
    help: 'Something you could try yourself and see pass or fail.',
    paths: ALL,
    priority: 100,
    unknownRecommendation: {
      value: 'Acceptance: the smallest version runs end to end and its automated checks pass',
      assumptions: 'automated checks are acceptable evidence for the first cell',
      tradeoffs: 'nothing is said yet about what "good enough" means for a person using it',
    },
  },
]);

/** PURE. The question with this id, or `null`.
 * @param {unknown} id @returns {Question | null} */
export function questionById(id) {
  return QUESTIONS.find((q) => q.id === id) ?? null;
}

/**
 * PURE. The single highest-priority question still worth asking, or `null` when discovery
 * has nothing left to ask on this path.
 *
 * Three ways a question drops out: it was already asked, it was skipped, or the field is
 * already answered — including VERIFIED, which is how read-only inspection of an existing
 * repository removes questions nobody should have to answer twice.
 *
 * `tired` returns the question WITHOUT its help line: one short thing to read. No mode
 * changes which question comes next, only how much text comes with it.
 * @param {Draft} draft @param {string} [mode] @returns {AskedQuestion | null}
 */
export function nextQuestion(draft, mode = 'ready') {
  const { contract } = draft;
  const asked = new Set(draft.asked);
  const skipped = new Set(draft.skipped);
  const next = QUESTIONS
    .filter((q) => q.paths.includes(contract.path))
    .filter((q) => !asked.has(q.id) && !skipped.has(q.id))
    .filter((q) => !isAnswered(contract, q.field) && !isVerified(contract, q.field))
    .sort((a, b) => a.priority - b.priority)[0];
  if (next === undefined) return null;
  const concise = MODES.includes(mode) ? mode === 'tired' : false;
  return concise
    ? { id: next.id, field: next.field, prompt: next.prompt }
    : { id: next.id, field: next.field, prompt: next.prompt, help: next.help };
}
