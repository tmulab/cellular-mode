// commands.mjs — the discovery half of the Builder's CLI: start, status, next, answer, skip.
// Approval, the first cell and the export live in commands-approve.mjs, so each file stays a
// hand-written file under 200 lines.
//
// EVERY COMMAND IS A THIN SHELL. It reads options, calls ONE pure module, and writes at most
// one document through store.mjs. No command re-derives a blocker list, re-implements a
// question or decides what a refusal means: those answers come from readiness.mjs,
// questions.mjs and answers.mjs, and a second opinion here is how a CLI and a library drift.
//
// `start` IS THE ONE COMMAND THAT CAN REFUSE BECAUSE SOMETHING ALREADY EXISTS, and it does so
// with nothing written: `startSession` routes, and the two refusing routes (a recorded cell →
// `/cell`, an open draft → an explicit replace) exit 3 before any write is attempted.
import { assertAllowed, assertNoPositional } from '../cellmode/args.mjs';
import { applyAnswer, skipQuestion } from './answers.mjs';
import { isApproved } from './approve.mjs';
import {
  EXIT, flag, labelCounts, requireDraft, resolveMode, withName,
} from './cli-shared.mjs';
import { conflicts } from './conflicts.mjs';
import { BuilderError, CODES } from './errors.mjs';
import { inspectProject } from './inspect.mjs';
import { proposalLines, recordedProposals } from './proposals.mjs';
import { nextQuestion } from './questions.mjs';
import { readiness } from './readiness.mjs';
import { startSession } from './session.mjs';
import {
  BUILDER_REL, CONTRACT_REL, DRAFT_FILE, listProjectFiles, readCellState, readDraft, writeDraft,
} from './store.mjs';

/** @typedef {import('./cli-shared.mjs').BuilderCommandResult} BuilderCommandResult */
/** @typedef {import('../cellmode/types.mjs').ParsedArgs} ParsedArgs */

export const DRAFT_REL = `${BUILDER_REL}/${DRAFT_FILE}`;

/** PURE. The next question as the human reads it. `tired` drops the help and the usage hint:
 * one short thing on the screen, which is the whole of what the mode changes here.
 * @param {import('./types.mjs').AskedQuestion | null} question @param {string} mode
 * @returns {string[]} */
export function questionLines(question, mode) {
  if (question === null) {
    return ['No question left on this path — run `status`, then `approve` when you are ready.'];
  }
  const lines = [`[${question.id}] ${question.prompt}`];
  if (mode === 'tired') return lines;
  if (question.help !== undefined) lines.push(`  ${question.help}`);
  lines.push(`  Answer: answer ${question.id} "<your words>" · or: skip ${question.id}`
    + ' · "I do not know" is a valid answer');
  return lines;
}

/** @type {(title: string, items: ReadonlyArray<string>) => string[]} */
function section(title, items) {
  return [`${title} (${items.length}):`, ...items.map((item) => `  - ${item}`)];
}

/** @type {(contract: unknown) => Array<Record<string, unknown>>} */
const pendingDecisions = (contract) => {
  const list = /** @type {Record<string, unknown>} */ (contract).decisions;
  return (Array.isArray(list) ? list : []).filter((item) => item?.status === 'pending');
};

/** @param {string} root @param {ParsedArgs} args @returns {BuilderCommandResult} */
export function cmdStart(root, { positional, options }) {
  assertAllowed(options, ['root', 'mode', 'name', 'replace-draft', 'confirm'], 'start');
  const path = positional[0];
  if (positional.length !== 1 || (path !== 'new' && path !== 'existing' && path !== 'resume')) {
    throw new BuilderError(CODES.BAD_ENTRY, 'start takes exactly one path: new, existing or resume');
  }
  if (path === 'resume' && options.name !== undefined) {
    throw new BuilderError(CODES.BAD_ENTRY, '`--name` names a project at the start — resume continues the one already recorded');
  }
  const mode = resolveMode(options);
  const open = readDraft(root);
  const replacing = path !== 'resume' && flag(options, 'replace-draft') && flag(options, 'confirm');
  const inspection = path === 'existing' ? inspectProject(listProjectFiles(root)) : undefined;
  /** @type {{ inspection?: import('./types.mjs').Inspection,
   *   cellState?: import('./types.mjs').CellState, existingDraft?: import('./types.mjs').Draft }} */
  const context = { cellState: readCellState(root) };
  if (inspection !== undefined) context.inspection = inspection;
  if (open !== null && !replacing) context.existingDraft = open;
  const result = startSession(path, context);
  const lines = [result.message];
  if (result.action === 'defer-to-cell' || result.action === 'confirm-needed') {
    lines.push(result.action === 'defer-to-cell'
      ? 'Nothing was written. Resume it yourself: node tools/cellmode/cli.mjs resume <name> (or /cell)'
      : 'Nothing was written. To replace the draft: start <path> --replace-draft --confirm;'
        + ' a recorded cell is resumed with /cell instead');
    return { lines, code: EXIT.REFUSED };
  }
  const draft = result.draft;
  if (draft === undefined) return { lines };
  const named = options.name === undefined
    ? draft
    : { ...draft, contract: withName(draft.contract, options.name) };
  if (path !== 'resume') {
    writeDraft(root, named);
    lines.push(`Draft: ${DRAFT_REL} (private, git-ignored)`);
  }
  if (inspection !== undefined) {
    const { manifests, languages, instructionFiles } = inspection.summary;
    lines.push(`Read only: manifests ${manifests.join(', ') || 'none'} · languages `
      + `${languages.join(', ') || 'none counted'} · agent instructions `
      + `${instructionFiles.join(', ') || 'none'}`);
  }
  lines.push(...questionLines(nextQuestion(named, mode), mode));
  return { lines };
}

