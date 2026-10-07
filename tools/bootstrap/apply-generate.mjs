// apply-generate.mjs — what a `generate` action actually produces, as bytes. PURE given the
// SOURCE reader: it decides content and never touches the target, which is what keeps `writer.mjs`
// the only module that writes.
//
// One template name, one function, no fall-through: a `generate` action whose template nobody
// implements is a BAD_MANIFEST refusal rather than an empty file. An empty AGENTS.md would be the
// worst possible outcome of an install, because it looks installed.
//
// `vault/state/` is not generated here in any real sense — it is `skeletonFiles()` from
// tools/cellmode, the ONE definition of the empty cell state in this repository. Re-authoring it
// would create a second skeleton that drifts from the first, and `cellmode check` would then
// disagree with the files Bootstrap wrote.
import { skeletonFiles } from '../cellmode/skeleton.mjs';
import { CODES, refuse } from './errors.mjs';
import { PLANNER } from './plan-constants.mjs';
import { installedLines, renderTemplate } from './templates.mjs';
import { blockFor } from './writer.mjs';

/** @typedef {import('./plan-actions.mjs').Action} Action */
/** @typedef {{ rel: string, bytes?: string, dir?: boolean }} Generated */
/** `contract` is the bytes of a `vault/verification.json` built from what adoption ESTABLISHED
 * about the target (`verification.mjs`), or `null` when the flow established nothing and the
 * template's empty contract is the honest answer.
 * @typedef {{ read: (rel: string) => string, projectName: string,
 *   chosen: ReadonlySet<string>, contract?: string | null }} GenerateContext */

/** The managed-block templates: a path whose file ALREADY exists gets the short pointer block,
 * never the full document. One mapping, read in one place. */
export const BLOCK_TEMPLATE = Object.freeze({ 'agents-md': 'agents-block', 'gitignore-block': 'gitignore-block' });

/** The Claude Code pointers the adapter generates, and the component each one needs. A pointer to
 * a skill that was not installed would be a pointer to nothing, so the list is filtered. */
const POINTERS = Object.freeze([
  Object.freeze({
    component: 'method-core', dir: 'cell', skill: 'skills/cell/SKILL.md', name: 'cell',
    description: 'Open, resume or close a cell of work. Use at session start and whenever the human asks to continue or to record where things are.',
  }),
  Object.freeze({
    component: 'method-core', dir: 'pause', skill: 'skills/pause/SKILL.md', name: 'pause',
    description: 'Run the pause ritual. Use only when the human explicitly asks to stop or to note things down.',
  }),
  Object.freeze({
    component: 'adaptive', dir: 'mode', skill: 'skills/mode/SKILL.md', name: 'mode',
    description: 'Apply a working mode the human declared. Never infer one, and never let it change a gate, an approval or a test.',
  }),
]);

/** @param {string} rel @returns {string} */
const dirOf = (rel) => rel.replace(/\/+$/, '');

/** PURE given `read`. The files one generate action produces. A `dir: true` entry is a directory
 * to create and nothing else; `install-manifest` produces nothing here because it is written last,
 * after every other write has succeeded.
 * @param {Action} action @param {GenerateContext} ctx @returns {ReadonlyArray<Generated>} */
export function generateFor(action, ctx) {
  const template = String(action.template ?? '');
  const values = { projectName: ctx.projectName, optionalLines: installedLines(ctx.chosen) };
  switch (template) {
    case 'agents-md':
      return [{ rel: action.path, bytes: renderTemplate('agents-md', values, ctx.read) }];
    case 'verification-contract':
      // The generated contract wins when there is one: a template that claimed no checks exist
      // would contradict the baseline run that found them.
      return [{ rel: action.path, bytes: ctx.contract === undefined || ctx.contract === null
        ? renderTemplate('verification-contract', values, ctx.read) : ctx.contract }];
    case 'vault-skeleton': {
      const base = dirOf(action.path);
      return Object.entries(skeletonFiles())
        .map(([name, bytes]) => ({ rel: `${base}/${name}`, bytes }))
        .sort((a, b) => (a.rel < b.rel ? -1 : 1));
    }
    case 'bootstrap-scratch':
      return [{ rel: action.path, dir: true }];
    case 'gitignore-block':
      return [{ rel: action.path, bytes: blockFor(action.component, renderTemplate('gitignore-block', values, ctx.read), 'hash') }];
    case 'claude-pointer': {
      const base = dirOf(action.path);
      return POINTERS.filter((pointer) => ctx.chosen.has(pointer.component)).map((pointer) => ({
        rel: `${base}/${pointer.dir}/SKILL.md`,
        bytes: renderTemplate('claude-pointer', {
          name: pointer.name, description: pointer.description, skill: pointer.skill,
        }, ctx.read),
      }));
    }
    case 'install-manifest':
      return [];
    default:
      throw refuse(CODES.BAD_MANIFEST, `no generator for template "${template}"`, { path: action.path });
  }
}

/** PURE given `read`. The text of the managed block an action would append to an existing file.
 * @param {Action} action @param {GenerateContext} ctx @returns {string} */
export function blockTextFor(action, ctx) {
  const table = /** @type {Readonly<Record<string, string | undefined>>} */ (BLOCK_TEMPLATE);
  const name = table[String(action.template ?? '')];
  if (name === undefined) {
    throw refuse(CODES.UNMERGEABLE, `Bootstrap has no managed block to append to ${action.path}`, { path: action.path });
  }
  return renderTemplate(name, { projectName: ctx.projectName, optionalLines: installedLines(ctx.chosen) }, ctx.read);
}

/** PURE. The component a managed block is recorded under. The planner's own files are marked with
 * `PLANNER` so that a later uninstall can tell "Bootstrap itself wrote this" from "a component
 * did". @param {Action} action @returns {string} */
export function blockOwner(action) {
  return action.component === PLANNER ? PLANNER : action.component;
}
