// check-git.mjs — the two findings of the guard that are facts about GIT rather than
// about the vault: a 🔵 cell whose `Base commit` is no longer an ancestor of HEAD, and a
// merge of an operation branch that no log entry mentions. The only process it starts is
// `git`, read-only, argv array, never a shell (same contract as
// `cell-in-operation-state.mjs`).
//
// FAIL CLOSED, IN TWO LAYERS — the decision of cell R5, recorded in the README:
//   · git cannot answer AT ALL (no binary, or the root is not a work tree, or the
//     repository has no commit): the two checks DID NOT RUN. That is UNKNOWN and is
//     reported as a NOTICE in the output — never silence, never a pass. It is not a
//     finding, because "there is no repository here" is a fact about the environment, not
//     about the vault: every vault in a plain directory would otherwise be permanently
//     red, with nothing its owner could fix.
//   · git CAN answer and the answer is UNKNOWN (a `Base commit` nobody recorded, a sha
//     git does not know): that gap IS the vault's own, and it IS a finding (exit 2).
import { execFileSync } from 'node:child_process';
import { oneLine } from './fields.mjs';
import { slugify } from './slug.mjs';
import { openingEntry, DONE } from './check-operation.mjs';

/** @typedef {import('./types.mjs').Finding} Finding */
/** @typedef {import('./types.mjs').Operation} Operation */
/** @typedef {import('./types.mjs').Cell} Cell */
/** @typedef {import('./check-operation.mjs').OperationEntry} OperationEntry */

export const GIT_CODES = { CELL_STALE: 'cell-stale', MERGE_UNRECORDED: 'merge-unrecorded' };

const ACTIVE = '🔵';
const SHA = /^[0-9a-f]{7,64}$/;
/** The branch shapes an operation merges: `op/<slug>` and `worktree-agent-<id>`. */
const BRANCH = /((?:op\/|worktree-agent-)[A-Za-z0-9._/-]+)/g;
const UNIT = '\u001f';

/** Read-only git. `null` means "git did not answer": not installed, not a repository, or
 * a non-zero exit (which is how `--is-ancestor` says no).
 * @param {string} root @param {string[]} args @returns {string | null} */
function git(root, args) {
  try {
    return execFileSync('git', args, {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000,
    });
  } catch {
    return null;
  }
}

/** PURE. The `op/…` / `worktree-agent-…` branch names a merge subject mentions, once each.
 * @param {unknown} subject @returns {string[]} */
