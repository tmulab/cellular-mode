// The ONLY adapter that ships: deterministic, local, offline, and honest about being a test
// double.
//
// It answers canned JSON chosen by a SHA-256 of the question and the context ids, so the same
// project and the same question always produce the same advice — which is what makes the
// whole feature testable, reviewable and safe to put in a smoke test. It is not a model and
// does not pretend to be one: `describe()` says `kind: 'fixture'`, `network: false`, and the
// UI prints that beside every answer.
//
// What is NOT here, deliberately:
//   a `local` adapter — PENDING. A small local model (an SLM through a local runtime) is the
//     intended next step; it needs a weight file, a licence review and a decision about where
//     weights live, none of which belongs in this cell.
//   a `remote` adapter — PROPOSED, and refused by `createRegistry` unless a human sets
//     `allowNetwork`. No provider SDK, no endpoint and no token appears anywhere in this repo.
//
// The references it cites are read back out of the context it was given, which is the point:
// an adapter can only ground a claim in what it was actually shown.
import { createHash } from 'node:crypto';
import { REC_KINDS } from './model.mjs';

/** The id the composition resolves. The launcher's `--advisor fixture` names exactly this. */
export const FIXTURE_ID = 'fixture';

/** What the UI prints beside every answer. */
export const FIXTURE_DESCRIPTION = 'deterministic test adapter — canned answers keyed by a hash of'
  + ' the question and the context ids. No model, no weights, no network, no randomness.';

/** PURE. The ids the context declares, read back from the `[id] …` line prefixes. An adapter
 * that invented one would simply have it removed by the grounding check.
 * @param {string} context @returns {string[]} */
export function contextIdsOf(context) {
  return [...String(context ?? '').matchAll(/^\[([^\]\n]{1,120})\]/gmu)].map((match) => String(match[1]));
}

/** PURE. The deterministic key of one request.
 * @param {{ question: string, ids: ReadonlyArray<string> }} input @returns {string} */
export function fixtureKey({ question, ids }) {
  return createHash('sha256').update(`${question}\u0000${ids.join(',')}`, 'utf8').digest('hex');
}

/** @typedef {{ kind: string, label: string, statement: string, evidenceRefs: string[], uncertainty: string }} Canned */

/** The three canned shapes. Each is a function of the references actually available, so a
 * vault with no audit and no log still gets an answer that cites something real.
 * @type {ReadonlyArray<(refs: { cell: string[], finding: string[], log: string[] }) => Canned[]>} */
export const TEMPLATES = Object.freeze([
  (refs) => [
    {
      kind: 'next-action',
      label: 'INFERRED',
      statement: 'The next step recorded on the active cell is the smallest thing that can be'
        + ' finished; treating it as the only next action is what keeps this cell bounded.',
      evidenceRefs: refs.cell.slice(0, 1),
      uncertainty: 'read from the cell record alone; the order of work is the human\'s decision.',
    },
    {
      kind: 'verification',
      label: 'PROPOSED',
      statement: 'Ask for the three verification legs with their real counts before treating any'
        + ' part of this cell as finished. This adapter measured nothing.',
      evidenceRefs: refs.finding.slice(0, 1),
      uncertainty: 'no execution evidence was supplied to this adapter.',
    },
  ],
  (refs) => [
    {
      kind: 'contract-review',
      label: 'INFERRED',
      statement: 'Re-reading the boundary and the done criterion before the next change is'
        + ' cheaper than discovering a scope drift after it.',
      evidenceRefs: refs.cell.slice(0, 1),
      uncertainty: 'the cell record may be out of date with the work in progress.',
    },
    {
      kind: 'split-cell',
      label: 'PROPOSED',
      statement: 'If the next step spans more than one group of files, closing this cell and'
        + ' opening a narrower one costs less than a cell that grows.',
      evidenceRefs: refs.cell.slice(0, 1),
      uncertainty: 'nothing here measures the size of the remaining work.',
    },
  ],
  (refs) => [
    {
      kind: 'dependency',
      label: 'INFERRED',
      statement: 'Only DECLARED dependencies appear in this context, so an edge nobody declared'
        + ' is invisible here — including one that matters.',
      evidenceRefs: refs.cell.slice(0, 1),
      uncertainty: 'absence of an edge is not evidence that there is none.',
    },
    {
      kind: 'pause-or-handoff',
      label: 'INFERRED',
      statement: 'Recording the last fact and the next step before stopping is what makes the'
        + ' next session cheap; the recent closures are the only state a resume reads.',
      evidenceRefs: refs.log.slice(0, 1),
      uncertainty: 'the log window shown here is the recent past, not the history.',
    },
  ],
]);

/** PURE. The canned answer for one request, as the text an adapter returns.
 * @param {{ question?: string, context?: string, maxOutputChars?: number }} request
 * @returns {string} */
export function fixtureAnswer({ question = '', context = '', maxOutputChars = 4000 }) {
  const ids = contextIdsOf(context);
  const refs = {
    cell: ids.filter((id) => id.startsWith('cell:')),
    finding: ids.filter((id) => id.startsWith('finding:')),
    log: ids.filter((id) => id.startsWith('log:')),
  };
  const key = fixtureKey({ question, ids });
  const template = TEMPLATES[Number.parseInt(key.slice(0, 2), 16) % TEMPLATES.length];
  /** @type {Canned[]} */
  const recommendations = (template ?? TEMPLATES[0] ?? (() => []))(refs)
    .filter((rec) => REC_KINDS.includes(/** @type {never} */ (rec.kind)));
  // A question is answered by SAYING it was read, never by pretending to know the answer: the
  // honest canned reply is one that points at what a human would have to look at.
  if (question.trim() !== '') {
    recommendations.push({
      kind: 'investigation',
      label: 'UNKNOWN',
      statement: `The question was read and is not settled by the evidence supplied here`
        + `${refs.finding.length > 0 ? '; the audit verdicts in this context are the nearest measured thing' : ''}.`,
      evidenceRefs: refs.finding.slice(0, 1),
      uncertainty: 'a fixture adapter cannot answer a question; it can only say what was supplied.',
    });
  }
  while (recommendations.length > 1
    && JSON.stringify({ recommendations }).length > maxOutputChars) {
    recommendations.pop();
  }
  return JSON.stringify({ recommendations });
}

/** The adapter the composition offers under the id `fixture`.
 * @type {import('./types.mjs').ModelAdapter} */
export const fixtureAdapter = Object.freeze({
  id: FIXTURE_ID,
  describe: () => ({
    id: FIXTURE_ID, kind: /** @type {const} */ ('fixture'), network: false, description: FIXTURE_DESCRIPTION,
  }),
  /** @param {import('./types.mjs').CompleteRequest} request */
  complete: async (request) => {
    // The deadline is the plugin's, and an adapter that ignored it would be the one place a
    // hang could come from. There is no I/O here, so honouring it is one line.
    if (request.signal?.aborted === true) throw new Error('the advisor call was cancelled');
    return { text: fixtureAnswer(request) };
  },
});
