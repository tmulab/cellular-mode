// cli-shared.mjs — the vocabulary the Builder's CLI is written in: the exit table, the clock,
// the path scrubber, the flag reader and the two helpers every command needs.
//
// ONE EXIT TABLE, AS DATA. The Builder raises typed refusals (`errors.mjs` CODES) and a CLI has
// to turn each of them into a number. Deciding that at every throw site is how two refusals of
// the same kind acquire two different exit codes, so the mapping lives here and is read in
// exactly one place (`main.mjs`). The numbers mirror tools/cellmode: 0 ok · 1 usage/bad args ·
// 2 findings · 3 refused because of state that already exists · 5 human confirmation required.
// `cli.test.mjs` asserts the table covers every code the Builder can raise.
//
// NO ABSOLUTE PATH EVER LEAVES THIS CLI. `scrub` is applied to every line `main.mjs` writes,
// stdout and stderr alike. A message naming a machine path would put it in a terminal, a log
// and whatever the human pastes next — which is the one thing `publication.mjs` exists to keep
// out of the documents the Builder writes, so the terminal obeys the same rule.
import { sep } from 'node:path';
import { parseArgs } from '../cellmode/args.mjs';
import { now } from '../cellmode/clock.mjs';
import { slugify } from '../cellmode/slug.mjs';
import { STATUSES, entry } from './contract-shape.mjs';
import { BuilderError, CODES } from './errors.mjs';
import { entriesAt, setField } from './fields.mjs';
import { MODES } from './questions.mjs';
import { readDraft } from './store.mjs';
import { FIELD_KINDS } from './validate-parts.mjs';

/** @typedef {import('./types.mjs').Draft} Draft */
/** @typedef {import('./types.mjs').ProjectContract} ProjectContract */
/** @typedef {{ lines?: string[], notes?: string[], code?: number }} BuilderCommandResult */

export const EXIT = Object.freeze({
  OK: 0, USAGE: 1, FINDINGS: 2, REFUSED: 3, NEEDS_CONFIRMATION: 5,
});

/** Every `CODES` value, with the exit it earns. @type {Readonly<Record<string, number>>} */
export const EXIT_FOR = Object.freeze({
  SECRET_LIKE: EXIT.USAGE,
  ABSOLUTE_PATH: EXIT.USAGE,
  UNKNOWN_QUESTION: EXIT.USAGE,
  BAD_ENTRY: EXIT.USAGE,
  OUTSIDE_ROOT: EXIT.USAGE,
  UNKNOWN_DECISION: EXIT.USAGE,
  ALREADY_DECIDED: EXIT.USAGE,
  UNKNOWN_ADAPTER: EXIT.USAGE,
  ADAPTER_NOT_IMPLEMENTED: EXIT.USAGE,
  BAD_DRAFT: EXIT.FINDINGS,
  BAD_CONTRACT: EXIT.FINDINGS,
  NOT_READY: EXIT.FINDINGS,
  PUBLICATION_CHECK: EXIT.FINDINGS,
  UNSAFE_EXPORT: EXIT.FINDINGS,
  NOT_APPROVED: EXIT.FINDINGS,
  CELL_EXISTS: EXIT.REFUSED,
  NEEDS_CONFIRMATION: EXIT.NEEDS_CONFIRMATION,
});

/** The options that are present-or-absent rather than key-and-value. cellmode's own parser
 * knows only `--confirm`, so the rest are rewritten to `--x=true` before it sees them: one
 * parser, no second opinion about what an option looks like. */
export const FLAGS = Object.freeze(['confirm', 'accept', 'draft', 'replace-draft']);

/** @param {string[]} argv @returns {import('../cellmode/types.mjs').ParsedArgs} */
export function parseBuilderArgs(argv) {
  return parseArgs(argv.map((token) => (
    token.startsWith('--') && FLAGS.includes(token.slice(2)) ? `${token}=true` : token
  )));
}

/** @param {Record<string, unknown>} options @param {string} key @returns {boolean} */
export function flag(options, key) {
  return options[key] === true || options[key] === 'true';
}

/** PURE. `text` with every spelling of `root` replaced by `.`.
 * @param {unknown} text @param {string} root @returns {string} */
export function scrub(text, root) {
  const absolute = String(root ?? '');
  if (absolute === '') return String(text);
  return String(text)
    .split(absolute).join('.')
    .split(absolute.split(sep).join('/')).join('.');
}

/** The ISO-8601 instant a decision or an approval records. `CELLMODE_NOW` is honoured, so a
 * test and an example produce the same bytes twice.
 * @param {NodeJS.ProcessEnv} [env] @returns {string} */
export function instant(env = process.env) {
  const fixed = env.CELLMODE_NOW;
  if (fixed === undefined || String(fixed).trim() === '') return new Date().toISOString();
  return `${now(env).replace(' ', 'T')}:00.000Z`;
}

/** The declared mode, or a refusal. A bad value is never a silent `ready`: a mode is declared
 * by the human, and quietly ignoring the word they typed is a different session.
 * @param {Record<string, unknown>} options @returns {string} */
export function resolveMode(options) {
  if (options.mode === undefined) return 'ready';
  const name = String(options.mode);
  if (!MODES.includes(name)) {
    throw new BuilderError(
      CODES.BAD_ENTRY,
      `--mode is one of ${MODES.join(', ')} — got "${name}"; a mode is declared, never inferred`,
    );
  }
  return name;
}

/** PURE. One line counting every entry by epistemic label, in the constitution's order.
 * @param {unknown} contract @returns {string} */
export function labelCounts(contract) {
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const path of Object.keys(FIELD_KINDS)) {
    for (const item of entriesAt(/** @type {ProjectContract} */ (contract), path)) {
      if (item.status in counts) counts[item.status] = (counts[item.status] ?? 0) + 1;
    }
  }
  return STATUSES.map((status) => `${counts[status] ?? 0} ${status}`).join(' · ');
}

/** PURE. `contract` with the project named and slugged in cellmode's own form.
 * @param {ProjectContract} contract @param {unknown} name @returns {ProjectContract} */
export function withName(contract, name) {
  const clean = String(name ?? '').trim();
  if (clean === '') throw new BuilderError(CODES.BAD_ENTRY, '--name needs a project name');
  const slug = slugify(clean);
  if (slug === '') {
    throw new BuilderError(CODES.BAD_ENTRY, `"${clean}" has no letters or digits to build a slug from`);
  }
  return setField(
    setField(contract, 'identity.name', entry(clean, 'DECLARED')),
    'identity.slug',
    slug,
  );
}

/** The open discovery draft, or a refusal naming the command that creates one.
 * @param {string} root @returns {Draft} */
export function requireDraft(root) {
  const draft = readDraft(root);
  if (draft === null) {
    throw new BuilderError(
      CODES.BAD_ENTRY,
      'there is no discovery draft yet — run `start new` or `start existing` first',
    );
  }
  return draft;
}
