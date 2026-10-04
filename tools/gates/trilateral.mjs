#!/usr/bin/env node
// trilateral.mjs — Trilateral Verification: typecheck, build, tests. Three
// independent gates, three lines, counts included, nothing absorbed.
//
// The name and the semantics are preserved from the original rule. What changes in
// THIS repository is only what each leg can honestly report:
//
//   typecheck  REAL, since R-1 was resolved: `tsc --noEmit -p jsconfig.json` with
//              checkJs and strict, resolved from node_modules by ./typecheck.mjs, and
//              reported with the ERROR COUNT. If no checker resolves at all - a
//              checkout with no install - the leg falls back to the `node --check`
//              syntax pass and is labelled UNAVAILABLE (UNKNOWN), never ✅, because
//              syntax is not types.
//   build      no build step, so: MODULE-LOAD gate. Import every non-test module
//              that has no top-level statements (see top-level.mjs) and report how
//              many loaded and how many entry points were skipped.
//   tests      `node --test`, with the pass/fail counts it reports.
//
// EXIT CODE: 0 when build and tests are green and typecheck is not a failure.
// UNAVAILABLE keeps the exit code at 0 but the line stays a warning. Hiding an
// unverified leg behind a green tick is the thing this rule exists to prevent.
//
// `--evidence` additionally writes `.cellular/evidence/trilateral.json` (gitignored) from
// THE RESULTS THIS RUN COMPUTED — never a synthesised leg. It exists so that a reader
// which cannot spawn a process, such as `observer.audit`, can report these three legs
// without pretending to have run them. The shape is `./evidence.mjs`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVIDENCE_FILE, EVIDENCE_PATH, EVIDENCE_SEGMENTS, evidenceRecord } from './evidence.mjs';
import { readGitHead } from './git-head.mjs';
import { ROOT, readTuples } from './scan.mjs';
import { LEGS, exitCodeFor, selectedLegs, testsResult } from './trilateral-legs.mjs';
import { partitionModules } from './top-level.mjs';
import { runTypecheck } from './typecheck.mjs';

/** @typedef {import('./types.mjs').FileTuple} FileTuple */
/** @typedef {import('./types.mjs').LegResult} LegResult */

/** @type {() => FileTuple[]} */
const sourceFiles = () => readTuples(ROOT, (rel) => rel.endsWith('.mjs') && !/(^|\/)(node_modules|\.git)\//.test(rel));

// `shell` is used ONLY to look up a PATH command such as `tsc` (on Windows it is a
// .cmd shim that spawnSync cannot execute directly). It is never used for
// process.execPath: that path contains spaces, and a shell would split it.
/** @type {(cmd: string, args: string[], shell?: boolean) => import('node:child_process').SpawnSyncReturns<string>} */
const run = (cmd, args, shell = false) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell });

const MARK = { pass: '✅', fail: '❌', warn: '⚠️' };
/** @type {(result: LegResult) => string} */
const line = (result) => `${MARK[result.status === 'pass' ? 'pass' : result.status === 'fail' ? 'fail' : 'warn']} ${result.text}`;

/** @param {ReadonlyArray<FileTuple>} files @returns {LegResult} */
function typecheckLeg(files) {
  const checked = runTypecheck();
  if (checked.ran) {
    return {
      status: checked.ok ? 'pass' : 'fail',
      text: `typecheck: ${checked.command} — ${checked.errors} error(s)`,
      errors: checked.errors,
      ...(checked.ok ? {} : { detail: checked.output.split('\n').slice(0, 25).join('\n  ') }),
    };
  }
  const bad = files.filter((f) => run(process.execPath, ['--check', join(ROOT, f.path)]).status !== 0);
  if (bad.length) {
    return { status: 'fail', text: `typecheck: syntax check FAILED on ${bad.length} file(s): ${bad.map((f) => f.path).join(', ')}` };
  }
  return {
    status: 'warn',
    text: `typecheck: UNAVAILABLE — no TypeScript toolchain (UNKNOWN); syntax-only check: ${files.length} files OK`,
  };
}

