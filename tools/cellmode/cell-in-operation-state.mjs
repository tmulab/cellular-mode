// cell-in-operation-state.mjs — the two writes the in-operation cell transitions need
// and `state.mjs` does not already have: the BASE COMMIT (a fact about git, not about the
// vault) and the PACK AMENDMENT (an operation file plus its own log entry).
//
// It holds no filesystem call of its own: every vault write here COMPOSES a `state.mjs`
// function, so `state.mjs` stays the single module that touches vault files. The one
// process this module starts is `git rev-parse HEAD`, read-only, argv array, no shell.
import { execFileSync } from 'node:child_process';
import { slugify } from './slug.mjs';
import { oneLine } from './fields.mjs';
import { makeOperation, renderFinishLine, NONE } from './operation-file.mjs';
import { writeOperation, appendLogText } from './state.mjs';

/** @typedef {import('./types.mjs').Operation} Operation */

/** A commit is 40 hex characters; anything else is not an answer. */
const SHA = /^[0-9a-f]{7,64}$/;

/**
 * The sha the work starts from. UNKNOWN is a FACT and a guess is not: when git is not
 * installed, when the root is not a repository, or when the repository has no commit yet,
 * the field says `UNKNOWN` instead of inventing a base.
 * @param {string} root @returns {string}
 */
export function gitHead(root) {
  try {
    const out = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000,
    });
    const sha = oneLine(out, '').toLowerCase();
    return SHA.test(sha) ? sha : 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

/**
 * The amendment entry. Same `## <stamp> · Operation: <name>` heading as every operation
 * entry, so `parseLog` and `check` keep ignoring it, and it repeats the frozen finish line
 * and its fingerprint: an amendment that touched them would be visible in the record.
 * @param {Operation} op @param {string} cell @param {string} stamp @returns {string}
 */
export function renderAmendment(op, cell, stamp) {
  return `\n${[
    '---',
    `## ${stamp} · Operation: ${oneLine(op.name, 'unnamed')}`,
    `**Status:** ${oneLine(op.status, '🔵')}`,
    `**Pack amendment:** +cell ${cell}, approved by human`,
    `**Finish line:** ${renderFinishLine(op.finishLine)}`,
    `**Fingerprint:** ${oneLine(op.fingerprint, NONE)}`,
    `**Planned cells:** ${op.plannedCells.length ? op.plannedCells.join(', ') : NONE}`,
    '',
  ].join('\n')}`;
}

/**
 * Record the human's yes: the cell joins `Planned cells`, and NOTHING else moves. The
 * fingerprint and the finish line are carried over from the prior operation rather than
 * recomputed, so an amendment cannot become a quiet re-freezing of the finish line.
 * Log first (it is the truth), then the operation file.
 * @param {string} root @param {Operation} op @param {string} cellSlug @param {string} stamp
 * @returns {Operation} the amended operation
 */
export function amendPack(root, op, cellSlug, stamp) {
  const slug = slugify(cellSlug);
  const amended = makeOperation({
    ...op, plannedCells: [...op.plannedCells, slug], fingerprint: op.fingerprint,
  });
  appendLogText(root, renderAmendment(amended, slug, stamp));
  writeOperation(root, amended);
  return amended;
}
