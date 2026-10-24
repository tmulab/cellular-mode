// operation-commands.mjs — the `op` family: open, pause, complete, status. The
// operation is the human's unit of attention above the cells (AGENTS.md rule 1), so
// exactly ONE operation is 🔵 at a time and its finish line is frozen at opening.
//
// What this module deliberately does NOT do: cascade a pause down to the cells. The
// method says pausing an operation pauses its cells, but a cell pause needs ITS OWN
// facts and next step, which nothing here can invent — so an operation pause or
// completion with a 🔵 cell of that operation is REFUSED (exit 3, "pause the cell
// first") instead of writing fiction into the log. Cascading is the human's decision,
// not a default. Cell semantics stay in transitions.mjs; this file never writes a cell.
import { now, today } from './clock.mjs';
import { slugify } from './slug.mjs';
import { oneLine } from './fields.mjs';
import { CliError, EXIT } from './errors.mjs';
import { assertAllowed, requireOption } from './args.mjs';
import { renderOperationEntry } from './operation-log.mjs';
import { makeOperation, fingerprintFinishLine, NONE } from './operation-file.mjs';
import {
  requireState, listOperations, readOperation, writeOperation, appendLogText, refreshCurrent,
} from './state.mjs';
import {
  readPack, readFinishLine, operationName, resolveActive, refuseIfCellActive,
  statusLines, waitingLines,
} from './operation-lookup.mjs';

/** @typedef {import('./types.mjs').Operation} Operation */
/** @typedef {import('./types.mjs').ParsedArgs} ParsedArgs */
/** @typedef {import('./types.mjs').CommandResult} CommandResult */
/** @typedef {Record<string, string | boolean>} Options */

const SUBS = 'open | pause | complete | status';

/** Log first (it is the truth), then the operation file, then the projection.
 * @param {string} root @param {Operation} prior @param {string} status
 * @param {{ facts?: unknown, next?: unknown, spend?: unknown }} entry
 * @param {NodeJS.ProcessEnv} [env] @returns {Operation} */
function closeOperation(root, prior, status, entry, env) {
  const op = makeOperation({ ...prior, status });
  appendLogText(root, renderOperationEntry(op, { timestamp: now(env), ...entry }));
  writeOperation(root, op);
  refreshCurrent(root);
  return op;
}

/** @param {string} root @param {string[]} rest @param {Options} options
 * @param {NodeJS.ProcessEnv} [env] @returns {CommandResult} */
function opOpen(root, rest, options, env) {
  assertAllowed(options, ['root', 'finish-line', 'pack', 'bar', 'cells'], 'op open');
  const name = operationName(rest, 'op open');
  const items = readFinishLine(requireOption(options, 'finish-line', 'op open'));
  const pack = readPack(requireOption(options, 'pack', 'op open'));
  const bar = requireOption(options, 'bar', 'op open');
  const cells = requireOption(options, 'cells', 'op open');
  requireState(root);
  const slug = slugify(name);
  const blocker = listOperations(root).find((o) => o.status === '🔵');
  if (blocker) {
    throw new CliError(`operation "${oneLine(blocker.name, 'unnamed')}" is 🔵 — pause or `
      + 'complete it first: one ACTIVE operation at a time', EXIT.ACTIVE_CELL);
  }
  const prior = readOperation(root, slug);
  if (prior && prior.status === '✔') {
    throw new CliError(`operation "${prior.name}" is done (✔) — ✔ is terminal; `
      + 'a new operation needs a new name', EXIT.USAGE);
  }
  // A resume may not move what was frozen: same slug, same fingerprint, or it is a
  // moved finish line and that is a recorded decision, not a re-opening.
  if (prior && fingerprintFinishLine(items) !== prior.fingerprint) {
    throw new CliError(`the finish line of "${prior.name}" was frozen at opening `
      + `(fingerprint ${prior.fingerprint.slice(0, 12)}…) — resuming may not move it`,
    EXIT.USAGE);
  }
  const op = prior
    ? makeOperation({ ...prior, status: '🔵' })
    : makeOperation({
      name, id: slug, opened: today(env), status: '🔵',
      finishLine: items, pack, qualityBar: bar, plannedCells: cells,
    });
  appendLogText(root, renderOperationEntry(op, { timestamp: now(env) }));
  writeOperation(root, op);
  refreshCurrent(root);
  return {
    lines: [
      `${prior ? 'Resumed' : 'Opened'} operation "${op.name}" (${slug}) · 🔵`,
      `Finish line frozen (${op.finishLine.length} items) · fingerprint ${op.fingerprint}`,
      `Planned cells: ${op.plannedCells.length ? op.plannedCells.join(', ') : NONE}`,
    ],
  };
}

/** @param {string} root @param {string[]} rest @param {Options} options
 * @param {NodeJS.ProcessEnv} [env] @returns {CommandResult} */
function opPause(root, rest, options, env) {
  assertAllowed(options, ['root', 'facts', 'next'], 'op pause');
  requireState(root);
  const op = resolveActive(root, rest.join(' ').trim(), 'pause');
  const facts = requireOption(options, 'facts', 'op pause');
  const next = requireOption(options, 'next', 'op pause');
  refuseIfCellActive(root, op, 'pause');
  const paused = closeOperation(root, op, '⏸', { facts, next }, env);
  return {
    lines: [`Paused operation "${paused.name}" · ⏸`, `NEXT STEP: ${next}`,
      'Its cells keep their own state: nothing was cascaded.'],
  };
}

/** @param {string} root @param {string[]} rest @param {Options} options
 * @param {NodeJS.ProcessEnv} [env] @returns {CommandResult} */
function opComplete(root, rest, options, env) {
  assertAllowed(options, ['root', 'facts', 'confirm'], 'op complete');
  requireState(root);
  const op = resolveActive(root, rest.join(' ').trim(), 'complete');
  if (options.confirm !== true) {
    throw new CliError('human confirmation required: closing an operation is the human\'s '
      + 'call — re-run with --confirm', EXIT.NEEDS_CONFIRMATION);
  }
  const facts = requireOption(options, 'facts', 'op complete');
  refuseIfCellActive(root, op, 'complete');
  const done = closeOperation(root, op, '✔', { facts, spend: op.spendSoFar }, env);
  return {
    lines: [`Completed operation "${done.name}" · ✔`,
      `Fingerprint unchanged: ${done.fingerprint}`,
      'The authorization pack expired with it.'],
  };
}

/** @param {string} root @param {string[]} rest @param {Options} options
 * @returns {CommandResult} */
function opStatus(root, rest, options) {
  assertAllowed(options, ['root'], 'op status');
  if (rest.length) {
    throw new CliError('`op status` takes no positional arguments', EXIT.USAGE);
  }
  requireState(root);
  const ops = listOperations(root);
  const active = ops.find((o) => o.status === '🔵');
  return { lines: active ? statusLines(active) : waitingLines(ops) };
}

/** @param {string} root @param {ParsedArgs} args @param {NodeJS.ProcessEnv} [env]
 * @returns {CommandResult} */
export function cmdOp(root, { positional, options }, env) {
  const sub = oneLine(positional[0], '');
  const rest = positional.slice(1);
  if (sub === 'open') return opOpen(root, rest, options, env);
  if (sub === 'pause') return opPause(root, rest, options, env);
  if (sub === 'complete') return opComplete(root, rest, options, env);
  if (sub === 'status') return opStatus(root, rest, options);
  throw new CliError(sub === '' ? `\`op\` needs a sub-command: ${SUBS}`
    : `unknown \`op\` sub-command: ${sub} (expected ${SUBS})`, EXIT.USAGE);
}
