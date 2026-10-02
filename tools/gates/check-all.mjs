#!/usr/bin/env node
// check-all.mjs — runs the four static gates and reports every finding with an
// address. Exit 2 on any finding, 0 on none. There is no "warning" tier for a
// FINDING: a gate that can be ignored is documentation, not a gate. Items that
// genuinely cannot be automated are listed in tools/gates/README.md under human
// review, not downgraded to a warning here.
//
// There IS one warning tier, and it is about policy rather than code: an exception
// whose `approvedBy` is still PENDING is honoured for a development run but printed
// as ⚠️ WITH A COUNT, never silently. `--release` turns those warnings, and any
// unresolved relaxation, into exit 2 — so "release-ready" is a command and not an
// opinion. See tools/gates/release.mjs and policy/relaxations.md.
//
// This file is the disk-reading shell. All of the logic lives in the pure modules it
// imports, which is why the tests can exercise the rules without a repository.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readPackageJson, readPolicy, readTuples } from './scan.mjs';
import { checkSize, inScope as sizeInScope, ranking } from './size.mjs';
import { checkSecrets } from './secrets.mjs';
import { checkDeps } from './deps.mjs';
import { checkBoundaries, toFindings } from './boundaries.mjs';
import { pendingApprovals, releaseBlockers } from './release.mjs';
import { typecheckAvailable } from './typecheck.mjs';

/** @typedef {import('./types.mjs').Finding} Finding */

const CODE = /\.(mjs|js)$/;

/** @param {string} [root] */
export function runGates(root = ROOT) {
  const all = readTuples(root, () => true);
  const code = all.filter((f) => CODE.test(f.path));
  /** @type {Finding[]} */
  const findings = [];
  findings.push(...checkSize(all.filter((f) => sizeInScope(f.path)), readPolicy('size-exceptions.json', [], root)));
  findings.push(...checkSecrets(all, readPolicy('secrets-allowlist.json', [], root)));
  findings.push(...checkDeps({
    pkg: readPackageJson(root),
    files: code,
    policy: readPolicy('allowed-dependencies.json', { allowed: [] }, root),
  }));
  findings.push(...toFindings(checkBoundaries(code)));
  return { findings, scanned: all.length, code: code.length, ranking: ranking(all) };
}

/** Everything `--release` needs, read from disk once. The type-checker probe is the
 * SAME function trilateral.mjs runs on (`./typecheck.mjs`), so the two can never
 * disagree about whether the third leg is real.
 * @param {string} [root] */
export function releaseInput(root = ROOT) {
  let relaxationsText = '';
  try {
    relaxationsText = readFileSync(join(root, 'policy', 'relaxations.md'), 'utf8');
  } catch {
    relaxationsText = '## R-? — policy/relaxations.md is missing\n- **Status:** UNKNOWN';
  }
  return {
    secretsAllowlist: readPolicy('secrets-allowlist.json', [], root),
    sizeExceptions: readPolicy('size-exceptions.json', [], root),
    allowedDependencies: readPolicy('allowed-dependencies.json', { allowed: [] }, root),
    relaxationsText,
    typecheckAvailable: typecheckAvailable(root),
  };
}

/** @param {ReturnType<typeof releaseInput>} input */
function reportPending(input) {
  const pending = [
    ...pendingApprovals(input.secretsAllowlist, 'policy/secrets-allowlist.json'),
    ...pendingApprovals(input.sizeExceptions, 'policy/size-exceptions.json'),
    ...pendingApprovals(/** @type {{ allowed?: unknown }} */ (input.allowedDependencies ?? {}).allowed,
      'policy/allowed-dependencies.json'),
  ];
  if (pending.length === 0) {
    process.stdout.write('✅ pending exceptions: 0\n');
    return;
  }
  process.stdout.write(`⚠️ ${pending.length} pending exception(s) honoured for development, NOT approved:\n`);
  for (const p of pending) {
    process.stdout.write(`  ⚠️ ${p.source} · ${p.path} (rule ${p.rule}) · approvedBy "${p.approvedBy}"\n`);
  }
}

/** @param {string[]} [argv] */
function main(argv = process.argv.slice(2)) {
  const release = argv.includes('--release');
  const { findings, scanned, code, ranking: top } = runGates();
  process.stdout.write(`gates: scanned ${scanned} files (${code} modules)\n`);
  if (findings.length === 0) {
    process.stdout.write('✅ size · ✅ secrets · ✅ deps · ✅ boundaries — no findings\n');
    process.stdout.write(`largest in-scope files: ${top.map((/** @type {{ path: string, lines: number }} */ f) => `${f.path} (${f.lines})`).join(', ')}\n`);
  } else {
    process.stdout.write(`❌ ${findings.length} finding(s)\n`);
    for (const f of findings) process.stdout.write(`  ${f.rule} · ${f.path}\n      ${f.detail}\n`);
  }
  const input = releaseInput();
  reportPending(input);
  if (!release) return findings.length === 0 ? 0 : 2;
  const blockers = releaseBlockers(input);
  if (blockers.length === 0 && findings.length === 0) {
    process.stdout.write('✅ release: no blockers — every exception approved, every relaxation resolved\n');
    return 0;
  }
  process.stdout.write(`❌ release: ${blockers.length} blocker(s)\n`);
  for (const b of blockers) process.stdout.write(`  ${b.id} · ${b.detail}\n`);
  return 2;
}

if (process.argv[1] && process.argv[1].endsWith('check-all.mjs')) {
  process.exitCode = main();
}
