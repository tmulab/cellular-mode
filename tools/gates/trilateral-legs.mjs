// trilateral-legs.mjs — PURE. The decisions of Trilateral Verification, with nothing that
// spawns a process: which legs an invocation runs, what a `node --test` summary MEANS, and
// which exit code follows from the three results.
//
// Split out of ./trilateral.mjs at the 200-line rule, and the split falls where the review
// does: everything here can be asserted on captured output, so the rules below are tested on
// real reporter text (tests/gates-trilateral.test.mjs) instead of by arranging a suite that
// cancels itself. ./trilateral.mjs keeps the part that actually runs things.
//
// Both rules in here were written by the same incident: the first remote CI run reported
// `989 passed, 2 failed, 993 total` from a step called `build`, with no test name anywhere in
// the log. Hence `--legs`, so CI can run the legs as separate steps, and hence a tests leg
// that refuses a summary whose parts do not reach its total (tools/gates/CI.md).
import { countsProblem, parseCountsValue } from './count-tests.mjs';

/** @typedef {import('./types.mjs').LegResult} LegResult */

/** PURE. Parses the counts out of `node --test` output (TAP or spec reporter). Every outcome
 * the runner reports is read, not only pass and fail: `cancelled`, `skipped` and `todo` are
 * what make the total auditable, and a cancelled test is how the first remote CI run managed
 * to print `989 passed, 2 failed, 993 total` without naming the two missing results.
 * @param {string} output
 * @returns {{ pass: number | null, fail: number | null, total: number | null,
 *   skipped: number | null, cancelled: number | null, todo: number | null }} */
export function parseTestCounts(output) {
  /** @type {(label: string) => number | null} */
  const pick = (label) => {
    const m = new RegExp(`^(?:#|ℹ)\\s*${label}\\s+(\\d+)`, 'm').exec(output ?? '');
    return m ? Number(m[1]) : null;
  };
  return {
    pass: pick('pass'),
    fail: pick('fail'),
    total: pick('tests'),
    skipped: pick('skipped'),
    cancelled: pick('cancelled'),
    todo: pick('todo'),
  };
}

/**
 * PURE. The tests leg, from what the runner printed and the code it exited with. Pure so the
 * rules below can be asserted on captured output instead of by arranging a suite that
 * cancels itself.
 * @param {string} output @param {number | null} exit @returns {LegResult}
 */
export function testsResult(output, exit) {
  const read = parseTestCounts(output);
  const counts = {
    passed: read.pass, failed: read.fail, total: read.total,
    skipped: read.skipped, cancelled: read.cancelled, todo: read.todo,
  };
  if (read.pass === null || read.fail === null || read.total === null) {
    return { status: 'fail', text: 'tests: could not parse the reporter output', counts, detail: output.slice(-500) };
  }
  const measured = countsProblem(parseCountsValue({
    tests: read.total, pass: read.pass, fail: read.fail,
    skipped: read.skipped, cancelled: read.cancelled, todo: read.todo,
  }));
  const text = `tests: ${read.pass} passed, ${read.fail} failed, ${read.total} total`
    + ` (${read.skipped ?? '?'} skipped, ${read.cancelled ?? '?'} cancelled, ${read.todo ?? '?'} todo)`;
  if (measured !== null) return { status: 'fail', counts, text: `${text} — ${measured}` };
  return { status: exit === 0 ? 'pass' : 'fail', counts, text: `${text} (node --test)` };
}

/** The legs, in the order the rule names them. */
export const LEGS = Object.freeze(/** @type {const} */ (['typecheck', 'build', 'tests']));

/**
 * PURE. Which legs an invocation runs: all three by default, or the ones `--legs a,b` names
 * (`--build-only` is the short form of `--legs typecheck,build`). CI needs this because it
 * runs the legs as separate STEPS: the first remote run called this script from a step named
 * `build`, that call ran the whole suite, and a test failure was therefore reported as a
 * build failure with no test name in the log. An unknown leg THROWS: a typo that silently
 * ran nothing would be a gate that cannot fail.
 * @param {ReadonlyArray<string>} argv @returns {Array<'typecheck' | 'build' | 'tests'>}
 */
export function selectedLegs(argv) {
  if (argv.includes('--build-only')) return ['typecheck', 'build'];
  const at = argv.indexOf('--legs');
  if (at === -1) return [...LEGS];
  const named = (argv[at + 1] ?? '').split(',').map((part) => part.trim()).filter((part) => part !== '');
  if (named.length === 0) throw new TypeError(`--legs needs a comma-separated list of: ${LEGS.join(' ')}`);
  for (const leg of named) {
    if (!LEGS.includes(/** @type {'typecheck'} */ (leg))) {
      throw new TypeError(`--legs: unknown leg "${leg}"; the legs are ${LEGS.join(' ')}`);
    }
  }
  return LEGS.filter((leg) => named.includes(leg));
}

/** PURE. The results in, one exit code out. Only the STATUS of each leg is read, so that is
 * all the parameter asks for. A leg that was NOT RUN is absent, and an absent leg is never a
 * pass: a run that executed nothing established nothing, so it cannot exit 0.
 * @param {Partial<Record<'typecheck' | 'build' | 'tests', { status: string }>>} legs
 * @returns {number} */
export function exitCodeFor({ typecheck, build, tests }) {
  if (typecheck !== undefined && typecheck.status === 'fail') return 1;
  const executed = [build, tests].filter((leg) => leg !== undefined);
  if (executed.some((leg) => leg.status !== 'pass')) return 1;
  return typecheck === undefined && executed.length === 0 ? 1 : 0;
}
