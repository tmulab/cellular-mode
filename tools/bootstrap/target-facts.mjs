// target-facts.mjs — everything planning is allowed to know about a target directory.
//
// This module is PURE DATA plus its validator. It deliberately cannot read a disk: Cell 4 fills
// a TargetFacts from the target, and every planning decision then depends on this record and
// nothing else. That is what makes a plan reproducible from a saved fixture, and what makes
// "analysis writes nothing" checkable by inspection rather than by trust.
//
// The validator is a SECURITY boundary, not tidiness. `existingFiles` comes from a directory
// Bootstrap does not own: a name with a `..` segment would let a later writer reason about a
// path outside the target, and a name with a newline would forge a line of the dry-run report.
// Both are refused here, FAIL CLOSED, before any planner or renderer sees them.
import { pathProblem } from './component-parts.mjs';
import { controlProblem } from './display.mjs';
import { CODES, refuse } from './errors.mjs';

/** @typedef {'none'|'native'|'hooksPath'|'husky'|'lefthook'|'pre-commit'|'unknown'} HookMachinery */
/** @typedef {{ claude: boolean, cursor: boolean }} ToolFacts */
/** @typedef {{ isGitRepo: boolean, existingFiles: ReadonlyArray<string>, tools: ToolFacts,
 *   hookMachinery: HookMachinery, ci: ReadonlyArray<string>, hasInstallManifest: boolean,
 *   hasProjectContract: boolean }} TargetFacts */
/** @typedef {{ path: string, message: string }} FactError */
/** @typedef {{ ok: boolean, errors: ReadonlyArray<FactError> }} FactResult */

/** The hook machineries the detector may report. `none` means "established that there is no hook
 * machinery"; `unknown` means "something is there and we could not identify it" — a very
 * different fact, and the reason the two are separate values. */
export const HOOK_MACHINERY = Object.freeze(
  /** @type {ReadonlyArray<HookMachinery>} */ (['none', 'native', 'hooksPath', 'husky', 'lefthook', 'pre-commit', 'unknown']),
);

/** The CI systems `bootstrap/CONTRACTS.md` names under "Hooks, CI and verification adapters". */
export const CI_SYSTEMS = Object.freeze([
  'github-actions', 'gitlab-ci', 'circleci', 'azure-pipelines', 'bitbucket', 'jenkins', 'unknown',
]);

/** @type {ReadonlyArray<string>} */
export const FACT_KEYS = Object.freeze([
  'isGitRepo', 'existingFiles', 'tools', 'hookMachinery', 'ci', 'hasInstallManifest',
  'hasProjectContract',
]);

/** @type {(path: string, message: string) => FactError} */
const fail = (path, message) => ({ path, message });

/**
 * PURE. The facts of a directory about which nothing has been established: not a repository, no
 * files, no tools, no hook machinery, no CI. Every default is the one that installs the least,
 * because an unestablished fact is UNKNOWN and UNKNOWN never unlocks anything.
 * @returns {TargetFacts}
 */
export function emptyFacts() {
  return Object.freeze({
    isGitRepo: false,
    existingFiles: Object.freeze([]),
    tools: Object.freeze({ claude: false, cursor: false }),
    hookMachinery: /** @type {HookMachinery} */ ('none'),
    ci: Object.freeze([]),
    hasInstallManifest: false,
    hasProjectContract: false,
  });
}

/** PURE. `emptyFacts()` with some fields replaced — the shape tests and callers build from.
 * Unknown keys are kept so that `validateFacts` can reject them instead of silently dropping a
 * field whose name the caller misspelled.
 * @param {Partial<TargetFacts> & Record<string, unknown>} [overrides] @returns {TargetFacts} */
export function makeFacts(overrides = {}) {
  const base = emptyFacts();
  const merged = { ...base, ...overrides };
  if (overrides.existingFiles !== undefined) {
    merged.existingFiles = Object.freeze([...overrides.existingFiles]);
  }
  if (overrides.tools !== undefined) merged.tools = Object.freeze({ ...base.tools, ...overrides.tools });
  if (overrides.ci !== undefined) merged.ci = Object.freeze([...overrides.ci]);
  return Object.freeze(/** @type {TargetFacts} */ (merged));
}

