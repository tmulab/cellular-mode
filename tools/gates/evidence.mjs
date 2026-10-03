// evidence.mjs — PURE. The shape of a Trilateral Verification RECORD, and nothing else.
//
// The constitution forbids claiming a result that was not executed. An auditor that runs
// in-process cannot execute a typecheck, a module load or a test suite — it has no port
// that spawns anything, by design — so the only honest way for it to report those three
// legs is to read a record left behind by the gate that DID run them.
//
// This module is the contract between those two sides, written once:
//   `tools/gates/trilateral.mjs --evidence` builds a record from the results it actually
//   computed and writes it; `eip/plugins/observer-audit` parses one and classifies it.
// No filesystem here, so both halves are testable without a repository, and the plugin
// may import it (see OBSERVER_PURE_IMPORTS in ./boundaries.mjs).
//
// FAIL CLOSED: `parseEvidence` answers `null` for anything it cannot fully recognise.
// A half-understood record would become a green leg, which is the one outcome worse than
// no record at all.

/** @typedef {import('./types.mjs').LegResult} LegResult */
/** @typedef {'pass' | 'fail' | 'warn'} LegStatus */
/** @typedef {{ status: LegStatus, detail: string, errors?: number, modules?: number,
 *   passed?: number | null, failed?: number | null, total?: number | null }} LegRecord */
/** @typedef {{ schema: 1, at: string, head: string | null,
 *   legs: { typecheck: LegRecord, build: LegRecord, tests: LegRecord } }} Evidence */

/** The one path a record may live at, repository-relative. */
export const EVIDENCE_PATH = '.cellular/evidence/trilateral.json';

/** The directory segments of that path, for a caller that must not split strings. */
export const EVIDENCE_SEGMENTS = Object.freeze(['.cellular', 'evidence']);

/** The file name inside those segments. */
export const EVIDENCE_FILE = 'trilateral.json';

/** Bumped only when the shape changes incompatibly; an unknown version is refused. */
export const EVIDENCE_SCHEMA = 1;

/** The three legs, in the order the rule names them. */
export const LEG_NAMES = Object.freeze(['typecheck', 'build', 'tests']);

const STATUSES = Object.freeze(['pass', 'fail', 'warn']);

/** @type {(value: unknown) => number | null} */
const intOrNull = (value) => (typeof value === 'number' && Number.isInteger(value) ? value : null);

/**
 * PURE. The record for the results a run ACTUALLY produced. Every number comes from the
 * leg that measured it; nothing is defaulted into existence — an unparsed count stays
 * `null` and the leg's own status says why.
 * @param {{ legs: { typecheck: LegResult, build: LegResult, tests: LegResult },
 *   at: string, head?: string | null }} input @returns {Evidence}
 */
export function evidenceRecord({ legs, at, head = null }) {
  const { typecheck, build, tests } = legs;
  return {
    schema: EVIDENCE_SCHEMA,
    at,
    head: typeof head === 'string' && head !== '' ? head : null,
    legs: {
      typecheck: {
        status: typecheck.status,
        detail: typecheck.text,
        ...(typecheck.errors === undefined ? {} : { errors: typecheck.errors }),
      },
      build: {
        status: build.status,
        detail: build.text,
        ...(build.modules === undefined ? {} : { modules: build.modules }),
      },
      tests: {
        status: tests.status,
        detail: tests.text,
        passed: intOrNull(tests.counts?.passed),
        failed: intOrNull(tests.counts?.failed),
        total: intOrNull(tests.counts?.total),
      },
    },
  };
}

/** @type {(value: unknown) => LegRecord | null} */
function parseLeg(value) {
  if (value === null || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const status = raw['status'];
  if (typeof status !== 'string' || !STATUSES.includes(status)) return null;
  const detail = typeof raw['detail'] === 'string' ? raw['detail'] : '';
  const errors = intOrNull(raw['errors']);
  const modules = intOrNull(raw['modules']);
  return {
    status: /** @type {LegStatus} */ (status),
    detail,
    ...(errors === null ? {} : { errors }),
    ...(modules === null ? {} : { modules }),
    passed: intOrNull(raw['passed']),
    failed: intOrNull(raw['failed']),
    total: intOrNull(raw['total']),
  };
}

/**
 * PURE. A parsed record, or `null` when the value is not one this build understands.
 * @param {unknown} value already-parsed JSON (the caller owns the file read)
 * @returns {Evidence | null}
 */
export function parseEvidence(value) {
  if (value === null || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  if (raw['schema'] !== EVIDENCE_SCHEMA) return null;
  const at = raw['at'];
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  const head = typeof raw['head'] === 'string' && raw['head'] !== '' ? raw['head'] : null;
  const source = raw['legs'];
  if (source === null || typeof source !== 'object') return null;
  const bag = /** @type {Record<string, unknown>} */ (source);
  const typecheck = parseLeg(bag['typecheck']);
  const build = parseLeg(bag['build']);
  const tests = parseLeg(bag['tests']);
  if (typecheck === null || build === null || tests === null) return null;
  return { schema: EVIDENCE_SCHEMA, at, head, legs: { typecheck, build, tests } };
}
