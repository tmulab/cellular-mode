// exec-shim.mjs — H7, the Bootstrap half: the ONE place that turns a package-manager shim into an
// argv `spawn` can actually start. Every check `exec.runCheck` runs passes through it — the
// approved adoption baseline, and `verification run`.
//
// WHY A SECOND COPY EXISTS. The identical rule lives in `tools/gates/verification-suite.mjs` for
// the verify-final side. `tools/bootstrap/**` may not import `tools/gates/**` (bootstrap/CONTRACTS.md,
// import boundary: the gates are COPIED as data, never imported), so the rule is MIRRORED rather
// than shared — and `tests/verification-shim.test.mjs`, the one suite allowed to import both,
// asserts the two resolvers answer IDENTICALLY for every input in a table. Drift is a test failure.
//
// NEVER A SHELL (trial finding B-09). On Windows `npm` is `npm.cmd`, which `spawn` without a shell
// cannot start, and `shell: true` is precisely what this module exists to avoid: a check's argv is
// untrusted data, and a shell would make a `;` in it punctuation. So the shim is resolved to the
// Node script it wraps — `<dirname(node)>/node_modules/npm/bin/npm-cli.js` — and run as
// `[node, <that script>, …rest]`. The list is CLOSED and the match is on an EXACT `argv[0]`:
// `cmd /c`, `./npm.cmd`, `npm.exe` and every other wrapper stay refused, as before.
//
// WHEN IT CANNOT RESOLVE the answer is `not-runnable` with the non-shell alternative spelled out,
// never a shell and never a silent skip. On anything but win32 the argv is returned UNCHANGED.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** @typedef {{ argv: ReadonlyArray<string>, resolved: boolean, reason: string | null }} ShimResult */

/** The closed list: the shim's exact `argv[0]`, and the Node script npm ships for it. */
export const SHIMS = Object.freeze({ npm: 'npm-cli.js', npx: 'npx-cli.js' });

/** The alternative a human is handed when resolution fails. It is a NON-SHELL one on purpose. */
export const SHIM_ALTERNATIVE = 'use ["node", ...] directly, e.g. node --test';

/** The one wording of the refusal. Mirrored character for character in
 * `tools/gates/verification-suite.mjs`; `tests/verification-shim.test.mjs` compares them.
 * @param {string} program @param {string} cli @returns {string} */
export function shimReason(program, cli) {
  return `${program} is a Windows .cmd shim and no shell is ever used for a check; ${cli} is not`
    + ` there either — ${SHIM_ALTERNATIVE}`;
}

/**
 * PURE given `deps`. The argv that should actually be spawned for `argv`, or the reason there is
 * none. TOTAL: every input gets an answer, and a non-Windows platform gets its argv back.
 * @param {ReadonlyArray<string>} argv
 * @param {{ platform?: string | undefined, execPath?: string | undefined,
 *   exists?: ((path: string) => boolean) | undefined }} [deps]
 * @returns {ShimResult}
 */
export function resolveShimArgv(argv, deps = {}) {
  const list = Object.freeze([...(Array.isArray(argv) ? argv : [])].map(String));
  const platform = deps.platform ?? process.platform;
  const program = list[0] ?? '';
  const script = Object.hasOwn(SHIMS, program)
    ? /** @type {Record<string, string>} */ (SHIMS)[program]
    : undefined;
  if (platform !== 'win32' || script === undefined) {
    return { argv: list, resolved: false, reason: null };
  }
  const execPath = deps.execPath ?? process.execPath;
  const cli = join(dirname(execPath), 'node_modules', 'npm', 'bin', script);
  if (!(deps.exists ?? existsSync)(cli)) {
    return { argv: list, resolved: false, reason: shimReason(program, cli) };
  }
  return { argv: Object.freeze([execPath, cli, ...list.slice(1)]), resolved: true, reason: null };
}
