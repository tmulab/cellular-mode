// cell-in-operation.mjs — the four cell transitions AS THEY BEHAVE INSIDE AN ACTIVE
// OPERATION. `commands.mjs` picks between this file and `transitions.mjs` by one fact
// read from disk: is any operation 🔵? With none, nothing here runs and the old
// one-active-cell law applies byte for byte; with one, five rules are added and only
// five — the pack's ceiling instead of "one", a boundary that may not be `—`, the
// `Operation:`/`Base commit:` link on every write, `Planned cells` as the line between
// what the orchestrator may open alone and what needs the human's yes, and the conflict
// crossing against the other 🔵 cells, recorded at every opening. The rules themselves
// are in ./cell-in-operation-rules.mjs, the crossing in ./conflicts.mjs.
//
// The writes are NOT reimplemented here: `activate()` and `close()` stay the single
// activation and closing paths, so a cell opened inside an operation and one opened
// outside it are the same file written by the same code.
import { now } from './clock.mjs';
import { slugify, findCell } from './slug.mjs';
import { CliError, EXIT } from './errors.mjs';
import { ceilingOf } from './check.mjs';
import { reconnectLines } from './projections.mjs';
import { renderDependencies } from './deps.mjs';
import { readCell, refreshCurrent } from './state.mjs';
import { activate, guardedState, rowSlug } from './activate.mjs';
import { close } from './transitions.mjs';
import {
  assertAllowed, optionalOption, requireOption, requireName,
} from './args.mjs';
import { gitHead } from './cell-in-operation-state.mjs';
import {
  activeRows, assertCeiling, assertPlanned, requireBoundary, resolveActive,
  keepBaseCommit, closePatch, crossOpen,
} from './cell-in-operation-rules.mjs';
import { recordConflicts } from './conflicts.mjs';

/** @typedef {import('./types.mjs').ParsedArgs} ParsedArgs */
/** @typedef {import('./types.mjs').Operation} Operation */
/** @typedef {import('./types.mjs').CommandResult} CommandResult */
/** A cell transition that knows which operation is 🔵.
 * @typedef {(root: string, args: ParsedArgs, env: NodeJS.ProcessEnv | undefined,
 *   op: Operation) => CommandResult} InOperationFn */

const OPEN_FLAGS = ['root', 'area', 'objective', 'in', 'out', 'done', 'deps', 'next',
  'amend-pack', 'confirm'];
const CLOSE_FLAGS = ['root', 'facts', 'decisions', 'build', 'note', 'spend'];

/** @type {InOperationFn} */
export function openInOperation(root, { positional, options }, env, op) {
  assertAllowed(options, OPEN_FLAGS, 'open');
  const name = requireName(positional, 'open');
  const next = optionalOption(options, 'next', 'open');
  const st = guardedState(root);
  const slug = slugify(name);
  const row = st.indexRows.find((r) => rowSlug(r) === slug);
  if (row && row.status === '✔') {
    throw new CliError(`cell "${row.name}" is done (✔) — ✔ is terminal; `
      + 'reopening means a NEW cell with a new name', EXIT.USAGE);
  }
  if (row && row.status === '⏸') {
    throw new CliError(`cell "${row.name}" is paused — use: cellmode resume "${row.name}"`,
      EXIT.USAGE);
  }
  const prior = readCell(root, slug);
  const boundary = requireBoundary(options, prior);
  const label = row?.name || name;
  const deps = options.deps === undefined ? prior?.dependencies : renderDependencies(options.deps);
  // Ceiling and crossing BEFORE the amendment: an opening about to be refused must not
  // have appended an amendment entry to the log first.
  assertCeiling(st, op);
  const crossing = crossOpen(root, st, op, label, slug, {
    boundaryIn: boundary.in, boundaryOut: boundary.out, dependencies: deps,
    inputs: prior?.inputs, outputs: prior?.outputs,
  }, options);
  assertPlanned(root, op, label, slug, options, env);
  // The crossing is RECORDED, in all three verdicts: the sentence belongs in the log
  // entry of the opening (docs/02), and the log is written before the projections. A
  // first cell crossed nobody, and writes nothing — an opening is not a closure.
  if (crossing.crossed) recordConflicts(root, op, label, crossing.field, now(env));
  const cell = activate(root, st, {
    row,
    name: label,
    slug,
    env,
    patch: {
      area: options.area,
      objective: options.objective,
      boundaryIn: boundary.in,
      boundaryOut: boundary.out,
      doneCriterion: options.done,
      nextStep: next,
      dependencies: options.deps === undefined ? undefined : renderDependencies(options.deps),
      operation: op.name,
      baseCommit: gitHead(root),
    },
  });
  const promoted = row?.status === '📋' ? ' — promoted from 📋 (an opening, not a resume)' : '';
  return {
    lines: [
      `Opened "${cell.name}" (${slug}) · 🔵${promoted}`,
      `Operation: ${cell.operation} · base commit ${cell.baseCommit} · `
      + `${activeRows(st).length + 1}/${ceilingOf(op)} active`,
      // A `none` says itself in the record and needs no line here; the other two are
      // what the human has to see at the moment of opening.
      ...(crossing.verdict === 'none' ? []
        : [`WARNING: conflicts — ${crossing.field.replace('**Conflicts:** ', '')}`]),
      `NEXT STEP: ${cell.nextStep}`,
    ],
  };
}

