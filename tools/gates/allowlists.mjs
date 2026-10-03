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
 * What an `eip/plugins/adaptive-*` plugin may import beyond the SDK and its own directory.
 *
 * Same reasoning as the list above, applied to the OPTIONAL adaptive module: the plugin reports
 * a declared mode and its temporal standing, and a second implementation of "is this declaration
 * still valid" would be a second answer to a question that has exactly one. So it may import the
 * PURE modules of `tools/adaptive` — and only these four, each checked by hand: none of them
 * touches the filesystem, the clock, the environment or the process (`validity.mjs` takes `now`
 * as a parameter, which is why it is on the list at all).
 *
 * Everything NOT on the list stays a violation, in particular:
 *   tools/adaptive/io.mjs ......... the only module that touches disk, and it WRITES
 *   tools/adaptive/main.mjs ....... the CLI's command dispatch: reads, writes, exit codes
 *   tools/adaptive/cli.mjs ........ the entry point; running it is a process decision
 *   tools/adaptive/hook.mjs ....... reads stdin, writes state, reports to Claude Code
 *   tools/adaptive/context.mjs .... assembles the agent block from policy files on disk
 *   tools/adaptive/commands.mjs,
 *   tools/adaptive/transitions.mjs,
 *   tools/adaptive/errors.mjs ..... the CLI's own vocabulary, not a reader's
 * The arrow stays one-way in the other direction too: `tools/adaptive` may not import `eip/`
 * (see `cellular-mode-is-runtime-independent`), and no `observer-*` plugin may import
 * `tools/adaptive` at all (see `adaptive-is-optional-and-isolated`), so deleting the adaptive
 * module leaves the Observer whole.
 * @type {ReadonlyArray<string>}
 */
export const ADAPTIVE_PURE_IMPORTS = Object.freeze([
  'tools/adaptive/modes.mjs',
  'tools/adaptive/schema.mjs',
  'tools/adaptive/types.mjs',
  'tools/adaptive/validity.mjs',
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
