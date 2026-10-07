#!/usr/bin/env node
// verify-final.mjs — Article 8, as a command: `npm run verify:final`.
//
// THE ORDER IS THE RULE. Fingerprint the controlled state, run the complete mandatory
// suite, fingerprint again, and authorize completion only when every check passed AND the
// two fingerprints are identical. A green suite over a state that moved underneath it is
// exactly what produced commit 523cb44 (policy/relaxations.md R-4), so "the state did not
// change" is a CHECK here, not an assumption.
//
// The suite is DATA and injectable, which is how the tests exercise the ordering —
// including a stub that modifies a file mid-run — without spending minutes per case. WHERE
// the data comes from is ./verification-suite.mjs: this repository's own four checks when
// there is no `vault/verification.json`, and the MANDATORY checks of that contract when
// there is one (decision BS3). Absent file ⇒ `MANDATORY_SUITE`, unchanged; a contract that
// cannot be read, does not validate, or makes nothing mandatory ⇒ an EMPTY suite and a
// reason, which is never a pass.
//
// The evidence is appended OUTSIDE the verified state (see ./final-evidence.mjs) and the
// run REFUSES to proceed if that is ever untrue.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { diffEntries, fingerprintRepo, repoState } from './fingerprint.mjs';
import { BUILT_IN, MANDATORY_SUITE, selectSuite } from './verification-suite.mjs';
import {
  CORRECTIVE_ACTION, MAX_RECORDED, checkByteEquivalence, equivalenceReason,
} from './byte-equivalence.mjs';
import {
  FINAL_EVIDENCE_FILE, FINAL_EVIDENCE_PATH, FINAL_EVIDENCE_SEGMENTS,
  finalRecord, sanitizeSummary, verdict,
} from './final-evidence.mjs';
import { countsSummary, parseTestCounts, skipLines } from './test-counts.mjs';

/** @typedef {import('./final-evidence.mjs').FinalRecord} FinalRecord */
/** @typedef {import('./final-evidence.mjs').CheckRecord} CheckRecord */
/** @typedef {import('./verification-suite.mjs').CheckOutcome} CheckOutcome */
/** @typedef {import('./verification-suite.mjs').Check} Check */

// Re-exported, not redefined: the built-in suite is one constant in this repository, and the
// tests and the documentation both name it here, where `npm run verify:final` starts.
export { MANDATORY_SUITE } from './verification-suite.mjs';

/** The record file must never be part of what it certifies, or writing it would change the
 * fingerprint it claims. Asserted on every run rather than trusted to .gitignore.
 * @param {ReadonlyArray<{ path: string }>} entries @returns {void} */
export function assertEvidenceOutside(entries) {
  const inside = entries.filter((e) => e.path === FINAL_EVIDENCE_PATH
    || e.path.startsWith(`${FINAL_EVIDENCE_SEGMENTS.join('/')}/`));
  if (inside.length > 0) {
    throw new Error(`${FINAL_EVIDENCE_PATH} is inside the controlled set (${inside.length} entr`
      + 'y/entries): the evidence must live outside the state it certifies — add .cellular/ to .gitignore');
  }
}

/** @param {string} root @param {FinalRecord} record @returns {string} the record path */
export function appendEvidence(root, record) {
  const dir = join(root, ...FINAL_EVIDENCE_SEGMENTS);
  mkdirSync(dir, { recursive: true });
  const full = join(dir, FINAL_EVIDENCE_FILE);
  appendFileSync(full, `${JSON.stringify(record)}\n`, 'utf8');
  return full;
}

/**
 * The eight-step procedure, steps 4 to 8. Steps 1 to 3 (implement, record, prepare) are
 * the human's and the agent's; this function refuses to pretend they happened.
 * @param {{ root?: string, suite?: ReadonlyArray<Check>, now?: () => string,
 *   onProgress?: (line: string) => void }} [options]
 * @returns {{ ok: boolean, reason: string, record: FinalRecord,
 *   before: ReturnType<typeof repoState>, after: { fingerprint: string },
 *   diff: ReturnType<typeof diffEntries>, evidencePath: string }} */
