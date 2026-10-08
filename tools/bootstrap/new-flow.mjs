// new-flow.mjs — `bootstrap new <target>`: install the method into a project that does not have
// it yet. The sequence is fixed, and every step before the last one writes nothing.
//
//   exists? → not overlapping the source? → scan (read-only) → does it LOOK new? → no install
//   already? → resolve → plan → render → and only then, with --confirm, apply.
//
// THE TARGET ROOT IS NEVER CREATED. `new <dir>` requires `<dir>` to exist, because `mkdir` of a
// mistyped path is how a tool scatters directories across somebody's machine, and because the
// human creating the directory is the cheapest possible proof that they meant that path.
//
// "LOOKS NEW" IS A WHITELIST, not a heuristic. A target may hold only the handful of things a
// project has before it has code — a README, a LICENSE, a spec, a `.git`, a `.gitignore`, docs,
// an already-written project contract. Anything else and `new` refuses with exit 3 and points at
// `existing --analyze`, which is the command that is allowed to reason about a real codebase.
//
// NO ABSOLUTE PATH IS EVER PRINTED. The target appears as its basename, everywhere, in every mode.
import { basename, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { expandSelection, loadCatalog } from './catalog.mjs';
import { CODES, refuse } from './errors.mjs';
import { diskSource, sourceIdentity } from './source-read.mjs';
import { scanTarget } from './target-scan.mjs';
import { resolveSelection } from './resolve.mjs';
import { buildPlan } from './plan.mjs';
import { consentRender, warningLines } from './plan-consent.mjs';
import { applyPlan } from './apply.mjs';
import { BUILDER_DRAFT_DIR, INSTALL_MANIFEST, VERIFICATION_FILE } from './plan-constants.mjs';
import { MAX_ACTIONABLE, plural, sanitize } from './display.mjs';
import { existingInstallRefusal } from './status-read.mjs';
import { assertNoOverlap } from './writer.mjs';

/** @typedef {{ lines: string[], code: number }} FlowResult */

/** Files a project may already have and still count as new. `docs/*.md` is allowed as a prefix
 * rule below; everything here is matched exactly. */
export const ALLOWED_NEW = Object.freeze(['README.md', 'README', 'LICENSE', 'LICENSE.md',
  'NOTICE', '.gitignore', '.gitattributes', 'spec.md', 'SPEC.md', 'contract.md', 'CONTRACT.md',
  'vault/project-contract.json',
  // An agent instruction file is something a project has BEFORE it has code, and it is exactly
  // the file Bootstrap knows how to extend with a managed block instead of replacing.
  'AGENTS.md', 'CLAUDE.md']);

/** PURE. The existing files that stop a directory from counting as new, sorted and capped.
 * `vault/builder/**` never stops anything (contract H1, trial finding A-01): it is the Prompt
 * Builder's private draft, the documented step BEFORE `new`, and refusing over it broke the one
 * path docs/12 recommends. `target-scan.mjs` does not even walk it, so this is belt and braces.
 * @param {ReadonlyArray<string>} files @returns {ReadonlyArray<string>} */
export function notNewBecause(files) {
  return Object.freeze(files.filter((rel) => !ALLOWED_NEW.includes(rel)
    && !rel.startsWith(BUILDER_DRAFT_DIR)
    && !(rel.startsWith('docs/') && rel.endsWith('.md'))).sort());
}

/** The source checkout's own name, version and commit. It lives in `source-read.mjs` — the one
 * module that reads the source — and is re-exported here, where it is used. */
export { sourceIdentity };

/**
 * PURE of any target I/O: the catalog, the resolved selection and the plan for one set of target
 * facts. Shared by `new` and by `existing` so that both commands plan through exactly the same
 * code — a second planner would be a second set of safety decisions to keep in agreement.
 * @param {{ sourceRoot: string, facts: import('./target-facts.mjs').TargetFacts, profile: string,
 *   components?: ReadonlyArray<string> | undefined }} input
 * @returns {{ source: import('./source-read.mjs').Source, plan: import('./plan.mjs').Plan,
 *   componentVersions: Record<string, string> }}
 */
export function preparePlan(input) {
  const source = diskSource(input.sourceRoot);
  const catalog = loadCatalog(input.sourceRoot, source);
  if (!catalog.ok) {
    throw refuse(CODES.BAD_MANIFEST, `the component catalog did not load: ${catalog.errors.length} error(s)`,
      { errors: catalog.errors.map((error) => `${error.path}: ${error.message}`) });
  }
  const request = input.components === undefined
    ? { profile: input.profile }
    : { profile: input.profile, components: input.components };
  const selection = resolveSelection(catalog, request, input.facts);
  // ONE place decides what an unavailable component does, and it refuses (COMPONENT_UNAVAILABLE):
  // a profile is never quietly downgraded to the components this checkout happens to hold.
  const expanded = expandSelection(catalog.byId, selection.components.map(({ id }) => id), source);
  return {
    source,
    plan: buildPlan({ catalog, selection, facts: input.facts, expanded }),
    componentVersions: Object.fromEntries(catalog.components
      .map((component) => [String(component.id), String(component.componentVersion)])),
  };
}

/** The target directory, or a USAGE refusal. Bootstrap never creates the root: a `mkdir` of a
 * mistyped path is how a tool scatters directories across somebody's machine.
 * @param {string} targetArg @returns {string} */
export function requireExistingDirectory(targetArg) {
  const root = resolve(targetArg);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw refuse(CODES.USAGE,
      `the target directory does not exist: create it yourself, then run new again (Bootstrap never creates the root)`,
      { target: basename(root) });
  }
  return root;
}

