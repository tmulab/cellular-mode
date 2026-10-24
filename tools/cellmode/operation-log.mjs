// operation-log.mjs — the log entry of an OPERATION closure (opening, pause,
// completion). PURE: it renders the block that `state.appendLogText` appends verbatim.
//
// The heading is `## <stamp> · Operation: <name>`, deliberately NOT the `· Cell: <name>`
// shape `log.mjs` parses: `parseLog` therefore ignores these entries instead of reading
// one as a cell closure, and `check.mjs` — which knows nothing about operations — stays
// green on a log that carries both. The fingerprint is repeated in every entry so a
// moved finish line is visible in the record itself (docs/03 §1, §3).
import { oneLine } from './fields.mjs';
import { renderFinishLine, renderPack, NONE } from './operation-file.mjs';

/** @typedef {import('./types.mjs').Operation} Operation */

/** @type {(label: string, value: unknown) => string[]} */
const optional = (label, value) => (oneLine(value, '') === ''
  ? [] : [`**${label}:** ${oneLine(value)}`]);

/**
 * One operation entry. `facts`, `next` and `spend` are omitted when empty, so an
 * opening carries the frozen finish line and nothing it cannot yet know.
 * @param {Operation} op @param {{ timestamp: string, facts?: unknown, next?: unknown,
 *   spend?: unknown }} entry @returns {string}
 */
export function renderOperationEntry(op, entry) {
  const lines = [
    '---',
    `## ${entry.timestamp} · Operation: ${oneLine(op.name, 'unnamed')}`,
    `**Status:** ${oneLine(op.status, '🔵')}`,
    ...optional('Facts', entry.facts),
    `**Finish line:** ${renderFinishLine(op.finishLine)}`,
    `**Fingerprint:** ${oneLine(op.fingerprint, NONE)}`,
    `**Pack:** ${renderPack(op.pack)}`,
    `**Quality bar:** ${oneLine(op.qualityBar, NONE)}`,
    `**Planned cells:** ${op.plannedCells.length ? op.plannedCells.join(', ') : NONE}`,
    ...optional('Next step', entry.next),
    ...optional('Spend so far', entry.spend),
  ];
  return `\n${lines.join('\n')}\n`;
}