export function runFinalVerification(options = {}) {
  const root = options.root ?? process.cwd();
  // An injected suite is the tests' own; otherwise the contract decides (./verification-suite.mjs).
  const selected = options.suite === undefined
    ? selectSuite(root)
    : { suite: options.suite, source: BUILT_IN, error: null };
  const suite = selected.suite;
  if (selected.source !== BUILT_IN) {
    options.onProgress?.(`${selected.error === null ? '✅' : '❌'} suite from ${selected.source} — `
      + `${selected.error === null ? `${suite.length} mandatory check(s)` : selected.error}`);
  }
  const now = options.now ?? (() => new Date().toISOString());
  const before = repoState(root);
  assertEvidenceOutside(before.entries);
  // STEP 4b, BEFORE the suite: the bytes about to be verified must be the bytes git would
  // commit. Running minutes of checks over bytes that will be converted on the way into the
  // index produces a green for a state that exists nowhere (./byte-equivalence.mjs).
  const equivalence = checkByteEquivalence(root, before.entries.map((entry) => entry.path));
  options.onProgress?.(`${equivalence.equivalent ? '✅' : '❌'} byte equivalence — `
    + `${equivalence.checked} file(s) compared, ${equivalence.differing.length} differing`);
  /** @type {CheckRecord[]} */
  const checks = [];
  // An empty suite is never a pass (`verdict`), so a refusal here cannot be mistaken for one.
  for (const check of equivalence.equivalent && selected.error === null ? suite : []) {
    const outcome = check.run(root);
    // A check that printed `node --test` counts is recorded WITH them: "exit 0" alone is a
    // claim nobody can audit (./test-counts.mjs). Checks with no counts are unchanged, and
    // the counts never decide the verdict — the exit code does.
    const counts = parseTestCounts(outcome.output);
    const skips = skipLines(outcome.output).map((line) => sanitizeSummary(line, root));
    const summary = counts === null
      ? sanitizeSummary(outcome.output, root)
      : countsSummary(counts);
    checks.push({
      name: check.name, exit: outcome.exit, summary,
      ...(counts === null ? {} : { counts }),
      ...(skips.length === 0 ? {} : { skips }),
    });
    options.onProgress?.(`${outcome.exit === 0 ? '✅' : '❌'} ${check.name} — exit ${outcome.exit}`
      + `${counts === null ? '' : ` · ${countsSummary(counts)}`}`);
    for (const line of skips) options.onProgress?.(`   ﹣ skipped: ${line}`);
  }
  const after = equivalence.equivalent ? fingerprintRepo(root) : before;
  const diff = diffEntries(before.entries, after.entries);
  // FAIL CLOSED, in this order: an unreadable or empty contract refuses before anything else,
  // because "the suite could not be established" is UNKNOWN and UNKNOWN is never green.
  const result = selected.error !== null
    ? { ok: false, reason: selected.error }
    : equivalence.equivalent
      ? verdict({ checks, before: before.fingerprint, after: after.fingerprint })
      : { ok: false, reason: equivalenceReason(equivalence) };
  const record = finalRecord({
    at: now(),
    fingerprint: before.fingerprint,
    tree: before.tree,
    head: before.head,
    checks,
    ok: result.ok,
    reason: result.reason,
    ...(after.fingerprint === before.fingerprint ? {} : { after: after.fingerprint }),
    equivalent: equivalence.equivalent,
    drifted: equivalence.differing.slice(0, MAX_RECORDED),
  });
  const evidencePath = appendEvidence(root, record);
  return { ok: result.ok, reason: result.reason, record, before, after, diff, evidencePath };
}

/** @param {ReturnType<typeof diffEntries>} diff @returns {string[]} */
function diffLines(diff) {
  return [
    ...diff.changed.map((p) => `  changed: ${p}`),
    ...diff.added.map((p) => `  added:   ${p}`),
    ...diff.removed.map((p) => `  removed: ${p}`),
  ];
}

/** @param {string[]} [argv] @returns {number} */
function main(argv = process.argv.slice(2)) {
  const root = process.cwd();
  const write = /** @type {(line: string) => void} */ ((line) => process.stdout.write(`${line}\n`));
  if (argv.includes('--help')) {
    write('verify-final — fingerprint the controlled state, run the mandatory suite, confirm');
    write('the state did not move, and record the evidence outside it. No options.');
    return 0;
  }
  let result;
  try {
    result = runFinalVerification({ root, onProgress: write });
  } catch (error) {
    write(`❌ final verification could not run: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  write(`controlled files: ${result.before.count}`);
  write(`fingerprint: sha256:${result.before.fingerprint}`);
  write(`tree: ${result.before.tree}  head: ${result.before.head ?? '(no commit)'}`);
  for (const line of diffLines(result.diff)) write(line);
  if (result.record.equivalent === false) {
    for (const path of result.record.drifted ?? []) write(`  not the committed bytes: ${path}`);
    write(`  → ${CORRECTIVE_ACTION}`);
  }
  for (const check of result.record.checks) {
    if (check.exit !== 0 && check.summary !== '') write(`  ${check.name}: ${check.summary}`);
  }
  write(`evidence appended: ${FINAL_EVIDENCE_PATH}`);
  write(result.ok
    ? `✅ final verification PASSED — ${result.reason}. Completion is authorized for THIS state only;`
      + ' any later modification invalidates it.'
    : `❌ final verification FAILED — ${result.reason}. Completion is NOT authorized.`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith('verify-final.mjs')) {
  process.exitCode = main();
}
