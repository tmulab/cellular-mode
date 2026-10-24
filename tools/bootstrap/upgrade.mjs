// upgrade.mjs — `bootstrap upgrade <target>`: the verb that carries a NEWER source into a project
// that already has the method, and the only verb allowed to replace a file Bootstrap wrote.
//
// IT NEEDS THE SAME TWO LOCKS AS EVERY CONSEQUENTIAL STEP HERE. `--dry-run` prints the plan and
// writes ZERO bytes (the test hashes the whole target tree before and after); without `--confirm`
// the plan is printed and the exit is 5. That is `uninstall`'s pattern, deliberately, because the
// two verbs ask a human to authorise the same kind of thing: a change to files already on disk.
//
// AND IT REFUSES AS A WHOLE, NEVER PARTIALLY, WHEN THE ADOPTER EDITED AN INSTALLED FILE. One
// modified immutable file stops the entire upgrade with that file named (exit 3). Replacing it
// would destroy somebody's work; skipping it would leave an installation no single source version
// describes. Refusing is the only honest third option, and the human then chooses: keep the edit,
// or remove the file with `uninstall --force-modified` and upgrade afterwards.
//
// WHAT IT DOES NOT DO. It does not re-render a GENERATED file (an `AGENTS.md` is written from the
// target's own facts, and a project may have grown a managed block in it), it does not touch
// `vault/state/**` beyond CREATING a skeleton file that is absent — never `log.md` — and it never
// deletes anything. Each of those is reported in the plan, so nobody has to infer it.
import { basename } from 'node:path';
import { CODES, refuse } from './errors.mjs';
import { expandSelection, loadCatalog } from './catalog.mjs';
import { notInstalled } from './manage-flow.mjs';
import { requireExistingDirectory } from './new-flow.mjs';
import { readStatusFacts } from './status-read.mjs';
import { diskSource } from './source-read.mjs';
import { skeletonFiles } from '../cellmode/skeleton.mjs';
import { changeCount, planUpgrade } from './upgrade-plan.mjs';
import { applyUpgrade } from './upgrade-apply.mjs';
import { findingLines, outcomeLines, upgradeLines } from './upgrade-render.mjs';
import { assertNoOverlap, bytesIfPresent, sha256 } from './writer.mjs';

/** @typedef {import('./manage-flow.mjs').FlowResult} FlowResult */
/** @typedef {import('./source-read.mjs').Source} Source */

/**
 * PURE given `source`. Every target-relative path the current catalog would COPY for a recorded
 * component set, mapped to the source path it comes from. Components the current catalog does not
 * hold are returned separately: an upgrade from a source that cannot describe this install is a
 * refusal, not a smaller upgrade.
 * @param {string} sourceRoot @param {Source} source @param {ReadonlyArray<string>} components
 * @returns {{ targets: Record<string, string>, unknown: ReadonlyArray<string>,
 *   componentVersions: Record<string, string> }}
 */
export function catalogTargets(sourceRoot, source, components) {
  const catalog = loadCatalog(sourceRoot, source);
  if (!catalog.ok) {
    throw refuse(CODES.BAD_MANIFEST, `the component catalog did not load: ${catalog.errors.length} error(s)`,
      { errors: catalog.errors.map((error) => `${error.path}: ${error.message}`) });
  }
  const known = components.filter((id) => catalog.byId[id] !== undefined);
  const unknown = components.filter((id) => catalog.byId[id] === undefined);
  const expanded = expandSelection(catalog.byId, known, source);
  /** @type {Record<string, string>} */
  const targets = {};
  for (const files of Object.values(expanded)) {
    for (const file of files) targets[file.target] = file.source;
  }
  return {
    targets,
    unknown: Object.freeze(unknown),
    componentVersions: Object.fromEntries(catalog.components
      .map((component) => [String(component.id), String(component.componentVersion)])),
  };
}

/** The refusal when the record names a component this checkout has no manifest for. Fail closed:
 * a source that cannot describe the install cannot be the source it is upgraded to.
 * @param {string} name @param {ReadonlyArray<string>} unknown @returns {FlowResult} */
export function unknownComponents(name, unknown) {
  return {
    lines: [`Target: ${name}`, '',
      `REFUSED — this install records ${unknown.length} component(s) the source here does not define:`,
      ...unknown.map((id) => `  - ${id}`),
      '', 'Nothing was written. Upgrade from a checkout that holds every component this target was installed with.'],
    code: 3,
    stdout: true,
  };
}

/**
 * Runs `upgrade`.
 * @param {{ sourceRoot: string, targetArg: string, dryRun?: boolean | undefined,
 *   confirm?: boolean | undefined, verbose?: boolean | undefined, now: string,
 *   env?: NodeJS.ProcessEnv | undefined }} input @returns {FlowResult}
 */
export function runUpgrade(input) {
  const targetRoot = requireExistingDirectory(input.targetArg);
  assertNoOverlap(input.sourceRoot, targetRoot);
  const name = basename(targetRoot);
  const read = readStatusFacts({ targetRoot, sourceRoot: input.sourceRoot,
    ...(input.env === undefined ? {} : { env: input.env }) });
  const { facts } = read;
  if (!facts.installed || read.manifest === null) return notInstalled(name);
  const source = diskSource(input.sourceRoot);
  const { targets, unknown, componentVersions } = catalogTargets(input.sourceRoot, source, facts.components);
  if (unknown.length > 0) return unknownComponents(name, unknown);
  const skeleton = skeletonFiles();
  const plan = planUpgrade({
    files: facts.files,
    targets,
    sourceDigest: (rel) => digestOf(source, rel),
    present: (rel) => presentIn(targetRoot, rel),
    skeleton,
  });
  const rendered = upgradeLines({ plan, name, installed: facts.source, source: facts.sourceNow,
    verbose: input.verbose === true });
  if (plan.findings.length > 0) {
    return { lines: [...rendered, ...findingLines(plan)], code: 3, stdout: true };
  }
  if (input.dryRun === true) {
    return { lines: [...rendered, '', 'Dry run: nothing was written, nothing was replaced.'], code: 0, stdout: true };
  }
  if (input.confirm !== true) {
    return { lines: [...rendered, '',
      `Nothing was written. Re-run with --confirm to perform this plan${changeCount(plan) === 0
        ? ' (which writes no file, and records this source in the install manifest).' : '.'}`], code: 5 };
  }
  const outcome = applyUpgrade({
    targetRoot, plan, manifest: read.manifest, skeleton, componentVersions, now: input.now,
    readSource: (rel) => source.bytes(rel),
    source: facts.sourceNow ?? /** @type {import('./status.mjs').Identity} */ (facts.source),
  });
  return { lines: outcomeLines({ outcome, name, source: facts.sourceNow }),
    code: outcome.failed.length === 0 ? 0 : 2 };
}

/** The digest of one source file today, or `null` when this checkout does not hold it — UNKNOWN,
 * and a path nothing will write. @param {Source} source @param {string} rel
 * @returns {string | null} */
function digestOf(source, rel) {
  try {
    return sha256(source.bytes(rel));
  } catch {
    return null;
  }
}

/** Whether the target already holds `rel`. A read that REFUSES counts as present: an upgrade that
 * cannot look at a path is an upgrade that does not write it. @param {string} targetRoot
 * @param {string} rel @returns {boolean} */
function presentIn(targetRoot, rel) {
  try {
    return bytesIfPresent(targetRoot, rel) !== null;
  } catch {
    return true;
  }
}
