// allowlists.mjs — the two import EXCEPTIONS of this architecture, as explicit lists.
//
// They live apart from `boundaries.mjs` for the reason the architecture itself gives: a rule
// and its exceptions are different things to review. The rules next door are a table a
// reviewer reads to learn how the layers are shaped; these two lists are decisions somebody
// made, each with a cost, and each name on them was checked by hand. A prefix would have been
// shorter and would have made the next addition invisible.
//
// Nothing here is a pattern. Adding a module means adding a line, in a file whose only job is
// to hold those lines.

/**
 * What an `eip/plugins/observer-*` plugin may import beyond the SDK and its own directory.
 *
 * The observer plugins read a Cellular Mode vault. Parsing it a second time would create two
 * parsers that disagree, and the one that drifts is always the one nobody runs; so an
 * `observer-*` plugin may import the PURE modules of `tools/cellmode` and the PURE gate
 * rules. "Pure" is the whole criterion and it is checked by hand, once, here: a module on
 * this list touches no filesystem, no clock, no environment and no process. Everything NOT on
 * the list stays a violation, in particular:
 *   tools/cellmode/state.mjs ...... the only module that touches vault files
 *   tools/cellmode/paths.mjs ...... builds absolute paths; the read PORT owns paths
 *   tools/cellmode/clock.mjs ...... reads process.env
 *   tools/cellmode/{cli,main,commands,transitions,args,errors,helpers,skeleton}.mjs
 *                                   the CLI: exit codes and lifecycle writes
 *   tools/gates/scan.mjs .......... the only gate module that reads disk
 *   tools/gates/git-head.mjs ...... reads .git as files
 *   tools/gates/{check-all,trilateral,typecheck}.mjs
 *                                   shells that spawn processes or read disk
 * The arrow still points one way: `tools/cellmode` may not import `eip/` (see
 * `cellular-mode-is-runtime-independent`), so the methodology stays usable in a repository
 * with no runtime in it.
 * @type {ReadonlyArray<string>}
 */
export const OBSERVER_PURE_IMPORTS = Object.freeze([
  'tools/cellmode/cell-file.mjs',
  'tools/cellmode/check.mjs',
  'tools/cellmode/deps.mjs',
  'tools/cellmode/fields.mjs',
  'tools/cellmode/index-table.mjs',
  'tools/cellmode/log.mjs',
  'tools/cellmode/projections.mjs',
  'tools/cellmode/slug.mjs',
  'tools/cellmode/types.mjs',
  'tools/gates/boundaries.mjs',
  'tools/gates/deps.mjs',
  'tools/gates/evidence.mjs',
  'tools/gates/exclusions.mjs',
  'tools/gates/release.mjs',
  'tools/gates/secrets.mjs',
  'tools/gates/size.mjs',
  'tools/gates/types.mjs',
]);

/**
 * What the HOST may import from `tools/gates`: three named modules, and no more.
 *
 * The host is the composition layer, so it is allowed to know all the parts — but
 * `tools/gates` is not one of "the parts": Cellular Mode must run in a repository with no
 * `eip/` in it, and the arrow between them was only ever drawn one way. Three facts force the
 * exception, and each is a fact about THIS REPOSITORY that two readers now need:
 *   exclusions.mjs .. what is not ours to read. The gates' list and the auditor's readable
 *                     surface must be the same set, or the auditor answers PASS on a file the
 *                     gates answer FAIL on.
 *   evidence.mjs ..... where the Trilateral record lives and what shape it has. The gate
 *                     writes it; the host's read port opens exactly that one path.
 *   git-head.mjs ..... which commit the tree is on, read as files and never spawned.
 * All three are leaves: they import nothing from `eip/`, nothing from `tools/cellmode`, and
 * two of them import nothing at all.
 * @type {ReadonlyArray<string>}
 */
export const HOST_GATE_IMPORTS = Object.freeze([
  'tools/gates/evidence.mjs',
  'tools/gates/exclusions.mjs',
  'tools/gates/git-head.mjs',
]);