/** @type {InOperationFn} */
export function resumeInOperation(root, { positional, options }, env, op) {
  assertAllowed(options, ['root', 'amend-pack', 'confirm'], 'resume');
  const query = requireName(positional, 'resume');
  const st = guardedState(root);
  const hit = findCell(st.indexRows.filter((r) => r.status === '⏸'), query);
  if (hit.kind === 'none') {
    throw new CliError(`no paused cell matches "${query}"`, EXIT.USAGE);
  }
  if (hit.kind === 'ambiguous') {
    throw new CliError(`"${query}" matches more than one paused cell — be specific:\n${
      hit.candidates.map((c) => `- ${c.name}`).join('\n')}`, EXIT.AMBIGUOUS);
  }
  const slug = rowSlug(hit.row);
  assertCeiling(st, op);
  assertPlanned(root, op, hit.row.name, slug, options, env);
  const cell = activate(root, st, {
    row: hit.row,
    name: hit.row.name,
    slug,
    env,
    patch: { operation: op.name, ...keepBaseCommit(root, slug) },
  });
  return { lines: [...reconnectLines(cell), 'Shall we continue?'] };
}

/** @type {InOperationFn} */
export function pauseInOperation(root, { positional, options }, env, op) {
  assertAllowed(options, [...CLOSE_FLAGS, 'next'], 'pause');
  const st = guardedState(root);
  const row = resolveActive(st, positional.join(' ').trim(), 'pause');
  const facts = requireOption(options, 'facts', 'pause');
  const next = requireOption(options, 'next', 'pause');
  const cell = close(root, st, row, {
    status: '⏸', facts, next, decisions: options.decisions, build: options.build,
    note: options.note, patch: closePatch(root, op, rowSlug(row), options, 'pause'),
  }, env);
  // The cells that are still 🔵 keep the projection: `close` wrote the idle form, which
  // is only the truth when this was the last active cell.
  refreshCurrent(root);
  return { lines: [`Paused "${cell.name}" · ⏸`, `NEXT STEP: ${next}`, 'Cells know how to wait.'] };
}

/** @type {InOperationFn} */
export function completeInOperation(root, { positional, options }, env, op) {
  assertAllowed(options, [...CLOSE_FLAGS, 'confirm'], 'complete');
  const st = guardedState(root);
  const row = resolveActive(st, positional.join(' ').trim(), 'complete');
  if (options.confirm !== true) {
    throw new CliError('human confirmation required: marking a cell ✔ is the human\'s call — '
      + 're-run with --confirm', EXIT.NEEDS_CONFIRMATION);
  }
  const facts = requireOption(options, 'facts', 'complete');
  const cell = close(root, st, row, {
    status: '✔', facts, next: '—', decisions: options.decisions, build: options.build,
    note: options.note, patch: closePatch(root, op, rowSlug(row), options, 'complete'),
  }, env);
  refreshCurrent(root);
  return {
    lines: [
      `Completed "${cell.name}" · ✔`,
      'Cell file kept as history.',
      'Completion RECORDED — not yet authorized: run `node tools/gates/verify-final.mjs`'
      + ' (or `npm run verify:final` where that script exists) on this exact state.',
    ],
  };
}
