// conformance-required.mjs — PURE. What `--require` means, and nothing else.
//
// The conformance runner treats a missing toolchain as SKIPPED and does not fail: on a
// developer machine that is the honest answer, and failing there would only teach people to
// stop running it. A CI runner is a different claim. It is PROVISIONED with Python, a JDK and
// a Rust toolchain, so a SKIPPED row there does not mean "no toolchain", it means "the
// provisioning broke" — and a matrix that reads PASS while three of its six rows were skipped
// is a false green of exactly the kind Article 8 exists to refuse.
//
// So the requirement is an EXPLICIT argument, named per implementation, rather than a mode: the
// workflow states which rows it expects to have been executed, and anything else it may still
// skip. `cpp` is deliberately requirable by this function and deliberately never required by
// the workflow: its source has never been compiled anywhere in this project.
import { IMPLEMENTATIONS } from './conformance-impl.mjs';

/** @typedef {import('./conformance-run.mjs').Report} Report */

/** The only status that proves an implementation actually replayed the corpus. */
const EXECUTED = 'PASS';

/**
 * PURE. The names `--require` asked for, validated against the implementations this build
 * knows. An unknown name THROWS rather than being ignored: a typo that silently required
 * nothing would be worse than no option at all.
 * @param {ReadonlyArray<string>} argv @returns {string[]}
 */
export function parseRequired(argv) {
  const known = IMPLEMENTATIONS.map((impl) => impl.name);
  /** @type {string[]} */
  const names = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--require') continue;
    const value = (argv[i + 1] ?? '').split(',').map((part) => part.trim()).filter((part) => part !== '');
    if (value.length === 0) {
      throw new TypeError('--require needs a comma-separated list of implementation names,'
        + ` one or more of: ${known.join(' ')}`);
    }
    for (const name of value) {
      if (!known.includes(name)) {
        throw new TypeError(`--require: unknown implementation "${name}";`
          + ` this build knows ${known.join(' ')}`);
      }
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

/**
 * PURE. One sentence per requirement the run did not meet. Empty means every required
 * implementation actually replayed the corpus.
 * @param {ReadonlyArray<Report>} reports @param {ReadonlyArray<string>} required
 * @returns {string[]}
 */
export function unmetRequirements(reports, required) {
  /** @type {string[]} */
  const unmet = [];
  for (const name of required) {
    const report = reports.find((candidate) => candidate.name === name);
    if (report === undefined) {
      unmet.push(`${name} was REQUIRED but did not run in this invocation`);
      continue;
    }
    if (report.status === EXECUTED) continue;
    const reason = report.reason === undefined || report.reason === '' ? '' : ` — ${report.reason}`;
    unmet.push(`${name} was REQUIRED but is ${report.status}${reason}`);
  }
  return unmet;
}
