// PURE. The three legs of Trilateral Verification, and whether the record is still current.
//
// This module is where the constitution's hardest rule becomes code: NEVER CLAIM AN
// UNEXECUTED RESULT. The auditor cannot run a type checker, import every module or run the
// test suite — it has no port that spawns anything, deliberately — so the only honest thing
// it can do with those three legs is report a record left by the gate that did run them,
// and say UNAVAILABLE when there is none.
//
// Three mappings, and the middle one is the whole point:
//   the record says pass -> PASS          the leg ran and was green
//   the record says fail -> FAIL          the leg ran and was red
//   the record says warn -> UNAVAILABLE   the GATE ITSELF could not verify (its UNKNOWN)
// `warn` becoming PASS would turn "no type checker resolved" into "the types are fine".
import { EVIDENCE_PATH, LEG_NAMES } from '../../../tools/gates/evidence.mjs';
import { draft } from './statuses.mjs';

/** @typedef {import('../../../tools/gates/evidence.mjs').Evidence} Evidence */
/** @typedef {import('../../../tools/gates/evidence.mjs').LegRecord} LegRecord */
/** @typedef {import('./types.mjs').Draft} Draft */
/** @typedef {import('./types.mjs').Status} Status */

export const RULES = Object.freeze({
  TYPECHECK: 'typecheck',
  BUILD: 'build',
  TESTS: 'tests',
  FRESHNESS: 'evidence-freshness',
});

/** The command that produces the record. Named in every action, so the reader never has to
 * guess what would make an UNAVAILABLE leg knowable. */
export const EVIDENCE_COMMAND = 'npm run trilateral -- --evidence';

/** @type {Readonly<Record<string, Status>>} */
const STATUS_BY_LEG = Object.freeze({ pass: 'PASS', fail: 'FAIL', warn: 'UNAVAILABLE' });

/** @type {Readonly<Record<string, string>>} */
const RULE_BY_LEG = Object.freeze({
  typecheck: RULES.TYPECHECK, build: RULES.BUILD, tests: RULES.TESTS,
});

/** The measured numbers of one leg, as evidence lines. Only the numbers that leg measures.
 * @param {string} name @param {LegRecord} leg @returns {string[]} */
function measured(name, leg) {
  if (name === 'tests') {
    return [`${leg.passed ?? 'unknown'} passed`, `${leg.failed ?? 'unknown'} failed`,
      `${leg.total ?? 'unknown'} total`];
  }
  if (name === 'typecheck' && leg.errors !== undefined) return [`${leg.errors} error(s)`];
  if (name === 'build' && leg.modules !== undefined) return [`${leg.modules} module(s) imported`];
  return [];
}

/**
 * PURE. One finding per leg. No record at all means three UNAVAILABLE findings — not a
 * missing section, not a zero, and never a PASS.
 * @param {Evidence | null} evidence @returns {Draft[]}
 */
export function legChecks(evidence) {
  if (evidence === null) {
    return LEG_NAMES.map((name) => draft({
      rule: RULE_BY_LEG[name] ?? name,
      status: 'UNAVAILABLE',
      evidence: [`${EVIDENCE_PATH} is absent`],
      explanation: `this leg was not executed by anything this auditor can see. The auditor has no`
        + ` port that spawns a process, so it reports no verdict rather than guessing one.`,
      action: `run ${EVIDENCE_COMMAND}, then run the audit again.`,
    }));
  }
  return LEG_NAMES.map((name) => {
    const leg = /** @type {Record<string, LegRecord>} */ (evidence.legs)[name];
    if (leg === undefined) {
      return draft({
        rule: RULE_BY_LEG[name] ?? name,
        status: 'UNAVAILABLE',
        evidence: [EVIDENCE_PATH, `the record carries no "${name}" leg`],
        explanation: 'the evidence record does not describe this leg, so it has no verdict here.',
        action: `run ${EVIDENCE_COMMAND}, then run the audit again.`,
      });
    }
    const status = STATUS_BY_LEG[leg.status] ?? 'UNAVAILABLE';
    return draft({
      rule: RULE_BY_LEG[name] ?? name,
      status,
      evidence: [EVIDENCE_PATH, `recorded at ${evidence.at}`, ...measured(name, leg)],
      explanation: status === 'UNAVAILABLE'
        ? `the gate itself could not verify this leg (${leg.detail}), so it stays UNKNOWN here —`
          + ' a gate that cannot run is never green.'
        : leg.detail,
      ...(status === 'PASS' ? {} : {
        action: status === 'FAIL'
          ? 'fix the red leg, then re-run the gate so the record says so.'
          : `make the leg runnable, then run ${EVIDENCE_COMMAND} again.`,
      }),
    });
  });
}

/**
 * PURE. Is the record about THIS tree, and about this version of it?
 *
 * Two independent ways for a record to be stale, plus one way for it to be unknowable, and
 * all three are WARNING rather than PASS: an audit that trusts yesterday's green legs is
 * exactly as wrong as one that invents them.
 * @param {Evidence | null} evidence
 * @param {{ head: string | null, newestSourceMs: number | null, newestSourcePath?: string }} tree
 * @returns {Draft[]}
 */
export function freshnessChecks(evidence, { head, newestSourceMs, newestSourcePath }) {
  if (evidence === null) {
    return [draft({
      rule: RULES.FRESHNESS,
      status: 'UNAVAILABLE',
      evidence: [`${EVIDENCE_PATH} is absent`],
      explanation: 'there is no evidence record, so there is nothing whose freshness could be judged.',
      action: `run ${EVIDENCE_COMMAND}.`,
    })];
  }
  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const lines = [EVIDENCE_PATH, `recorded at ${evidence.at}`];
  if (head === null) {
    reasons.push('the current commit could not be read, so the record cannot be matched to this tree');
  } else if (evidence.head === null) {
    reasons.push('the record does not name a commit, so it cannot be matched to this tree');
  } else if (evidence.head !== head) {
    reasons.push(`the record was made at ${evidence.head.slice(0, 12)} and the tree is at ${head.slice(0, 12)}`);
    lines.push(`head ${evidence.head.slice(0, 12)} != ${head.slice(0, 12)}`);
  }
  if (newestSourceMs !== null && Date.parse(evidence.at) < newestSourceMs) {
    reasons.push('a source file has changed since the record was written');
    if (newestSourcePath !== undefined) lines.push(`newer: ${newestSourcePath}`);
  }
  if (reasons.length === 0) {
    return [draft({
      rule: RULES.FRESHNESS,
      status: 'PASS',
      evidence: [...lines, `head ${evidence.head === null ? 'unknown' : evidence.head.slice(0, 12)}`],
      explanation: 'the evidence record was written at this commit and no source file is newer than it.',
    })];
  }
  return [draft({
    rule: RULES.FRESHNESS,
    status: 'WARNING',
    evidence: lines,
    explanation: `the evidence is STALE: ${reasons.join('; ')}. The three legs above describe an`
      + ' earlier state of this repository.',
    action: `run ${EVIDENCE_COMMAND} to measure the tree as it is now.`,
  })];
}