/** The summary printed after a successful install. Counts and relative paths only.
 * @param {import('./apply.mjs').ApplyResult} result @param {string} name
 * @param {string[]} warnings @returns {string[]} */
function summaryLines(result, name, warnings) {
  /** @type {string[]} */
  const out = [`Installed Cellular Mode into ${sanitize(name)}.`, ''];
  out.push(`Files written: ${plural(result.files.length, 'file')}`);
  out.push(`Install record: ${INSTALL_MANIFEST}`);
  out.push('', 'Integrations:');
  for (const entry of result.integrations) out.push(`  - ${entry.kind} [${entry.status}] ${sanitize(entry.detail, 200)}`);
  if (result.limitations.length > 0) {
    out.push('', `Not applied (${result.limitations.length}) — recorded in the install manifest:`);
    // IN FULL. A limitation names a command the human has to run; truncating it mid-command
    // (trial finding A-13) turns an instruction into a riddle.
    for (const line of result.limitations) out.push(`  - ${sanitize(line, MAX_ACTIONABLE)}`);
  }
  out.push(...warnings);
  out.push('', `First cell: ${sanitize(result.cell.detail, 200)}`);
  out.push('', `Verification contract: ${VERIFICATION_FILE} — EMPTY on purpose: Bootstrap ran nothing here,`,
    '  so it established nothing. `node tools/gates/verify-final.mjs` FAILS CLOSED until you run a check yourself and record it there.');
  out.push('', 'Not activated. To start: node tools/cellmode/cli.mjs open <name> (or /cell)');
  return out;
}

/**
 * Runs `new`. Returns lines and an exit code; it never calls `process.exit`, so the whole flow is
 * testable in process — the arrangement tools/cellmode and tools/prompt-builder already use.
 * @param {{ sourceRoot: string, targetArg: string, profile: string,
 *   components?: ReadonlyArray<string> | undefined, approvals: ReadonlySet<string>,
 *   dryRun?: boolean | undefined, confirm?: boolean | undefined, json?: boolean | undefined,
 *   mode?: import('./render-plan.mjs').RenderMode | undefined, verbose?: boolean | undefined,
 *   mandatory?: ReadonlyArray<string> | undefined,
 *   now: string, env?: NodeJS.ProcessEnv | undefined,
 *   firstCell?: typeof import('./compose-builder.mjs').installFirstCell | undefined }} input
 * @returns {FlowResult}
 */
export function runNew(input) {
  const targetRoot = requireExistingDirectory(input.targetArg);
  const name = basename(targetRoot);
  assertNoOverlap(input.sourceRoot, targetRoot);
  const scan = scanTarget(targetRoot, { env: input.env });
  if (scan.facts.hasInstallManifest) {
    // The refusal NAMES the classification (healthy, drift, partial) and the next action, so the
    // human is told what this target is rather than invited to guess — and never offered a reinstall.
    throw existingInstallRefusal({ targetRoot, sourceRoot: input.sourceRoot, env: input.env });
  }
  // `new` runs nothing and discovers nothing, so it can establish no check to make mandatory.
  if ((input.mandatory ?? []).length > 0) {
    throw refuse(CODES.USAGE, '--mandatory needs a discovered check, and new discovers none: install, run your own checks, then approve them in vault/verification.json (or adopt with existing)', { unknown: [...(input.mandatory ?? [])] });
  }
  const blocking = notNewBecause(scan.facts.existingFiles);
  if (blocking.length > 0) {
    throw refuse(CODES.EXISTING_INSTALL,
      `${sanitize(name)} already holds ${plural(blocking.length, 'file')} that new does not expect — use: existing --analyze`,
      { unexpected: blocking.slice(0, 10).map((rel) => sanitize(rel)) });
  }
  const { source, plan, componentVersions } = preparePlan({
    sourceRoot: input.sourceRoot,
    facts: scan.facts,
    profile: input.profile,
    components: input.components,
  });
  const rendered = consentRender({ plan, read: (rel) => source.read(rel), projectName: name,
    json: input.json === true, ...(input.mode === undefined ? {} : { mode: input.mode }),
    verbose: input.verbose === true });
  const head = input.json === true ? [] : [`Target: ${sanitize(name)}`, ''];
  if (input.dryRun === true) {
    return { lines: [...head, ...rendered, ...(input.json === true ? [] : ['', 'Dry run: nothing was written.'])], code: 0 };
  }
  if (input.confirm !== true) {
    return {
      lines: [...head, ...rendered, ...(input.json === true ? [] : ['',
        'Nothing was written. Re-run with --confirm to install, and --approve <ids> for the steps above.'])],
      code: 5,
    };
  }
  const result = applyPlan({
    sourceRoot: input.sourceRoot, targetRoot, plan, approvals: input.approvals, confirm: true,
    now: input.now, env: input.env, firstCell: input.firstCell,
    readSource: (rel) => source.bytes(rel),
    readTemplate: (rel) => source.read(rel),
    componentVersions,
    source: sourceIdentity((rel) => source.read(rel), input.sourceRoot, input.env),
    host: {
      languages: scan.languages, buildSystems: scan.buildSystems,
      ci: scan.facts.ci, hooks: scan.facts.hookMachinery,
    },
    projectName: name,
    limitations: scan.truncated
      ? ['the target scan hit its file or depth cap: paths beyond it were not seen']
      : [],
  });
  return { lines: summaryLines(result, name, warningLines(plan, input.approvals)), code: 0 };
}