export function branchNames(subject) {
  const hits = String(subject ?? '').match(BRANCH) ?? [];
  return [...new Set(hits.map((b) => b.replace(/['"),.]+$/, '')))];
}

/** PURE. Does the log mention this branch anywhere — a cell entry or an operation entry?
 * @param {unknown} logText @param {string} branch @returns {boolean} */
export function mentions(logText, branch) {
  return String(logText ?? '').toLowerCase().includes(branch.toLowerCase());
}

/** The 🔵 cells of one operation. @param {ReadonlyArray<Cell>} cells @param {Operation} op
 * @returns {Cell[]} */
const cellsOf = (cells, op) => cells.filter((c) => c.status === ACTIVE
  && slugify(oneLine(c.operation, '')) === op.id);

/**
 * Rule 5. A cell works from the commit it opened on; when that commit is not an ancestor
 * of HEAD the branch moved under it and the cell is stale. An unrecorded base commit is
 * the same answer by a different route: nobody can say where the work started.
 * @param {string} root @param {Operation} op @param {ReadonlyArray<Cell>} cells
 * @param {string} head @returns {Finding[]}
 */
function staleCells(root, op, cells, head) {
  /** @type {Finding[]} */
  const findings = [];
  const where = `is 🔵 in operation "${oneLine(op.name, 'unnamed')}"`;
  for (const cell of cellsOf(cells, op)) {
    const name = oneLine(cell.name, 'unnamed');
    const base = oneLine(cell.baseCommit, '').toLowerCase();
    if (!SHA.test(base)) {
      findings.push({
        code: GIT_CODES.CELL_STALE,
        message: `cell stale: "${name}" ${where} but its Base commit is `
          + `${base === '' ? 'missing' : oneLine(cell.baseCommit)} — the commit the work `
          + 'started from was never recorded, so staleness is UNKNOWN',
      });
    } else if (git(root, ['cat-file', '-e', `${base}^{commit}`]) === null) {
      findings.push({
        code: GIT_CODES.CELL_STALE,
        message: `cell stale: "${name}" ${where} but git does not know its Base commit `
          + `${base} — staleness is UNKNOWN`,
      });
    } else if (git(root, ['merge-base', '--is-ancestor', base, 'HEAD']) === null) {
      findings.push({
        code: GIT_CODES.CELL_STALE,
        message: `cell stale: "${name}" ${where} but its Base commit ${base} is not an `
          + `ancestor of HEAD ${head}`,
      });
    }
  }
  return findings;
}

/**
 * Rule 6. A merge of an `op/…` or `worktree-agent-…` branch that the log does not mention
 * is work that happened and was not recorded — rule 2 of the method, read from git. The
 * range starts at the operation's OPENING ENTRY, by timestamp: no commit is recorded for
 * an opening, and the entry's stamp is the fact that is (INFERRED, documented in README).
 * @param {string} root @param {Operation} op @param {ReadonlyArray<OperationEntry>} entries
 * @param {string} logText @returns {Finding[]}
 */
function unrecordedMerges(root, op, entries, logText) {
  const opening = openingEntry(entries, op.name);
  if (opening === null) return [];
  const out = git(root, ['log', '--merges', '--no-color', `--since=${opening.timestamp}`,
    `--format=%H${UNIT}%s`, 'HEAD']);
  if (out === null) return [];
  /** @type {Finding[]} */
  const findings = [];
  for (const line of out.split('\n').filter((l) => l.trim() !== '')) {
    const [commit = '', subject = ''] = line.split(UNIT);
    for (const branch of branchNames(subject)) {
      if (mentions(logText, branch)) continue;
      findings.push({
        code: GIT_CODES.MERGE_UNRECORDED,
        message: `merge unrecorded: commit ${commit.slice(0, 7)} merged "${branch}" after `
          + `operation "${oneLine(op.name, 'unnamed')}" opened (${opening.timestamp}) and no `
          + 'log entry mentions that branch',
      });
    }
  }
  return findings;
}

/**
 * The git half of the operation layer. `notice` is the UNKNOWN line (empty when git
 * answered): the caller prints it, because a notice belongs in the output and not in the
 * findings — see the two layers at the top of this file.
 * @param {{ root?: string, operations?: ReadonlyArray<Operation>,
 *   cells?: ReadonlyArray<Cell>, entries?: ReadonlyArray<OperationEntry>,
 *   logText?: string }} [input] @returns {{ findings: Finding[], notice: string }}
 */
export function checkGit({
  root = '', operations = [], cells = [], entries = [], logText = '',
} = {}) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {(why: string) => { findings: Finding[], notice: string }} */
  const unknown = (why) => ({
    findings,
    notice: `UNKNOWN: cell-stale and merge-unrecorded did not run — ${why}. This is not a `
      + 'pass: a gate that cannot run is UNKNOWN, never green (AGENTS.md).',
  });
  if (oneLine(git(root, ['rev-parse', '--is-inside-work-tree']), '') !== 'true') {
    return unknown('git is not installed here, or the project root is not a git work tree');
  }
  const head = oneLine(git(root, ['rev-parse', 'HEAD']), '').toLowerCase();
  if (!SHA.test(head)) return unknown('the repository has no commit yet, so there is no HEAD');
  for (const op of operations.filter((o) => o.status !== DONE)) {
    findings.push(...staleCells(root, op, cells, head));
    findings.push(...unrecordedMerges(root, op, entries, logText));
  }
  return { findings, notice: '' };
}
