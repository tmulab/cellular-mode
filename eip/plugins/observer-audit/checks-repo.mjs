// PURE. The checks about the REPOSITORY, each one a thin adapter over a gate that exists.
//
// Nothing here decides whether a file is too long, whether a string looks like a
// credential, whether an import points the wrong way or whether a dependency is declared.
// Those four questions already have exactly one answer each, in `tools/gates`, and the gate
// functions are pure — so the auditor calls them with the files the read port handed over
// and translates their findings into its own vocabulary. If a rule changes, it changes in
// one place and this report changes with it.
import { checkBoundaries, toFindings } from '../../../tools/gates/boundaries.mjs';
import { checkDeps } from '../../../tools/gates/deps.mjs';
import { checkSecrets } from '../../../tools/gates/secrets.mjs';
import { checkSize, inScope as sizeInScope } from '../../../tools/gates/size.mjs';
import { draft } from './statuses.mjs';

/** @typedef {import('../../../tools/gates/types.mjs').FileTuple} FileTuple */
/** @typedef {import('../../../tools/gates/types.mjs').Finding} GateFinding */
/** @typedef {import('./types.mjs').Draft} Draft */

export const RULES = Object.freeze({
  SIZE: 'file-size',
  SECRETS: 'secrets',
  DEPS: 'deps',
  BOUNDARIES: 'import-boundaries',
  ACCEPTANCE: 'acceptance-criteria',
  POLICY: 'policy',
});

const CODE = /\.(mjs|js)$/;

/** PURE. A gate finding becomes one FAIL, with the gate's own rule id as evidence and its
 * own sentence as the explanation. A gate that found nothing becomes one PASS that says
 * how much was looked at — a green tick with no denominator is not a measurement.
 * @param {{ rule: string, findings: ReadonlyArray<GateFinding>, scanned: number,
 *   subject: string, action: string }} input @returns {Draft[]}
 */
function fromGate({ rule, findings, scanned, subject, action }) {
  if (findings.length === 0) {
    return [draft({
      rule,
      status: 'PASS',
      evidence: [`${scanned} file(s) checked`],
      explanation: `${subject}: the gate reports no finding.`,
    })];
  }
  return findings.map((finding) => draft({
    rule,
    status: 'FAIL',
    evidence: [finding.path, `rule ${finding.rule}`],
    explanation: finding.detail,
    action,
  }));
}

/** PURE. The 200-line rule, as `tools/gates/size.mjs` enforces it.
 * @param {ReadonlyArray<FileTuple>} files @param {unknown} exceptions @returns {Draft[]} */
export function sizeChecks(files, exceptions) {
  const scope = files.filter((file) => sizeInScope(file.path));
  return fromGate({
    rule: RULES.SIZE,
    findings: checkSize(scope, exceptions),
    scanned: scope.length,
    subject: 'every handwritten file in scope is within its line limit',
    action: 'split the file along a real seam, or add an approved entry to policy/size-exceptions.json.',
  });
}

/**
 * PURE. The credential-shape scan. The finding carries the RULE ID and the ADDRESS and
 * nothing else: the gate's own `detail` already avoids the matched text, and this adapter
 * drops it anyway rather than relying on that. A report that quotes the secret it found has
 * copied the secret into every place the report is read.
 * @param {ReadonlyArray<FileTuple>} files @param {unknown} allowlist @returns {Draft[]}
 */
