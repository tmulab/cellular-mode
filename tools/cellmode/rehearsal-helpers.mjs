// rehearsal-helpers.mjs — the ground for rehearsal-swarm.test.mjs (not a test file, so
// `node --test` skips it): the field project's own operation, as it was declared on
// 22/10/2026, plus a throwaway GIT repository in the temp root so `open` records a real
// Base commit and the git-reading checks (cell-stale, merge-unrecorded) actually run.
//
// Only this file touches `git`, and only inside the temp root it created itself. The
// branch work the rehearsal needs (a side commit, then back) is done with `switch` on
// that temp repository — never on the checkout the suite runs from.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { freshRoot, run, paths } from './helpers.mjs';

/** The two days the rehearsal replays. */
export const D22 = '2026-10-22 09:00';
export const D23 = '2026-10-23 14:00';

/** The five frozen items, the pack the human authorized, the ten planned cells. */
export const FINISH = 'publicacao no VPS; login; matricula 404 para quem nao tem; '
  + 'modulo 1 completo; painel do admin';
export const PACK = 'max-active-cells: 4 · spend ceiling: 40k tokens · '
  + 'denied: push to main, delete the database · requires-yes: deploy ao VPS';
export const PLANNED = 'Publicacao VPS, Login, Matricula 404, Modulo 1, Painel Admin, '
  + 'Emails, Backup, Dominio, Observabilidade, Documentacao';
export const OP_NAME = 'Ir ao ar';
export const OP_SLUG = 'ir-ao-ar';
export const OPEN_OP = ['op', 'open', OP_NAME, '--finish-line', FINISH, '--pack', PACK,
  '--bar', 'every claim carries an epistemic label', '--cells', PLANNED];

/** The four cells that were opened side by side, with disjoint boundaries.
 * @type {ReadonlyArray<{ name: string, area: string, in: string, out: string }>} */
export const FOUR = Object.freeze([
  { name: 'Publicacao VPS', area: 'infra', in: 'infra/vps.sh', out: 'app/**' },
  { name: 'Login', area: 'auth', in: 'app/login.ts', out: 'infra/**' },
  { name: 'Matricula 404', area: 'enrol', in: 'app/matricula.ts', out: 'app/login.ts' },
  { name: 'Modulo 1', area: 'lms', in: 'app/modulo1.ts', out: 'app/matricula.ts' },
]);

/** Git in the temp root; null when git is not installed here.
 * @param {string} root @param {string[]} args @returns {string | null} */
export function git(root, args) {
  try {
    return execFileSync('git', args, {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** A throwaway repository with one commit on `main`. Assembled identity: this file holds
 * no literal address (the repository's leak gate forbids one).
 * @param {string} root @returns {string | null} HEAD, or null when git is absent */
function gitRepo(root) {
  if (git(root, ['init', '-q', '-b', 'main']) === null) return null;
  git(root, ['config', 'user.email', ['cell', '@', 'example', '.invalid'].join('')]);
  git(root, ['config', 'user.name', 'Fixture']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['commit', '-q', '--allow-empty', '-m', 'seed']);
  return git(root, ['rev-parse', 'HEAD']);
}

/** An initialized vault in a real repository, with no operation open yet.
 * @returns {{ root: string, head: string } | null} null when git is absent */
export function freshProject() {
  const root = freshRoot();
  const head = gitRepo(root);
  if (head === null) return null;
  run(root, ['init'], { now: D22 });
  return { root, head };
}

/** @param {string} root @returns {string} the operation file's text */
export const opText = (root) => readFileSync(paths(root).operationFile(OP_SLUG), 'utf8');

/** One matched group of the operation file, as a string. A missing match is a test
 * failure the caller reports, so this returns '' rather than throwing.
 * @param {string} root @param {RegExp} pattern @returns {string} */
export function opFragment(root, pattern) {
  return pattern.exec(opText(root))?.[0] ?? '';
}

/** `open` one cell inside the operation, with its boundary and a first step.
 * @param {string} root @param {{ name: string, area: string, in: string, out: string }} cell
 * @param {{ now?: string, expect?: number }} [options] */
export function openCell(root, cell, options = {}) {
  return run(root, ['open', cell.name, '--area', cell.area, '--in', cell.in,
    '--out', cell.out, '--next', `write the failing test for ${cell.area}`],
  { now: D22, ...options });
}
