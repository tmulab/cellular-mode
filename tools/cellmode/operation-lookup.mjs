// operation-lookup.mjs — which operation a command means, whether it may move, and the
// lines `op status` prints. Split out of operation-commands.mjs to keep both files inside
// the 200-line limit; everything here answers a question, nothing here writes.
import { slugify, findCell } from './slug.mjs';
import { oneLine } from './fields.mjs';
import { CliError, EXIT } from './errors.mjs';
import { parsePack, renderFinishLine, renderPack, PACK_GRANTS, NONE } from './operation-file.mjs';
import { readState, readCell, listOperations } from './state.mjs';

/** @typedef {import('./types.mjs').Operation} Operation */
/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** @typedef {import('./types.mjs').Pack} Pack */

/** `--pack` is the file's own field value: ` · ` between grants, `;` between batches.
 * A `;` directly before a known grant key is read as a grant separator too, so the flag
 * accepts both `a: 1 · b: 2` and `a: 1; b: 2` without making `batches: x → 1; y → 2`
 * ambiguous. @type {RegExp} */
const GRANT_SEP = new RegExp(`;\\s*(?=(?:${PACK_GRANTS.join('|')})\\s*:)`, 'gi');

/** The pack of a `--pack` value. The model's errors are already named
 * (`PACK_UNKNOWN_GRANT: <key>`), so they are reported verbatim as usage errors.
 * @param {string} text @returns {Pack} */
export function readPack(text) {
  try {
    return parsePack(text.replace(GRANT_SEP, ' · '));
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error), EXIT.USAGE);
  }
}

/** The finish line of a `--finish-line` value: `;` or `·` between items.
 * @param {string} text @returns {string[]} */
export function readFinishLine(text) {
  return text.split(/[;·]/).map((t) => t.trim()).filter((t) => t !== '' && t !== NONE);
}

/** @param {ReadonlyArray<string>} rest @param {string} verb @returns {string} */
export function operationName(rest, verb) {
  const name = rest.join(' ').trim();
  if (name === '') throw new CliError(`\`${verb}\` requires an operation name`, EXIT.USAGE);
  return name;
}

/** @param {Operation} op @returns {IndexRow} */
const asRow = (op) => ({
  name: op.name, slug: op.id, area: NONE, status: op.status, lastVisit: NONE, nextStep: NONE,
});

/** @param {ReadonlyArray<Operation>} ops @returns {string} */
const listNames = (ops) => ops.map((o) => `- ${oneLine(o.name, 'unnamed')} (${o.id})`).join('\n');

/** The 🔵 operation a `[name]` means: `name` may be omitted when exactly one is active,
 * otherwise it is matched like `resume` does — ambiguity is exit 4 with the candidates
 * listed, never a guess. @param {string} root @param {string} query @param {string} verb
 * @returns {Operation} */
export function resolveActive(root, query, verb) {
  const active = listOperations(root).filter((o) => o.status === '🔵');
  const only = active[0];
  if (only === undefined) {
    throw new CliError('no active operation (🔵) — see `cellmode op status`', EXIT.USAGE);
  }
  if (query === '') {
    if (active.length === 1) return only;
    throw new CliError(`more than one operation is 🔵 — name the one to ${verb}:\n${
      listNames(active)}`, EXIT.AMBIGUOUS);
  }
  const hit = findCell(active.map(asRow), query);
  if (hit.kind === 'ambiguous') {
    throw new CliError(`"${query}" matches more than one active operation — be specific:\n${
      listNames(active.filter((o) => hit.candidates.some((c) => c.slug === o.id)))}`,
    EXIT.AMBIGUOUS);
  }
  const found = hit.kind === 'none' ? undefined : active.find((o) => o.id === hit.row.slug);
  if (found === undefined) {
    throw new CliError(`no active operation matches "${query}"`, EXIT.USAGE);
  }
  return found;
}

/** Refuses while a cell whose `**Operation:**` field names this operation is 🔵: see the
 * no-cascade decision at the top of operation-commands.mjs.
 * @param {string} root @param {Operation} op @param {string} verb */
export function refuseIfCellActive(root, op, verb) {
  const st = readState(root);
  for (const row of st.indexRows.filter((r) => r.status === '🔵')) {
    const cell = readCell(root, row.slug || slugify(row.name));
    const link = oneLine(cell?.operation, '');
    if (link !== '' && slugify(link) === op.id) {
      throw new CliError(`cell "${oneLine(row.name, 'unnamed')}" is 🔵 in operation `
        + `"${oneLine(op.name, 'unnamed')}" — pause the cell first, then ${verb} the operation`,
      EXIT.ACTIVE_CELL);
    }
  }
}

/** @param {Operation} op @returns {string[]} */
export function statusLines(op) {
  const ceiling = oneLine(op.pack.spendCeiling, '');
  return [
    `Operation: ${oneLine(op.name, 'unnamed')} (${op.id}) · ${op.status}`,
    `Finish line: ${renderFinishLine(op.finishLine)}`,
    `Fingerprint: ${oneLine(op.fingerprint)}`,
    `Pack: ${renderPack(op.pack)}`,
    `Spend so far: ${oneLine(op.spendSoFar)}${ceiling === '' ? '' : ` / ${ceiling}`}`,
    `Quality bar: ${oneLine(op.qualityBar)}`,
    `Planned cells: ${op.plannedCells.length ? op.plannedCells.join(', ') : NONE}`,
  ];
}

/** @param {ReadonlyArray<Operation>} ops @returns {string[]} */
export function waitingLines(ops) {
  const paused = ops.filter((o) => o.status === '⏸');
  return [`No active operation · ${paused.length} paused`,
    ...paused.map((o) => `- ${oneLine(o.name, 'unnamed')} (${o.id}) · ⏸ · `
      + `${o.finishLine.length} finish-line items`)];
}