export function secretChecks(files, allowlist) {
  const findings = checkSecrets(files, allowlist);
  if (findings.length === 0) {
    return [draft({
      rule: RULES.SECRETS,
      status: 'PASS',
      evidence: [`${files.length} file(s) scanned`],
      explanation: 'no known credential shape appears in the files this port can read.'
        + ' That is a statement about shapes, not a proof that the repository holds no secret.',
    })];
  }
  return findings.map((finding) => draft({
    rule: RULES.SECRETS,
    status: 'FAIL',
    evidence: [finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`,
      `rule ${finding.rule}`],
    explanation: 'a string matching a known credential shape was detected at this address.'
      + ' The matched text is deliberately not reproduced here.',
    action: 'open that line, remove the credential and rotate it; if it is a false positive,'
      + ' add an entry with a rationale to policy/secrets-allowlist.json.',
  }));
}

/** PURE. Zero runtime dependencies, in the manifest AND in the import specifiers.
 * @param {{ pkg: Record<string, unknown> | null, files: ReadonlyArray<FileTuple>,
 *   policy: unknown }} input @returns {Draft[]} */
export function depsChecks({ pkg, files, policy }) {
  const code = files.filter((file) => CODE.test(file.path));
  return fromGate({
    rule: RULES.DEPS,
    findings: checkDeps({ pkg, files: code, policy }),
    scanned: code.length + (pkg === null ? 0 : 1),
    subject: 'package.json declares only approved dependencies and every import specifier is'
      + ' relative or a node: built-in',
    action: 'remove the dependency, or add it to policy/allowed-dependencies.json with a rationale'
      + ' and an approver.',
  });
}

/** PURE. Import DIRECTION, as `tools/gates/boundaries.mjs` states the rules.
 * @param {ReadonlyArray<FileTuple>} files @returns {Draft[]} */
export function boundaryChecks(files) {
  const code = files.filter((file) => CODE.test(file.path));
  return fromGate({
    rule: RULES.BOUNDARIES,
    findings: toFindings(checkBoundaries(code)),
    scanned: code.length,
    subject: 'every import points in the direction the architecture declares',
    action: 'invert the dependency, or state the exception as a rule in tools/gates/boundaries.mjs.',
  });
}

/** A criterion still open, and a criterion with a verdict. ONE convention, narrowly: the
 * GFM checkbox. Anything else in an ACCEPTANCE.md is prose this check does not judge. */
const OPEN_BOX = /^\s*[-*]\s*\[ \]\s+\S/;
const CLOSED_BOX = /^\s*[-*]\s*\[[xX]\]\s+\S/;

/**
 * PURE. Acceptance criteria that still have no verdict.
 *
 * The convention is deliberately narrow and is stated in the finding itself: `- [ ]` is
 * open, `- [x]` is closed. When no `ACCEPTANCE.md` carries a checkbox at all, the answer is
 * NOT_APPLICABLE — never PASS, because "every criterion has a verdict" would then be a
 * claim about a convention nobody used, which is exactly the kind of green tick this
 * project refuses to print.
 * @param {ReadonlyArray<FileTuple>} files @returns {Draft[]}
 */
export function acceptanceChecks(files) {
  const sheets = files.filter((file) => file.path === 'ACCEPTANCE.md' || file.path.endsWith('/ACCEPTANCE.md'));
  /** @type {Draft[]} */
  const out = [];
  let boxes = 0;
  for (const sheet of sheets) {
    const lines = sheet.text.split('\n');
    const open = lines.filter((line) => OPEN_BOX.test(line)).length;
    boxes += open + lines.filter((line) => CLOSED_BOX.test(line)).length;
    if (open === 0) continue;
    out.push(draft({
      rule: RULES.ACCEPTANCE,
      status: 'WARNING',
      evidence: [sheet.path, `${open} criterion(s) still open`],
      explanation: 'these acceptance criteria carry an unchecked box, so they have no verdict yet.',
      action: 'run the criterion and record its verdict, or close it by withdrawing it.',
    }));
  }
  if (out.length > 0) return out;
  if (sheets.length === 0 || boxes === 0) {
    return [draft({
      rule: RULES.ACCEPTANCE,
      status: 'NOT_APPLICABLE',
      evidence: [`${sheets.length} ACCEPTANCE.md file(s)`],
      explanation: sheets.length === 0
        ? 'this project has no ACCEPTANCE.md file, so there is no criterion sheet to read.'
        : 'no ACCEPTANCE.md uses the checkbox convention this check reads ("- [ ]" / "- [x]"),'
          + ' so no verdict can be claimed about their criteria either way.',
    })];
  }
  return [draft({
    rule: RULES.ACCEPTANCE,
    status: 'PASS',
    evidence: [`${sheets.length} ACCEPTANCE.md file(s)`, `${boxes} checkbox criterion(s)`],
    explanation: 'every acceptance criterion written as a checkbox is checked.',
  })];
}

/** PURE. A JSON input the rules needed and could not read — missing, or not valid JSON. The
 * dependent gate still runs, with the EMPTY policy, which produces more findings rather than
 * fewer: an unreadable allowlist must never read as a permissive one.
 * @param {ReadonlyArray<string>} unreadable @returns {Draft[]} */
export function policyChecks(unreadable) {
  return unreadable.map((path) => draft({
    rule: RULES.POLICY,
    status: 'UNAVAILABLE',
    evidence: [path],
    explanation: 'this file could not be read as JSON, so what it declares is unknown here. The'
      + ' rules that depend on it ran with an EMPTY policy, which reports more than the real one'
      + ' would, never less.',
    action: 'restore or repair the file, then run the audit again.',
  }));
}
