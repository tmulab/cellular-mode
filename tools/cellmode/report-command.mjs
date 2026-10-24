// report-command.mjs — `cellmode report [--out <path>]`: the one command of the map.
// It reads through `state.mjs` (the only module that opens a vault file), hands the plain
// content to the PURE model and the PURE renderer, and writes the single file they answer.
// No formatting decision and no vault rule live here.
import { basename, relative, resolve } from 'node:path';
import { assertAllowed, assertNoPositional, optionalOption } from './args.mjs';
import { slugify } from './slug.mjs';
import { reportModel } from './report-model.mjs';
import { renderMap } from './report-svg.mjs';
import { readState, readCell, mapFile, writeMap } from './state.mjs';

/** @typedef {import('./types.mjs').ParsedArgs} ParsedArgs */
/** @typedef {import('./types.mjs').CommandResult} CommandResult */

/** A path to SHOW: relative to the root, forward slashes, never absolute. An absolute path
 * in output ends up quoted in a log entry or a test fixture, and the leaks gate is right to
 * refuse it. @type {(root: string, file: string) => string} */
const shown = (root, file) => (relative(root, file) || basename(file)).replaceAll('\\', '/');

/**
 * `--out` is resolved against the project ROOT, not the shell's current directory, so the
 * command answers the same file wherever it is run from; the default is
 * `vault/state/map.svg`. The project name in the header is the basename of the root and
 * never the path: the human knows where their project is, and a generated file that
 * carries an absolute path is a leak.
 * @param {string} root @param {ParsedArgs} args @returns {CommandResult}
 */
export function cmdReport(root, { positional, options }) {
  assertAllowed(options, ['root', 'out'], 'report');
  assertNoPositional(positional, 'report');
  const out = optionalOption(options, 'out', 'report');
  const file = out === undefined ? mapFile(root) : resolve(root, out);
  const st = readState(root);
  const model = reportModel({
    project: basename(root),
    rows: st.indexRows,
    logEntries: st.logEntries,
    operation: st.operation,
    cells: st.indexRows.flatMap((r) => readCell(root, r.slug || slugify(r.name)) ?? []),
    logText: st.logText,
    indexText: st.indexText,
    operationTexts: st.operationTexts,
    parkingLotText: st.parkingLotText,
  });
  const svg = renderMap(model);
  writeMap(file, svg);
  const t = model.totals;
  return {
    lines: [
      `Map written to ${shown(root, file)} · ${svg.length} bytes · `
        + `source sha256:${model.fingerprint.slice(0, 12)}`,
      `${t.active} active · ${t.paused} paused · ${t.planned} planned · ${t.done} done · `
        + `${t.logEntries} log entries · ${model.waiting.length} waiting on the human`,
    ],
  };
}
