// usage.mjs — the help text and the profile prompt, as data.
//
// Separated from dispatch for one reason: this text is the CONTRACT a human reads before they let a
// tool write into their repository, and it belongs where it can be read, reviewed and diffed on its
// own, not interleaved with argument parsing. Every list in it is derived — the profile names, the
// render modes, the approval ids — so the help can never drift from what the code accepts.
import { APPROVAL_NAMES, approvalLines } from './approvals.mjs';
import { PROFILES, PROFILE_NAMES } from './profiles.mjs';
import { RENDER_MODES } from './render-plan.mjs';

export const USAGE = `bootstrap — install a coherent subset of Cellular Mode into another project.

Usage: node tools/bootstrap/cli.mjs <command> [options]

Commands:
  new <target-dir>        install the method into a project that does not have it yet
      --profile <name>    ${PROFILE_NAMES.join(' | ')} | custom   (required: nothing is guessed)
      --components a,b    the exact components, for --profile custom
      --dry-run           render the plan and write nothing at all
      --confirm           actually install; without it the plan is shown and the exit is 5
      --approve a,b       the consequential steps you approve (see below)
      --mode <name>       ${RENDER_MODES.join(' | ')} — wording and verbosity only, never a file
      --verbose           print every path instead of a capped list
      --mandatory a,b     the discovered check ids a human approves as MANDATORY for final
                          verification in the target (needs --confirm; existing only)
  existing <target-dir>   adopt the method into a codebase that already exists
      --analyze           print the Adoption Compatibility Report and stop; writes NOTHING
      --json              with --analyze, print the report as JSON instead of text
      --profile <name>    install: same profiles, same approvals as new
      --save-report       on the install path only, save the report to git-ignored scratch
      --dry-run --confirm --approve --mode --verbose   as for new
  status <target-dir>     installed version, components, drift and the next action. Writes NOTHING.
                          Exit 0 healthy · 2 drift or a partial install · no record here: 0
  uninstall <target-dir>  remove what Bootstrap created, and only that
      --dry-run           print the plan and remove nothing at all
      --confirm           perform the plan; without it the plan is shown and the exit is 5
      --force-modified a,b  delete these recorded files DESPITE local changes (needs --confirm).
                          Without it a modified file is kept and reported, never deleted.
  help                    this text

Approval ids for --approve:
${approvalLines().join('\n')}

The target directory must already exist: Bootstrap never creates the root. It never replaces a
file, never edits a workflow, and never activates a cell — a first cell is created planned (📋)
and the human opens it.

Exit codes: 0 ok · 1 usage/bad args · 2 validation, drift or analysis findings
            3 refused because of state that already exists · 5 human confirmation required`;

/** The profile list a human sees when they did not choose one. @returns {string[]} */
export function profileLines() {
  return [
    'Choose a profile — nothing is installed by default:',
    '',
    ...PROFILE_NAMES.map((name) => `  --profile ${name.padEnd(10)}${PROFILES[name]?.description ?? ''}`),
    `  --profile ${'custom'.padEnd(10)}Exactly the components you list with --components a,b.`,
    '',
    `Then add --dry-run to see the plan, or --confirm to install it. --approve takes: ${APPROVAL_NAMES.join(', ')}.`,
  ];
}

