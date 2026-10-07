// verification-contract.mjs — PURE. The project-local verification contract
// `vault/verification.json`, schema `cellular-mode/verification` version 1, and its ONE
// validator (decision BS3, 2026-10-06).
//
// WHY IT EXISTS. Article 8 needs a complete mandatory suite, and this repository's suite names
// this repository's own gates. A target project has different commands, so either the method
// grows a SECOND Article 8 implementation or the suite becomes data the project supplies. BS3
// chose the data, and this is the whole of it: `verify-final.mjs` reads the file when it is
// there and keeps its built-in suite, byte for byte, when it is not.
//
// THREE RULES BESIDES THE ARGV RULE (./verification-argv.mjs), each a refusal, never a repair.
//   A LABEL ON EVERY CHECK — VERIFIED / INFERRED / PROPOSED / UNKNOWN, with a short `basis`
//     saying what it rests on: a check with no basis is a claim with no evidence.
//   MANDATORY NEEDS VERIFIED OR A HUMAN — `mandatory: true` is valid only for a VERIFIED check
//     or one carrying an explicit human approval. Nothing merely INFERRED blocks a commit.
//   CLOSED KEYS — an unknown key anywhere is an error, at every level.
// FAIL CLOSED: a caller gets `ok: false` and the reasons, never a repaired contract. Nothing
// here reads a disk, spawns a process, or knows what a repository is.
import { argvProblem } from './verification-argv.mjs';

export const VERIFICATION_SCHEMA = 'cellular-mode/verification';
export const VERIFICATION_VERSION = 1;

/** The one path a contract may live at, project-relative. */
export const VERIFICATION_REL = 'vault/verification.json';

/** How large the file may be. A list of commands is kilobytes; anything larger is not one. */
export const MAX_CONTRACT_BYTES = 64 * 1024;

/** The epistemic labels of `docs/00-constitution.md`, unchanged. */
export const STATUSES = Object.freeze(['VERIFIED', 'INFERRED', 'PROPOSED', 'UNKNOWN']);

export const CONTRACT_KEYS = Object.freeze(['schema', 'version', 'project', 'checks', 'notes']);
export const CHECK_KEYS = Object.freeze(['id', 'argv', 'status', 'basis', 'mandatory', 'approval',
  'timeoutSeconds']);
export const APPROVAL_KEYS = Object.freeze(['by', 'at']);

/** How long a contract check may run when it names no timeout of its own, and the ceiling. */
export const DEFAULT_TIMEOUT_SECONDS = 1800;
export const MAX_TIMEOUT_SECONDS = 3600;

/** Caps. A contract is a suite a human reads, not a program. */
export const MAX_CHECKS = 50;
export const MAX_BASIS = 200;

/** The refusal `verify-final` prints when a contract is valid and nothing in it is mandatory.
 * Said here, once, so the gate and the documentation cannot word it differently. */
export const NO_MANDATORY_REASON = 'no mandatory verification check — approve at least one (vault/verification.json)';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** @typedef {{ path: string, message: string }} ContractError */ /** @typedef {{ by: 'human', at: string }} Approval */
/** @typedef {{ id: string, argv: ReadonlyArray<string>, status: string, basis: string,
 *   mandatory: boolean, approval: Approval | null, timeoutSeconds?: number }} ContractCheck */
/** @typedef {{ schema: string, version: number, project?: string,
 *   checks: ReadonlyArray<ContractCheck>, notes?: ReadonlyArray<string> }} Contract */
/** @typedef {{ id: string, argv: ReadonlyArray<string>, timeoutSeconds: number }} SuiteEntry */

/** @type {(path: string, message: string) => ContractError} */
const fail = (path, message) => ({ path, message });
/** @type {(value: unknown) => boolean} */
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** @param {Record<string, unknown>} record @param {string} at @param {ReadonlyArray<string>} keys
 * @param {ContractError[]} errors @returns {void} */
function closed(record, at, keys, errors) {
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) errors.push(fail(`${at}.${key}`, 'unknown key: the contract holds exactly the declared keys'));
  }
}

/** @param {unknown} value @param {string} at @param {ContractError[]} errors @returns {void} */
function checkApproval(value, at, errors) {
  if (value === null) return;
  if (!isRecord(value)) return void errors.push(fail(at, 'approval must be null or { by: "human", at: <ISO instant> }'));
  const record = /** @type {Record<string, unknown>} */ (value);
  closed(record, at, APPROVAL_KEYS, errors);
  if (record.by !== 'human') errors.push(fail(`${at}.by`, 'only a human approves: by must be "human"'));
  if (!ISO.test(String(record.at))) errors.push(fail(`${at}.at`, 'at must be an ISO-8601 instant'));
}

/** @param {unknown} value @param {string} at @param {Set<string>} seen
 * @param {ContractError[]} errors @returns {void} */
