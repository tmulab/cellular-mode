#!/usr/bin/env node
// `npm run upp:conformance` — replay the corpus and print a matrix a human can paste.
//
// Exit code: 0 when nothing FAILED, 1 when something did. A SKIPPED or UNEXECUTED row does NOT
// fail the run — the machine simply does not have that toolchain — but it is printed on its own
// line with the reason, every time, because the only way a skip becomes a lie is by being quiet.
//
// `--require` is for the one caller that knows better: CI provisions Python, a JDK and a Rust
// toolchain, so there a SKIPPED row means broken provisioning rather than a bare machine, and
// the run must fail. See ./conformance-required.mjs.
import { IMPLEMENTATIONS } from './conformance-impl.mjs';
import { parseRequired, unmetRequirements } from './conformance-required.mjs';
import { loadCases, runAll, summarize } from './conformance-run.mjs';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`usage: node eip/upp-host/conformance-cli.mjs [--impl <name>]... [--require <a,b>] [--quiet]
  --impl <name>   run one implementation; repeatable. Known: ${IMPLEMENTATIONS.map((i) => i.name).join(' ')}
  --require <a,b> implementations that MUST have been executed: a SKIPPED or UNEXECUTED one
                  fails the run. For a provisioned runner; repeatable
  --quiet         print the matrix only, without the per-case detail of a failure
Exit: 0 when nothing FAILED (SKIPPED and UNEXECUTED do not fail unless --require names them),
1 when something FAILED or a requirement was unmet, 2 for a bad argument.\n`);
  process.exit(0);
}

/** @type {string[]} */
let required = [];
try {
  required = parseRequired(args);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}

/** @type {string[]} */
const only = [];
args.forEach((arg, i) => {
  if (arg === '--impl' && typeof args[i + 1] === 'string') only.push(String(args[i + 1]));
});
const quiet = args.includes('--quiet');

const cases = loadCases();
process.stdout.write(`upp conformance: ${cases.length} cases\n`);
const reports = await runAll(only.length > 0 ? { only, cases } : { cases });
process.stdout.write(`${summarize(reports).join('\n')}\n`);

for (const report of reports) {
  if (report.results.length === 0) {
    process.stdout.write(`  ${report.name}: ${report.status} — ${report.reason ?? 'no reason given'}\n`);
    continue;
  }
  if (quiet) continue;
  for (const result of report.results) {
    if (result.ok) continue;
    process.stdout.write(`  ${report.name}/${result.name}\n    ${result.breaches.join('\n    ')}\n`);
  }
}

const failed = reports.filter((report) => report.status === 'FAIL').map((report) => report.name);
if (failed.length > 0) {
  process.stdout.write(`FAILED: ${failed.join(', ')}\n`);
  process.exit(1);
}
const unmet = unmetRequirements(reports, required);
if (unmet.length > 0) {
  for (const line of unmet) process.stdout.write(`UNMET REQUIREMENT: ${line}\n`);
  process.exit(1);
}
process.stdout.write(required.length === 0
  ? 'no implementation FAILED\n'
  : `no implementation FAILED; every required one was executed: ${required.join(', ')}\n`);
