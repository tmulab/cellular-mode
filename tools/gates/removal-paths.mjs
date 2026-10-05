// removal-paths.mjs — WHAT each optional module IS, as data.
//
// The removal rehearsal next door is the algorithm: copy the repository, delete a module, run
// everything there. This file is the definition it deletes, and the two are apart for the
// reason `rules.mjs` is apart from `boundaries.mjs`: a reviewer who wants to know whether the
// documented file set still matches the repository should read a list, not a walker.
//
// Adding a file to an optional module without adding it here makes the rehearsal weaker, which
// is why the rehearsal prints the set it deleted and FAILS when a listed path is already
// absent: a stale entry is a silent hole. The one exception is `pending`, below.

/** @typedef {{ name: string, label: string, claim: string, paths: ReadonlyArray<string>,
 *   pending: ReadonlyArray<string>, dropScripts: ReadonlyArray<string> }} RemovableModule */

/**
 * THE DOCUMENTED ADAPTIVE FILE SET — what "the adaptive module" means (AD29).
 * @type {ReadonlyArray<string>}
 */
export const ADAPTIVE_PATHS = Object.freeze([
  'adaptive',
  'tools/adaptive',
  'skills/mode',
  'adapters/claude-code/settings.adaptive.json',
  'eip/plugins/adaptive-preferences',
  'eip/plugins/adaptive-preferences-contract.test.mjs',
  'eip/plugins/adaptive-preferences-fixture.mjs',
  'eip/plugins/adaptive-preferences-http.test.mjs',
  'eip/plugins/adaptive-preferences.test.mjs',
  'eip/host/adaptive-read-port.mjs',
  'eip/host/adaptive-read-port.test.mjs',
  'tests/adaptive-integration.test.mjs',
  'tests/gates-adaptive-boundary.test.mjs',
  'apps/observer/tests/mode-invariant.test.mjs',
  'apps/observer/tests/mode-view.test.mjs',
  ...['tired', 'ready', 'focus', 'explore', 'modocansado', 'modoestoubem', 'modofoco', 'modoexplorar']
    .flatMap((name) => [
      `.claude/skills/${name}`,
      `adapters/claude-code/.claude/skills/${name}`,
    ]),
]);

/**
 * THE DOCUMENTED PROMPT BUILDER FILE SET — what "the Builder" means (PB3).
 *
 * The same definition the boundary rule `prompt-builder-is-optional-and-isolated` states as an
 * import direction, written here as the files that go away. `tests/gates-builder-boundary.test.mjs`
 * is on the list for the reason `tests/gates-adaptive-boundary.test.mjs` is on the other one:
 * it asserts things about the real Builder directory, so it is part of the module, not part of
 * the repository that must survive without it.
 * @type {ReadonlyArray<string>}
 */
export const BUILDER_PATHS = Object.freeze([
  'tools/prompt-builder',
  'prompt-builder',
  'skills/builder',
  'docs/11-prompt-builder.md',
  'examples/prompt-builder',
  'tests/gates-builder-boundary.test.mjs',
  'PROMPT_BUILDER_REPORT.md',
  ...['builder', 'construtor'].flatMap((name) => [
    `.claude/skills/${name}`,
    `adapters/claude-code/.claude/skills/${name}`,
  ]),
]);

/**
 * The Builder's documented paths that belong to a CONCURRENT cell of the same stage — the
 * stage report, written outside this cell. It is listed because the definition of the module
 * has to be complete, and it is listed HERE rather than above because the strict "already
 * absent means the list is stale" check would otherwise fail on work that has not landed yet.
 * A pending path is deleted when present and reported as PENDING when absent; it is the one
 * documented hole in the set, and it closes by moving the name into `BUILDER_PATHS` once the
 * documentation cell is recorded. (`docs/11-prompt-builder.md` started here and was promoted
 * the moment the file existed, which is the whole lifecycle of an entry on this list.)
 * @type {ReadonlyArray<string>}
 */
export const BUILDER_PENDING = Object.freeze([]);

/**
 * The modules a rehearsal can be asked to remove. `dropScripts` names the `package.json`
 * scripts that go away WITH the module — a convenience name pointing at a deleted entry point
 * is not a dependency, but leaving it there would make the copy describe a command it cannot
 * run, and `tests/gates-deps.test.mjs` checks the script set exactly.
 * @type {Readonly<Record<string, RemovableModule>>}
 */
export const MODULES = Object.freeze({
  adaptive: Object.freeze({
    name: 'adaptive',
    label: 'Cellular Adaptive',
    claim: 'AD29',
    paths: ADAPTIVE_PATHS,
    pending: Object.freeze([]),
    dropScripts: Object.freeze([]),
  }),
  builder: Object.freeze({
    name: 'builder',
    label: 'Cellular Prompt Builder',
    claim: 'PB3',
    paths: BUILDER_PATHS,
    pending: BUILDER_PENDING,
    dropScripts: Object.freeze(['builder']),
  }),
});

/** The module a name asks for, or a refusal naming the ones that exist.
 * @param {string} name @returns {RemovableModule} */
export function moduleByName(name) {
  const found = MODULES[name];
  if (found === undefined) {
    throw new Error(`unknown module "${name}": this rehearsal knows ${Object.keys(MODULES).join(', ')}`);
  }
  return found;
}