/** @param {string} root @param {ParsedArgs} args @returns {BuilderCommandResult} */
export function cmdStatus(root, { positional, options }) {
  assertAllowed(options, ['root', 'mode'], 'status');
  assertNoPositional(positional, 'status');
  const mode = resolveMode(options);
  const draft = requireDraft(root);
  const { contract } = draft;
  const state = readiness(contract);
  const found = conflicts(contract);
  const pending = pendingDecisions(contract);
  const proposals = recordedProposals(draft);
  // The PROPOSED TEXT, in both modes. A mode may shorten a question; it may not shorten what a
  // human is being asked to approve, so this report reads the same tired as ready (H5).
  const suggested = [`Proposed, not approved (${proposals.length}):`, ...proposalLines(draft)];
  const question = nextQuestion(draft, mode);
  const head = `Draft: ${DRAFT_REL} · path ${contract.path} · asked ${draft.asked.length}`
    + ` · skipped ${draft.skipped.length}`;
  const known = `Known: ${labelCounts(contract)}`;
  const next = question === null
    ? 'Next: nothing left to ask — approve when you are ready'
    : `Next: [${question.id}] ${question.prompt}`;
  if (mode === 'tired') {
    return {
      lines: [head, known, `Blockers ${state.blockers.length} · conflicts ${found.length}`
        + ` · pending decisions ${pending.length}`, ...suggested, next],
    };
  }
  return {
    lines: [
      head,
      known,
      `Contract: ${CONTRACT_REL} — ${isApproved(contract) ? 'approved' : 'not approved yet'}`,
      ...section('Blockers', state.blockers.map((b) => `${b.field}: ${b.reason}`)),
      ...section('Conflicts', found.map((c) => `[${c.severity}] ${c.message}`)),
      ...suggested,
      ...section('Pending decisions', pending.map((d) => `${String(d.id)} — ${String(d.question)}`
        + ` (proposed: ${String(d.proposal)})`)),
      next,
    ],
  };
}

/** @param {string} root @param {ParsedArgs} args @returns {BuilderCommandResult} */
export function cmdNext(root, { positional, options }) {
  assertAllowed(options, ['root', 'mode'], 'next');
  assertNoPositional(positional, 'next');
  const mode = resolveMode(options);
  const draft = requireDraft(root);
  const question = nextQuestion(draft, mode);
  // Nothing left to ask is the one place `next` reports FIELDS rather than a question — and a
  // recorded PROPOSED recommendation is a field still waiting for a human verdict, so its text
  // goes with it instead of a count nobody can act on.
  const waiting = question === null ? proposalLines(draft) : [];
  return { lines: [...questionLines(question, mode), ...waiting] };
}

/** @param {string} root @param {ParsedArgs} args @returns {BuilderCommandResult} */
export function cmdAnswer(root, { positional, options }) {
  assertAllowed(options, ['root', 'mode'], 'answer');
  const id = positional[0];
  const text = positional.slice(1).join(' ');
  if (id === undefined || text.trim() === '') {
    throw new BuilderError(CODES.BAD_ENTRY, 'answer <questionId> <your answer…> — list answers'
      + ' separate items with ";"');
  }
  const mode = resolveMode(options);
  const { draft, notes } = applyAnswer(requireDraft(root), id, text);
  writeDraft(root, draft);
  return { lines: [...notes, ...questionLines(nextQuestion(draft, mode), mode)] };
}

/** @param {string} root @param {ParsedArgs} args @returns {BuilderCommandResult} */
export function cmdSkip(root, { positional, options }) {
  assertAllowed(options, ['root', 'mode'], 'skip');
  if (positional.length !== 1) {
    throw new BuilderError(CODES.BAD_ENTRY, 'skip <questionId> — one question at a time');
  }
  const mode = resolveMode(options);
  const draft = skipQuestion(requireDraft(root), positional[0]);
  writeDraft(root, draft);
  return {
    lines: [`skipped ${String(positional[0])} — the field keeps whatever it already says`,
      ...questionLines(nextQuestion(draft, mode), mode)],
  };
}