function checkOne(value, at, seen, errors) {
  if (!isRecord(value)) return void errors.push(fail(at, 'a check must be a JSON object'));
  const record = /** @type {Record<string, unknown>} */ (value);
  closed(record, at, CHECK_KEYS, errors);
  const id = String(record.id);
  if (typeof record.id !== 'string' || !ID.test(id)) errors.push(fail(`${at}.id`, 'id must be kebab-case'));
  else if (seen.has(id)) errors.push(fail(`${at}.id`, `duplicate id "${id}": one check, one id`));
  else seen.add(id);
  const problem = argvProblem(record.argv);
  if (problem !== null) errors.push(fail(`${at}.argv`, problem));
  if (typeof record.status !== 'string' || !STATUSES.includes(record.status)) {
    errors.push(fail(`${at}.status`, `status must be one of ${STATUSES.join(', ')}`));
  }
  const basis = record.basis;
  if (typeof basis !== 'string' || basis.trim() === '' || basis.length > MAX_BASIS) {
    errors.push(fail(`${at}.basis`, `basis says in at most ${MAX_BASIS} characters what the label rests on`));
  }
  if (typeof record.mandatory !== 'boolean') errors.push(fail(`${at}.mandatory`, 'mandatory must be a boolean'));
  if (!('approval' in record)) errors.push(fail(`${at}.approval`, 'approval is required: null when nobody approved it'));
  else checkApproval(record.approval, `${at}.approval`, errors);
  const seconds = record.timeoutSeconds;
  if ('timeoutSeconds' in record && (typeof seconds !== 'number' || !Number.isInteger(seconds)
    || seconds < 1 || seconds > MAX_TIMEOUT_SECONDS)) {
    errors.push(fail(`${at}.timeoutSeconds`, `timeoutSeconds must be a whole number of seconds from 1 to ${MAX_TIMEOUT_SECONDS}`));
  }
  if (record.mandatory === true && record.status !== 'VERIFIED' && !isRecord(record.approval)) {
    errors.push(fail(`${at}.mandatory`,
      'a mandatory check must be VERIFIED or carry an explicit human approval (BS3): nothing merely INFERRED may block a commit'));
  }
}

/**
 * PURE and TOTAL. Every complaint about a candidate contract. `ok: true` means the whole
 * document is usable; there is no partial acceptance.
 * @param {unknown} value @returns {{ ok: boolean, errors: ReadonlyArray<ContractError> }}
 */
export function validateContract(value) {
  /** @type {ContractError[]} */
  const errors = [];
  if (!isRecord(value)) return { ok: false, errors: Object.freeze([fail('contract', 'must be a JSON object')]) };
  const record = /** @type {Record<string, unknown>} */ (value);
  closed(record, 'contract', CONTRACT_KEYS, errors);
  if (record.schema !== VERIFICATION_SCHEMA) errors.push(fail('schema', `must be "${VERIFICATION_SCHEMA}"`));
  if (record.version !== VERIFICATION_VERSION) errors.push(fail('version', `must be ${VERIFICATION_VERSION}`));
  if ('project' in record && (typeof record.project !== 'string' || record.project === '')) {
    errors.push(fail('project', 'project, when present, names the project in a non-empty string'));
  }
  if ('notes' in record && (!Array.isArray(record.notes) || record.notes.some((n) => typeof n !== 'string'))) {
    errors.push(fail('notes', 'notes, when present, is an array of strings'));
  }
  if (!Array.isArray(record.checks)) {
    errors.push(fail('checks', 'checks must be an array (empty is allowed, and means nothing is mandatory yet)'));
  } else if (record.checks.length > MAX_CHECKS) {
    errors.push(fail('checks', `at most ${MAX_CHECKS} checks`));
  } else {
    /** @type {Set<string>} */
    const seen = new Set();
    record.checks.forEach((entry, i) => checkOne(entry, `checks[${i}]`, seen, errors));
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/**
 * PURE and TOTAL. The contract a text holds, or the reasons it is not one. Size-capped here as
 * well as at the file level, so a caller that forgot to stat is still bounded.
 * @param {unknown} text @returns {{ ok: boolean, contract: Contract | null,
 *   errors: ReadonlyArray<ContractError> }}
 */
export function parseContract(text) {
  if (typeof text !== 'string') return { ok: false, contract: null, errors: Object.freeze([fail('contract', 'must be text')]) };
  if (text.length > MAX_CONTRACT_BYTES) {
    return { ok: false, contract: null,
      errors: Object.freeze([fail('contract', `must not exceed ${MAX_CONTRACT_BYTES} bytes`)]) };
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const why = error instanceof Error ? error.message : 'unparseable';
    return { ok: false, contract: null, errors: Object.freeze([fail('contract', `is not JSON: ${why}`)]) };
  }
  const result = validateContract(parsed);
  return { ok: result.ok, contract: result.ok ? /** @type {Contract} */ (parsed) : null, errors: result.errors };
}

/**
 * PURE. The MANDATORY checks of a contract, in the order the file declares them. The mandatory
 * rule is re-applied here rather than assumed: this is the function `verify-final` RUNS, and a
 * suite builder that trusted an upstream validation would be the bypass.
 * @param {unknown} contract @returns {ReadonlyArray<SuiteEntry>}
 */
export function mandatorySuite(contract) {
  if (!isRecord(contract)) return Object.freeze([]);
  const checks = /** @type {{ checks?: unknown }} */ (contract).checks;
  if (!Array.isArray(checks)) return Object.freeze([]);
  /** @type {SuiteEntry[]} */
  const out = [];
  for (const entry of checks) {
    if (!isRecord(entry)) continue;
    const record = /** @type {Record<string, unknown>} */ (entry);
    if (record.mandatory !== true) continue;
    const approval = record.approval;
    const approved = isRecord(approval) && /** @type {{ by?: unknown }} */ (approval).by === 'human';
    if (record.status !== 'VERIFIED' && !approved) continue;
    if (argvProblem(record.argv) !== null) continue;
    const seconds = record.timeoutSeconds;
    out.push(Object.freeze({
      id: String(record.id),
      argv: Object.freeze(/** @type {string[]} */ (record.argv).map(String)),
      timeoutSeconds: typeof seconds === 'number' ? seconds : DEFAULT_TIMEOUT_SECONDS,
    }));
  }
  return Object.freeze(out);
}
