#!/usr/bin/env node
// verify-final.mjs — Article 8, as a command: `npm run verify:final`.
//
// THE ORDER IS THE RULE. Fingerprint the controlled state, run the complete mandatory
// suite, fingerprint again, and authorize completion only when every check passed AND the
// two fingerprints are identical. A green suite over a state that moved underneath it is
// exactly what produced commit 523cb44 (policy/relaxations.md R-4), so "the state did not
// change" is a CHECK here, not an assumption.
//
// The suite is DATA (`MANDATORY_SUITE`) and injectable, which is how the tests exercise
// the ordering — including a stub that modifies a file mid-run — without spending minutes
// per case. The checks themselves are this repository's existing gates; nothing is
// weakened, and `check-all --release` is run in full.
//
// The evidence is appended OUTSIDE the verified state (see ./final-evidence.mjs) and the
// run REFUSES to proceed if that is ever untrue.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { diffEntries, fingerprintRepo, repoState } from './fingerprint.mjs';
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
/** @typedef {{ exit: number, output: string }} CheckOutcome */
/** @typedef {{ name: string, run: (root: string) => CheckOutcome }} Check */

/** `shell` is true ONLY for `npm`, which on Windows is a .cmd shim that spawnSync cannot
 * execute directly. The node binary is always spawned without a shell: its path contains
 * spaces and a shell would split it. Same reasoning as tools/gates/trilateral.mjs.
 * @param {string} root @param {string} cmd @param {ReadonlyArray<string>} args
 * @param {boolean} [shell] @returns {CheckOutcome} */
function spawnCheck(root, cmd, args, shell = false) {
  // With `shell`, the command travels as ONE string and the argument list stays empty:
  // node deprecates passing args beside `shell: true` because they are concatenated
  // unescaped. Every string here is a literal in this file, never input.
  const command = shell ? [cmd, ...args].join(' ') : cmd;
  const result = spawnSync(command, shell ? [] : [...args], {
    cwd: root, encoding: 'utf8', shell, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) return { exit: 1, output: `could not run ${cmd}: ${result.error.message}` };
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { exit: typeof result.status === 'number' ? result.status : 1, output };
}

/** @type {(root: string, args: ReadonlyArray<string>) => CheckOutcome} */
const node = (root, args) => spawnCheck(root, process.execPath, args);

/**
 * THE COMPLETE MANDATORY SUITE, as data. Four checks, in the order a reader would run
 * them: types, tests, the static gates in release mode, and the method's own state
 * integrity. Adding a check here adds it to the rule; removing one is a relaxation and
 * needs the clause in docs/00-constitution.md to say so.
 * @type {ReadonlyArray<Check>} */
export const MANDATORY_SUITE = Object.freeze([
  { name: 'typecheck', run: (root) => spawnCheck(root, 'npm', ['run', 'typecheck'], true) },
  { name: 'tests', run: (root) => node(root, ['--test']) },
  { name: 'gates-release', run: (root) => node(root, ['tools/gates/check-all.mjs', '--release']) },
  { name: 'cell-state', run: (root) => node(root, ['tools/cellmode/cli.mjs', 'check']) },
]);

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
  const suite = options.suite ?? MANDATORY_SUITE;
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
  for (const check of equivalence.equivalent ? suite : []) {
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
  const result = equivalence.equivalent
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
