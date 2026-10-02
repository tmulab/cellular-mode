// state.mjs — the ONLY module that touches the filesystem for vault state.
// Everything else is pure, so it can be tested without a disk.
// The log is appended with fs.appendFileSync and never rewritten.
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { statePaths, STATE_REL } from './paths.mjs';
import { parseIndex, renderIndex } from './index-table.mjs';
import { parseLog, renderLogEntry } from './log.mjs';
import { parseCellFile, renderCellFile } from './cell-file.mjs';
import { parseCurrentCell, renderCurrentCell, renderNoActive } from './projections.mjs';
import { skeletonFiles } from './skeleton.mjs';
import { CliError, EXIT } from './errors.mjs';

/** @typedef {import('./types.mjs').Cell} Cell */
/** @typedef {import('./types.mjs').IndexRow} IndexRow */
/** @typedef {import('./types.mjs').LogDraft} LogDraft */

/** @type {(file: string) => string} */
const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

/** @param {string} root @returns {boolean} */
export function isInitialized(root) {
  return existsSync(statePaths(root).state);
}

/** @param {string} root @returns {import('./types.mjs').StatePaths} */
export function requireState(root) {
  const p = statePaths(root);
  if (!existsSync(p.index) || !existsSync(p.log)) {
    throw new CliError(
      `no cellular-mode state in ${STATE_REL} — run \`cellmode init\` first`, EXIT.USAGE,
    );
  }
  return p;
}

/** @param {string} stateDir @returns {Record<string, string>} */
export function skeletonTargets(stateDir) {
  return {
    'log.md': join(stateDir, 'log.md'),
    'INDEX.md': join(stateDir, 'INDEX.md'),
    'CURRENT-CELL.md': join(stateDir, 'CURRENT-CELL.md'),
    'parking-lot.md': join(stateDir, 'parking-lot.md'),
    'cells/README.md': join(stateDir, 'cells', 'README.md'),
  };
}

/** @param {string} root */
export function writeSkeleton(root) {
  const p = statePaths(root);
  mkdirSync(p.cells, { recursive: true });
  const target = skeletonTargets(p.state);
  for (const [rel, content] of Object.entries(skeletonFiles())) {
    const file = target[rel];
    if (file !== undefined) writeFileSync(file, content, 'utf8');
  }
  return p;
}

/** @param {string} root */
export function readState(root) {
  const p = requireState(root);
  const indexText = read(p.index);
  const logText = read(p.log);
  const currentText = read(p.current);
  return {
    paths: p,
    indexText,
    logText,
    currentText,
    indexRows: parseIndex(indexText),
    logEntries: parseLog(logText),
    current: parseCurrentCell(currentText),
  };
}

/** @param {string} root @param {string} slug @returns {Cell | null} */
export function readCell(root, slug) {
  const file = statePaths(root).cellFile(slug);
  return existsSync(file) ? parseCellFile(readFileSync(file, 'utf8')) : null;
}

/** @param {string} root @param {Cell} cell */
export function writeCell(root, cell) {
  const p = statePaths(root);
  mkdirSync(p.cells, { recursive: true });
  writeFileSync(p.cellFile(cell.id), renderCellFile(cell), 'utf8');
}

/** @param {string} root @param {ReadonlyArray<IndexRow>} rows */
export function writeIndex(root, rows) {
  writeFileSync(statePaths(root).index, renderIndex(rows), 'utf8');
}

/** @param {string} root @param {Cell} cell */
export function writeCurrentActive(root, cell) {
  writeFileSync(statePaths(root).current, renderCurrentCell(cell), 'utf8');
}

/** @param {string} root @param {ReadonlyArray<IndexRow>} rows */
export function writeCurrentIdle(root, rows) {
  const paused = rows.filter((r) => r.status === '⏸');
  writeFileSync(statePaths(root).current, renderNoActive(paused), 'utf8');
}

// APPEND-ONLY: the previous bytes of log.md are always a prefix of the new file.
/** @param {string} root @param {LogDraft} entry */
export function appendLog(root, entry) {
  appendFileSync(statePaths(root).log, renderLogEntry(entry), 'utf8');
}

/** @param {string} root @param {string} line */
export function appendParkingLot(root, line) {
  appendFileSync(statePaths(root).parkingLot, `${line}\n`, 'utf8');
}
