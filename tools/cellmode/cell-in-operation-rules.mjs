// cell-in-operation-rules.mjs — the four rules an ACTIVE OPERATION adds to the cell
// transitions, extracted from cell-in-operation.mjs the way activate.mjs is extracted
// from transitions.mjs: each file one responsibility, each under the limit.
//
// Everything here answers a question or refuses; the only writes are the pack amendment
// (the human's recorded yes) composed in ./cell-in-operation-state.mjs.
import { now } from './clock.mjs';
import { oneLine } from './fields.mjs';
import { findCell } from './slug.mjs';
import { CliError, EXIT } from './errors.mjs';
import { ceilingOf } from './check.mjs';
import { readCell } from './state.mjs';
import { requireOption, optionalOption } from './args.mjs';
import { gitHead, amendPack } from './cell-in-operation-state.mjs';

/** @typedef {import('./types.mjs').Cell} Cell */
/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** @typedef {import('./types.mjs').State} State */
/** @typedef {import('./types.mjs').Operation} Operation */
/** @typedef {Record<string, string | boolean>} Options */

/** @type {(r: { name?: unknown }) => string} */
export const label = (r) => oneLine(r.name, 'unnamed');

/** The 🔵 rows, ALL of them: the ceiling counts attention, and a 🔵 cell carrying no
 * `Operation:` link still occupies it. This is also exactly what `check` counts, so the
 * command and the guard cannot disagree about whether the state is legal.
 * @param {State} st @returns {IndexRow[]} */
export const activeRows = (st) => st.indexRows.filter((r) => r.status === '🔵');

/** @param {State} st @param {Operation} op */
export function assertCeiling(st, op) {
  const active = activeRows(st);
  const ceiling = ceilingOf(op);
  if (active.length < ceiling) return;
  throw new CliError(`${active.length} cell(s) already 🔵 in operation "${label(op)}" `
    + `(max-active-cells: ${ceiling}) — pause one first: ${active.map(label).join(', ')}`,
  EXIT.ACTIVE_CELL);
}

/** `Planned cells` is the line between the two kinds of opening: a cell on the list is
 * the orchestrator's to open, one that is not needs the human's yes, recorded as a pack
 * amendment that adds the cell and touches nothing else.
 * @param {string} root @param {Operation} op @param {string} name @param {string} slug
 * @param {Options} options @param {NodeJS.ProcessEnv} [env] */
export function assertPlanned(root, op, name, slug, options, env) {
  if (op.plannedCells.includes(slug)) return;
  if (options['amend-pack'] !== true) {
    throw new CliError(`cell "${name}" (${slug}) is UNPLANNED in operation "${label(op)}" `
      + `— its Planned cells are: ${op.plannedCells.join(', ') || '—'}. Opening one the `
      + 'operation did not plan is the human\'s call: re-run with --amend-pack --confirm',
    EXIT.USAGE);
  }
  if (options.confirm !== true) {
    throw new CliError('human confirmation required: amending the authorization pack is '
      + 'the human\'s call — re-run with --amend-pack --confirm', EXIT.NEEDS_CONFIRMATION);
  }
  amendPack(root, op, slug, now(env));
}

/** The boundary is REQUIRED inside an operation: the conflict check between parallel
 * cells reads it, and `—` is not a boundary. `--in`/`--out` are the two halves of the
 * `**Boundary:** in: … | NOT in: …` field; a value already in the cell file counts.
 * @param {Options} options @param {Cell | null} prior @returns {{ in: string, out: string }} */
export function requireBoundary(options, prior) {
  /** @type {(key: 'in' | 'out', held: unknown) => string} */
  const half = (key, held) => (key in options
    ? requireOption(options, key, 'open') : oneLine(held, '—'));
  const value = { in: half('in', prior?.boundaryIn), out: half('out', prior?.boundaryOut) };
  const missing = [...(value.in === '—' ? ['--in'] : []), ...(value.out === '—' ? ['--out'] : [])];
  if (missing.length) {
    throw new CliError(`\`open\` inside an operation requires a boundary: ${missing.join(' and ')}`
      + ' — the Boundary field may not be "—", because the conflict check between parallel'
      + ' cells reads it (--in "<what is in>" --out "<what is NOT in>")', EXIT.USAGE);
  }
  return value;
}

/** Which 🔵 cell a `[name]` means. With exactly one active cell the name may be omitted —
 * today's behaviour. With several, omitting it is a usage error and never a guess, and an
 * ambiguous name is exit 4 with the candidates listed.
 * @param {State} st @param {string} query @param {string} verb @returns {IndexRow} */
export function resolveActive(st, query, verb) {
  const active = activeRows(st);
  const only = active[0];
  if (only === undefined) throw new CliError('no active cell — see `cellmode status`', EXIT.USAGE);
  if (query === '') {
    if (active.length === 1) return only;
    throw new CliError(`${active.length} cells are 🔵 — name the one to ${verb}:\n${
      active.map((r) => `- ${label(r)}`).join('\n')}`, EXIT.USAGE);
  }
  const hit = findCell(active, query);
  if (hit.kind === 'ambiguous') {
    throw new CliError(`"${query}" matches more than one active cell — be specific:\n${
      hit.candidates.map((c) => `- ${label(c)}`).join('\n')}`, EXIT.AMBIGUOUS);
  }
  if (hit.kind === 'none') throw new CliError(`no active cell matches "${query}"`, EXIT.USAGE);
  return hit.row;
}

/** The base commit is where this cell's work STARTED: it is filled when the cell has
 * none (it was opened before the operation existed) and never overwritten.
 * @param {string} root @param {string} slug @returns {{ baseCommit?: string }} */
export function keepBaseCommit(root, slug) {
  const held = oneLine(readCell(root, slug)?.baseCommit, '');
  return held === '' ? { baseCommit: gitHead(root) } : {};
}

/** The operation-layer cell fields every closure inside an operation keeps writing.
 * @param {string} root @param {Operation} op @param {string} slug @param {Options} options
 * @param {string} verb @returns {Record<string, unknown>} */
export function closePatch(root, op, slug, options, verb) {
  return {
    operation: op.name,
    ...keepBaseCommit(root, slug),
    spend: optionalOption(options, 'spend', verb),
  };
}