/** @param {Record<string, unknown>} record @param {FactError[]} errors @returns {void} */
function checkFileList(record, errors) {
  const list = record.existingFiles;
  if (!Array.isArray(list)) {
    errors.push(fail('existingFiles', 'existingFiles must be an array of target-relative paths'));
    return;
  }
  const seen = new Set();
  list.forEach((value, i) => {
    const at = `existingFiles[${i}]`;
    const structural = pathProblem(value);
    if (structural !== null) {
      errors.push(fail(at, `path ${structural}`));
      return;
    }
    const display = controlProblem(value);
    if (display !== null) {
      errors.push(fail(at, `path ${display}`));
      return;
    }
    const path = /** @type {string} */ (value);
    if (path.endsWith('/')) errors.push(fail(at, 'existingFiles holds files, never directories'));
    if (seen.has(path)) errors.push(fail(at, 'duplicate path'));
    seen.add(path);
  });
}

/**
 * PURE and TOTAL. Validates a TargetFacts record. Errors are collected, never thrown, so a
 * caller fixing a fixture or a detector sees every problem in one pass.
 * @param {unknown} value @returns {FactResult}
 */
export function validateFacts(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: Object.freeze([fail('', 'facts must be a JSON object')]) };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  /** @type {FactError[]} */
  const errors = [];
  for (const key of Object.keys(record)) {
    if (!FACT_KEYS.includes(key)) errors.push(fail(key, 'unknown key: facts hold exactly the declared contract'));
  }
  for (const key of ['isGitRepo', 'hasInstallManifest', 'hasProjectContract']) {
    if (typeof record[key] !== 'boolean') errors.push(fail(key, `${key} must be a boolean`));
  }
  checkFileList(record, errors);
  const tools = record.tools;
  if (typeof tools !== 'object' || tools === null || Array.isArray(tools)) {
    errors.push(fail('tools', 'tools must be a JSON object'));
  } else {
    const named = /** @type {Record<string, unknown>} */ (tools);
    for (const key of Object.keys(named)) {
      if (key !== 'claude' && key !== 'cursor') errors.push(fail(`tools.${key}`, 'unknown tool'));
    }
    for (const key of ['claude', 'cursor']) {
      if (typeof named[key] !== 'boolean') errors.push(fail(`tools.${key}`, `tools.${key} must be a boolean`));
    }
  }
  if (!HOOK_MACHINERY.includes(/** @type {HookMachinery} */ (record.hookMachinery))) {
    errors.push(fail('hookMachinery', `hookMachinery must be one of ${HOOK_MACHINERY.join(', ')}`));
  }
  if (!Array.isArray(record.ci)) errors.push(fail('ci', 'ci must be an array'));
  else {
    record.ci.forEach((system, i) => {
      if (typeof system !== 'string' || !CI_SYSTEMS.includes(system)) {
        errors.push(fail(`ci[${i}]`, `must be one of ${CI_SYSTEMS.join(', ')}`));
      }
    });
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/**
 * The checked, frozen facts, or a BAD_FACTS refusal. Planning calls this once at its edge so
 * that no module downstream has to wonder whether a path can be trusted.
 * @param {unknown} value @returns {TargetFacts}
 */
export function assertFacts(value) {
  const result = validateFacts(value);
  if (!result.ok) {
    throw refuse(CODES.BAD_FACTS, 'the target facts are not usable', {
      errors: result.errors.map((error) => `${error.path}: ${error.message}`),
    });
  }
  const facts = /** @type {TargetFacts} */ (value);
  return makeFacts(facts);
}

/**
 * PURE. The host conditions (the closed `host.requires` vocabulary) these facts ESTABLISH.
 * A condition absent from this set is unmet, whether it is false or merely unknown.
 * @param {TargetFacts} facts @returns {ReadonlySet<string>}
 */
export function factConditions(facts) {
  /** @type {Set<string>} */
  const met = new Set();
  if (facts.isGitRepo) met.add('git');
  return met;
}

/** PURE. A set of the target-relative files that already exist, for O(1) planning lookups.
 * @param {TargetFacts} facts @returns {ReadonlySet<string>} */
export function existingSet(facts) {
  return new Set(facts.existingFiles);
}
