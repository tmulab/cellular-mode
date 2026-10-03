// The vault, read once and normalised once.
//
// Every capability of `observer.state` answers from THIS model, and the model is
// built with the `tools/cellmode` pure parsers — `parseIndex`, `parseLog`,
// `parseCellFile`, `parseCurrentCell`, `checkState`, `parseDependencies`. Nothing
// here parses Markdown. A second parser of the same files would be a second truth,
// and the one that drifts is always the one nobody runs.
//
// Absence is a VALUE, not an error: a vault with no `log.md` is a normal state the
// observer must be able to describe. Missing inputs are listed, never imagined.
import { parseCellFile } from '../../../tools/cellmode/cell-file.mjs';
import { checkState } from '../../../tools/cellmode/check.mjs';
import { parseDependencies } from '../../../tools/cellmode/deps.mjs';
import { parseIndex } from '../../../tools/cellmode/index-table.mjs';
import { parseLog } from '../../../tools/cellmode/log.mjs';
import { parseCurrentCell } from '../../../tools/cellmode/projections.mjs';
import { slugify } from '../../../tools/cellmode/slug.mjs';

/** @typedef {import('../../../tools/cellmode/types.mjs').Cell} Cell */
/** @typedef {import('../../../tools/cellmode/types.mjs').LogEntry} LogEntry */
/** @typedef {import('./types.mjs').Entry} Entry */
/** @typedef {import('./types.mjs').Model} Model */
/** @typedef {import('./types.mjs').Warning} Warning */

/** The protocol's four symbols, as the words the API publishes. A symbol is lovely in
 * a terminal and useless as a JSON discriminator. */
export const STATUS_BY_SYMBOL = Object.freeze({
  '📋': 'planned', '🔵': 'active', '⏸': 'paused', '✔': 'done',
});
export const STATUSES = Object.freeze(['planned', 'active', 'paused', 'done']);
export const SYMBOL_BY_STATUS = Object.freeze({
  planned: '📋', active: '🔵', paused: '⏸', done: '✔',
});

/** A cell id, and therefore a cell file name. Same shape as the API contract. */
export const CELL_ID = /^[a-z0-9-]{1,80}$/;

/** The files the model reads. `parking-lot.md` is not one of them: the parking lot is
 * the human's notebook, not project state, and publishing it was never asked for. */
export const VAULT_INPUTS = Object.freeze(['INDEX.md', 'log.md', 'CURRENT-CELL.md']);

/** `—` is how the file format spells "not recorded". It is not a value to publish.
 * @type {(value: unknown) => string | null} */
export const field = (value) => {
  const text = String(value ?? '').trim();
  return text === '' || text === '—' ? null : text;
};

/** @type {(symbol: string) => string} */
const wordFor = (symbol) => /** @type {Record<string, string | undefined>} */ (
  STATUS_BY_SYMBOL)[symbol] ?? 'planned';

/** @type {(code: string, message: string, cell?: string) => Warning} */
export const warning = (code, message, cell) => (cell === undefined
  ? { code, message }
  : { code, message, cell });

/**
 * Read and normalise. `read` and `list` are the host's `fs.read` ports; this module
 * never builds a path, which is why it cannot escape one.
 * @param {(name: string) => Promise<string | null>} read
 * @param {() => Promise<string[]>} list
 * @returns {Promise<Model>}
 */
export async function readModel(read, list) {
  const [indexText, logText, currentText] = await Promise.all(VAULT_INPUTS.map((n) => read(n)));
  /** @type {string[]} */
  const missing = [];
  VAULT_INPUTS.forEach((name, i) => {
    if ([indexText, logText, currentText][i] === null) missing.push(name);
  });
  const indexRows = parseIndex(indexText ?? '');
  const logEntries = parseLog(logText ?? '');
  const current = parseCurrentCell(currentText ?? '');
  const onDisk = await list();

  /** @type {Warning[]} */
  const warnings = missing.map((name) => warning('vault-file-missing',
    `${name} is not in the vault; everything derived from it is empty, not guessed`));

  // Identity comes from INDEX.md, the projection the method links by. A cell file with
  // no row is reported, never promoted: the index is what the human maintains.
  /** @type {Entry[]} */
  const entries = [];
  /** @type {Map<string, Entry>} */
  const byId = new Map();
  for (const row of indexRows) {
    const id = row.slug ?? slugify(row.name);
    if (!CELL_ID.test(id)) {
      warnings.push(warning('cell-id-unreadable', `"${row.name}" has no id matching ${CELL_ID.source}`));
      continue;
    }
    if (byId.has(id)) {
      warnings.push(warning('duplicate-cell-id', `two INDEX.md rows share the id "${id}"`, id));
      continue;
    }
    const text = onDisk.includes(id) ? await read(`cells/${id}.md`) : null;
    const cell = text === null ? null : parseCellFile(text);
    if (cell === null) {
      warnings.push(warning('cell-file-missing',
        `no readable cells/${id}.md, so this cell's detail comes from INDEX.md alone`, id));
    }
    /** @type {Entry} */
    const entry = {
      id,
      name: field(cell?.name ?? row.name) ?? id,
      area: field(cell?.area ?? row.area),
      status: wordFor(row.status),
      statusSymbol: row.status,
      lastVisit: field(row.lastVisit),
      nextStep: field(cell?.nextStep ?? row.nextStep),
      dependencies: parseDependencies(cell?.dependencies),
      cell,
    };
    entries.push(entry);
    byId.set(id, entry);
  }
  for (const id of onDisk) {
    if (!byId.has(id)) {
      warnings.push(warning('cell-file-without-index-row',
        `cells/${id}.md has no row in INDEX.md, so it is not part of the project state`, id));
    }
  }
  // A declared dependency on a cell nobody declared is a WARNING, never a new node.
  for (const entry of entries) {
    for (const target of entry.dependencies) {
      if (!byId.has(target)) {
        warnings.push(warning('dangling-dependency',
          `"${entry.id}" declares a dependency on "${target}", which is not a cell in INDEX.md`,
          entry.id));
      }
    }
  }

  // The integrity verdict is the CLI's own guard, run on the parsed state.
  const findings = checkState({ indexRows, logEntries, current });
  return {
    entries,
    byId,
    logEntries,
    missing,
    warnings,
    integrity: { ok: findings.length === 0, findings: findings.map((f) => ({ ...f })) },
  };
}