/** @param {ReadonlyArray<FileTuple>} files @returns {Promise<LegResult>} */
async function buildLeg(files) {
  const { load, skipped } = partitionModules(files);
  /** @type {string[]} */
  const broken = [];
  for (const rel of load) {
    try {
      await import(new URL(`../../${rel}`, import.meta.url).href);
    } catch (error) {
      const first = (error instanceof Error ? error.message : String(error)).split('\n')[0];
      broken.push(`${rel}: ${first}`);
    }
  }
  if (broken.length) {
    return { status: 'fail', text: `build: module-load gate FAILED on ${broken.length} module(s)`, detail: broken.join('\n  ') };
  }
  return {
    status: 'pass',
    modules: load.length,
    text: `build: no build step — module-load gate: ${load.length} modules imported`
      + ` (${skipped.length} skipped: ${skipped.filter((s) => s.reason.startsWith('test')).length} tests,`
      + ` ${skipped.filter((s) => !s.reason.startsWith('test')).length} entry points)`,
  };
}

/** @returns {LegResult} */
function testsLeg() {
  const out = run(process.execPath, ['--test', '--test-reporter=tap']);
  return testsResult(`${out.stdout ?? ''}\n${out.stderr ?? ''}`, out.status);
}

/** The legs `only` names, and nothing else. A leg not asked for is ABSENT from the answer —
 * never a synthesised pass.
 * @param {ReadonlyArray<'typecheck' | 'build' | 'tests'>} [only]
 * @returns {Promise<Partial<Record<'typecheck' | 'build' | 'tests', LegResult>>>} */
export async function trilateral(only = LEGS) {
  const files = only.length === 0 ? [] : sourceFiles();
  return {
    ...(only.includes('typecheck') ? { typecheck: typecheckLeg(files) } : {}),
    ...(only.includes('build') ? { build: await buildLeg(files) } : {}),
    ...(only.includes('tests') ? { tests: testsLeg() } : {}),
  };
}

/**
 * Write the record for the legs THIS run computed. The caller passes the very objects it
 * printed, so the file cannot say something the terminal did not.
 * @param {{ typecheck: LegResult, build: LegResult, tests: LegResult }} legs
 * @param {string} [root] @returns {string} the repository-relative path written
 */
export function writeEvidence(legs, root = ROOT) {
  const record = evidenceRecord({
    legs,
    at: new Date().toISOString(),
    head: readGitHead(root),
  });
  const dir = join(root, ...EVIDENCE_SEGMENTS);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, EVIDENCE_FILE), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return EVIDENCE_PATH;
}

/** @param {string[]} [argv] */
async function main(argv = process.argv.slice(2)) {
  /** @type {Array<'typecheck' | 'build' | 'tests'>} */
  let only;
  try {
    only = selectedLegs(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  const results = await trilateral(only);
  for (const key of LEGS) {
    const leg = results[key];
    // A leg that did not run SAYS so, in the same place a reader looks for its verdict.
    if (leg === undefined) {
      process.stdout.write(`⚠️ ${key}: NOT RUN — this invocation asked for ${only.join(', ')}\n`);
      continue;
    }
    process.stdout.write(`${line(leg)}\n`);
    if (leg.detail) process.stderr.write(`  ${leg.detail}\n`);
  }
  if (argv.includes('--evidence')) {
    // A record of fewer than three legs would be read as a Trilateral Verification. It is not.
    if (only.length !== LEGS.length) {
      process.stderr.write('--evidence needs all three legs: a partial record would be read as a full one\n');
      return 2;
    }
    const { typecheck, build, tests } = results;
    if (typecheck !== undefined && build !== undefined && tests !== undefined) {
      process.stdout.write(`evidence: wrote ${writeEvidence({ typecheck, build, tests })} (gitignored)\n`);
    }
  }
  return exitCodeFor(results);
}

if (process.argv[1] && process.argv[1].endsWith('trilateral.mjs')) {
  process.exitCode = await main();
}
