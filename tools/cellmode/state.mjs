// state.mjs — the ONLY module that touches the filesystem for vault state. Everything
// else is pure, so it can be tested without a disk; the log is appended, never rewritten.
import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { statePaths, STATE_REL } from './paths.mjs';
import { slugify } from './slug.mjs';
import { parseIndex, renderIndex } from './index-table.mjs';
import { parseLog, renderLogEntry } from './log.mjs';
import { parseCellFile, renderCellFile } from './cell-file.mjs';
import { parseOperationFile, renderOperationFile } from './operation-file.mjs';
import {
  parseCurrentCell, renderCurrentCell, renderNoActive, byRecency,
} from './projections.mjs';
import { operationLayerFindings } from './check-layer.mjs';
import { checkReport } from './check-report.mjs';
import { skeletonFiles } from './skeleton.mjs';
import { CliError, EXIT } from './errors.mjs';

/** @typedef {import('./types.mjs').Cell} Cell @typedef {import('./types.mjs').IndexRow} IndexRow
 * @typedef {import('./types.mjs').LogDraft} LogDraft
 * @typedef {import('./types.mjs').Operation} Operation */

/** @type {(file: string) => string} */
const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

/** The ONE write path: it creates the directory first, so a new state file cannot forget
 * to. @type {(file: string, text: string) => void} */
const write = (file, text) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
};

/** @param {string} root @returns {boolean} */
export const isInitialized = (root) => existsSync(statePaths(root).state);

/** @param {string} root @returns {import('./types.mjs').StatePaths} */
export function requireState(root) {
  const p = statePaths(root);
  if (!existsSync(p.index) || !existsSync(p.log)) {
    throw new CliError(`no cellular-mode state in ${STATE_REL} — run \`cellmode init\` first`,
      EXIT.USAGE);
  }
  return p;
}

// The generated map is a PRODUCT of the vault rather than state, so it is not in
// `statePaths`: `cellmode report` is the only writer and the guard only reads it.
/** @param {string} root @returns {string} */
export const mapFile = (root) => join(statePaths(root).state, 'map.svg');
export const writeMap = write;

/** Where each skeleton file goes. The KEYS of `skeletonFiles` are the relative POSIX paths,
 * so the mapping is derived from them and cannot list a file the skeleton does not define.
 * @param {string} stateDir @returns {Record<string, string>} */
export function skeletonTargets(stateDir) {
  return Object.fromEntries(Object.keys(skeletonFiles())
    .map((rel) => [rel, join(stateDir, ...rel.split('/'))]));
}

/** @param {string} root */
export function writeSkeleton(root) {
  const p = statePaths(root);
  const target = skeletonTargets(p.state);
  // `write` creates each parent directory, and the skeleton has a README in both, so
  // `cells/` and `operations/` exist after this loop without a mkdir of their own.
  for (const [rel, content] of Object.entries(skeletonFiles())) {
    write(target[rel] ?? join(p.state, rel), content);
  }
  return p;
}

/** @param {string} root */
export function readState(root) {
  const p = requireState(root);
  const indexText = read(p.index);
  const logText = read(p.log);
  const currentText = read(p.current);
  const indexRows = parseIndex(indexText);
  const operationTexts = listOperationTexts(root);
  return {
    paths: p, indexText, logText, currentText, indexRows, operationTexts,
    logEntries: parseLog(logText),
    current: parseCurrentCell(currentText),
    parkingLotText: read(p.parkingLot),
    // The operation layer for the guard: the 🔵 operation read from disk, never from a
    // parameter, plus the findings `check-layer.mjs` composes from THIS module's reads —
    // injected, so `check.mjs` stays pure and this stays the only opener of a vault file.
    operation: activeOperation(root),
    layerFindings: operationLayerFindings({
      root, logText, rows: indexRows, texts: operationTexts,
      operations: listOperations(root), cell: (slug) => readCell(root, slug),
    }),
    // The map's finding is kept APART from `layerFindings` on purpose: `check` reports it
    // (commands.mjs), and no lifecycle transition is refused for it. A map is a product of
    // the vault, and refusing to RECORD a closure because a picture went stale would deny
    // rule 2 (resumable <=> recorded) to protect a drawing.
    reportFindings: checkReport({
      mapText: read(mapFile(root)), logText, indexText, operationTexts,
    }),
  };
}

/** A missing file reads as '', which `parseCellFile` answers with null: one path, not two.
 * @param {string} root @param {string} slug @returns {Cell | null} */
