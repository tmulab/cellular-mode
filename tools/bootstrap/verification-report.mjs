// verification-report.mjs — PURE. What `verification <target> list` SAYS, as text and as JSON.
//
// THE POINT OF THIS FILE IS THE SECOND HALF OF EACH LINE. A list of checks is easy; the adoption
// trial showed the missing half is "and why can this one not block a commit yet, and what exactly
// do I type". So every non-mandatory check carries its own blocker and its own next command, and
// the listing ends with the state of the whole contract — including, when nothing is mandatory,
// the sentence that explains why final verification is refusing.
//
// VERBATIM, NOT SUMMARISED. The next command is printed in full (trial finding A-13: a truncated
// instruction is not an instruction), with `<target>` where the directory goes.
import { MAX_ACTIONABLE, sanitize } from './display.mjs';
import { checksOf } from './verification-edit.mjs';

/** @typedef {import('./verification-edit.mjs').Check} Check */
/** @typedef {{ ready: boolean, why: string, next: string }} Blocker */

/** The command this CLI is. The target is a PLACEHOLDER and never the path: `main.scrubLines`
 * replaces every spelling of the target root with `.`, so a real path printed here would reach
 * the human as a command pointing at the wrong directory. `<target>` cannot be scrubbed wrong. */
export const INVOCATION = 'node tools/bootstrap/cli.mjs verification <target>';

/** The one sentence that names the command every target actually has. */
export const FAIL_CLOSED = 'verify-final will fail closed: no mandatory check'
  + ' — `node tools/gates/verify-final.mjs` refuses until at least one is approved';

/**
 * PURE. Why this check cannot block a commit yet, and the exact command that changes it. A check
 * is ELIGIBLE when it is VERIFIED or carries a human approval — the gate's own rule, restated.
 * @param {Check} check @returns {Blocker}
 */
export function blockerFor(check) {
  const id = String(check.id);
  if (check.mandatory === true) {
    return { ready: true, why: 'mandatory: final verification runs it', next: `${INVOCATION} revoke ${id} --confirm` };
  }
  if (String(check.status) === 'VERIFIED') {
    return { ready: true,
      why: 'VERIFIED here, so it may be made mandatory with nothing further',
      next: `${INVOCATION} mandatory ${id} --confirm` };
  }
  if (check.approval !== null && check.approval !== undefined) {
    return { ready: true,
      why: `approved by a human on ${sanitize(String(check.approval.at), 40)}, so it may be made mandatory`,
      next: `${INVOCATION} mandatory ${id} --confirm` };
  }
  return { ready: false,
    why: `${sanitize(String(check.status), 20)}: nobody ran it here and nobody approved it, so it may not block a commit`,
    next: `${INVOCATION} run ${id} --confirm   (or, to approve it without running it: ${INVOCATION} mandatory ${id} --confirm)` };
}

/** PURE. The mandatory checks, by the gate's rule rather than by the flag alone.
 * @param {unknown} contract @returns {ReadonlyArray<Check>} */
export function effectiveMandatory(contract) {
  return Object.freeze(checksOf(contract).filter((check) => check.mandatory === true
    && (String(check.status) === 'VERIFIED' || (check.approval !== null && check.approval !== undefined))));
}

/** PURE. The state of the contract as a whole, in one sentence.
 * @param {unknown} contract @returns {string} */
export function overallState(contract) {
  const mandatory = effectiveMandatory(contract);
  if (mandatory.length === 0) return FAIL_CLOSED;
  return `${mandatory.length} mandatory check(s) — \`node tools/gates/verify-final.mjs\` runs ${
    mandatory.map((check) => String(check.id)).join(', ')}, plus the method's own cell-state check.`;
}

/** PURE. The JSON `--json` prints: the same data the text carries, nothing derived away.
 * @param {unknown} contract @param {string} rel @returns {Record<string, unknown>} */
export function listJson(contract, rel) {
  const checks = checksOf(contract).map((check) => {
    const blocker = blockerFor(check);
    return {
      id: String(check.id),
      argv: [...check.argv].map(String),
      status: String(check.status),
      basis: String(check.basis),
      mandatory: check.mandatory === true,
      approval: check.approval ?? null,
      ready: blocker.ready,
      why: blocker.why,
      next: blocker.next,
    };
  });
  return {
    file: rel,
    checks,
    mandatoryCount: effectiveMandatory(contract).length,
    failsClosed: effectiveMandatory(contract).length === 0,
    state: overallState(contract),
  };
}

/** PURE. The text listing. @param {unknown} contract @param {string} rel @returns {string[]} */
export function listLines(contract, rel) {
  const checks = checksOf(contract);
  /** @type {string[]} */
  const out = [`Verification contract: ${rel} — ${checks.length} check(s), ${effectiveMandatory(contract).length} mandatory.`];
  if (checks.length === 0) {
    out.push('', 'It holds no check at all. Add one you can actually run, for example:',
      `  ${INVOCATION} add node-tests -- node --test --confirm`);
  }
  for (const check of checks) {
    const blocker = blockerFor(check);
    out.push('', `  ${sanitize(String(check.id), 60)} [${sanitize(String(check.status), 20)}]${check.mandatory === true ? ' MANDATORY' : ''}`,
      `    argv:     ${sanitize([...check.argv].join(' '), MAX_ACTIONABLE)}`,
      `    basis:    ${sanitize(String(check.basis), 200)}`,
      `    approval: ${check.approval === null || check.approval === undefined
        ? 'none' : `${sanitize(String(check.approval.by), 20)} on ${sanitize(String(check.approval.at), 40)}`}`,
      `    ${blocker.ready ? 'ready' : 'NOT MANDATORY'}: ${blocker.why}`,
      `    next:     ${sanitize(blocker.next, MAX_ACTIONABLE)}`);
  }
  out.push('', overallState(contract));
  return out;
}