export const readCell = (root, slug) => parseCellFile(read(statePaths(root).cellFile(slug)));

/** @param {string} root @param {Cell} cell */
export const writeCell = (root, cell) =>
  write(statePaths(root).cellFile(cell.id), renderCellFile(cell));

/** @param {string} root @param {ReadonlyArray<IndexRow>} rows */
export const writeIndex = (root, rows) => write(statePaths(root).index, renderIndex(rows));

/** Every operation file as raw TEXT, README skipped: what the guard reads to name a pack no
 * parser accepts. @param {string} root @returns {Array<{ slug: string, text: string }>} */
export function listOperationTexts(root) {
  const dir = statePaths(root).operations;
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => ({ slug: f.slice(0, -'.md'.length), text: readFileSync(join(dir, f), 'utf8') }));
}

/** A file whose pack is outside the CLOSED vocabulary makes `parseOperationFile` throw
 * (`PACK_FORBIDDEN_GRANT: <key>`): it is SKIPPED here and reported as a
 * `pack-grants-forbidden` finding by the guard, so one bad pack cannot crash every command
 * — and is never silently accepted either. @param {string} text @returns {Operation|null} */
const parsedOperation = (text) => {
  try { return parseOperationFile(text); } catch { return null; }
};

/** Every operation on disk. @param {string} root @returns {Operation[]} */
export function listOperations(root) {
  return listOperationTexts(root).flatMap(({ text }) => parsedOperation(text) ?? []);
}

/** @param {string} root @param {string} slug @returns {Operation | null} */
export const readOperation = (root, slug) =>
  parseOperationFile(read(statePaths(root).operationFile(slug)));

/** @param {string} root @param {Operation} op */
export const writeOperation = (root, op) =>
  write(statePaths(root).operationFile(op.id), renderOperationFile(op));

/** The one 🔵 operation, or null. @param {string} root @returns {Operation | null} */
export function activeOperation(root) {
  return listOperations(root).find((o) => o.status === '🔵') ?? null;
}

/** The projection of the cell that is active NOW, plus — inside an operation with more than
 * one 🔵 cell — the table of all of them. `rows` is the INDEX as just written, so the table
 * and the row statuses cannot disagree.
 * @param {string} root @param {Cell} cell @param {ReadonlyArray<IndexRow>} [rows] */
export function writeCurrentActive(root, cell, rows = []) {
  const active = rows.filter((r) => r.status === '🔵').map((r) => ({
    name: r.name,
    area: r.area,
    nextStep: r.nextStep,
    baseCommit: readCell(root, r.slug || slugify(r.name))?.baseCommit ?? '',
  }));
  write(statePaths(root).current, renderCurrentCell(cell, activeOperation(root), active));
}

/** @param {string} root @param {ReadonlyArray<IndexRow>} rows */
export const writeCurrentIdle = (root, rows) => write(statePaths(root).current,
  renderNoActive(rows.filter((r) => r.status === '⏸'), activeOperation(root)));

/** Rewrite CURRENT-CELL.md from what is on disk now: the operation header follows the
 * operation's own status, so an `op` command refreshes the projection without knowing anything
 * about the cell layer. @param {string} root */
export function refreshCurrent(root) {
  const p = requireState(root);
  const rows = parseIndex(read(p.index));
  // With several 🔵 cells the file projects the most recently visited one (ties keep the INDEX
  // order): the one a reader at Level 3 is most likely to be returning to.
  const row = byRecency(rows.filter((r) => r.status === '🔵'))[0];
  const cell = row ? readCell(root, row.slug || slugify(row.name)) : null;
  if (cell) writeCurrentActive(root, cell, rows);
  else writeCurrentIdle(root, rows);
}

// APPEND-ONLY: the previous bytes of log.md are always a prefix of the new file.
/** @param {string} root @param {LogDraft} entry */
export function appendLog(root, entry) {
  appendFileSync(statePaths(root).log, renderLogEntry(entry), 'utf8');
}

// APPEND-ONLY, for an entry rendered elsewhere (the operation entries of
// `operation-log.mjs`: not cell closures, so not LogDrafts).
/** @param {string} root @param {string} text */
export function appendLogText(root, text) {
  appendFileSync(statePaths(root).log, text, 'utf8');
}

/** @param {string} root @param {string} line */
export function appendParkingLot(root, line) {
  appendFileSync(statePaths(root).parkingLot, `${line}\n`, 'utf8');
}
