// Finding the compilers and interpreters a polyglot conformance run needs — and saying so
// when they are absent.
//
// This is the ONE module besides `channel.mjs` that starts a program, and the split is the
// point: `channel.mjs` starts a PLUGIN and speaks the protocol to it; this module asks a
// toolchain for its version and, for Rust, compiles a source file. Those are build-time
// actions, they are synchronous, they produce no protocol conversation, and keeping them here
// means a reviewer can see every place in the runtime that can execute something by reading
// two files. `shell: false` and an argv array in both.
//
// The rule that matters more than any of it: an ABSENT toolchain is `SKIPPED` with a reason,
// never a pass. A suite that reports green for a language it never ran is worse than a suite
// that reports nothing, because somebody will believe it.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** @typedef {{ ok: true, version: string } | { ok: false, reason: string }} Probe */
/** @typedef {{ ok: true, exe: string, version: string } | { ok: false, reason: string }} Build */

const PROBE_TIMEOUT_MS = 20_000;

/** The environment variables that may name a JDK, in order of precedence. `UPP_JAVA_HOME`
 * exists so an operator can point the conformance run at a second JDK without disturbing the
 * `JAVA_HOME` the rest of their machine uses. No absolute path is written down here: a
 * hard-coded install location is a fact about ONE machine, it rots silently, and
 * `tests/leaks.test.mjs` refuses it on purpose. @type {ReadonlyArray<string>} */
export const JDK_HOME_VARS = Object.freeze(['UPP_JAVA_HOME', 'JAVA_HOME']);

/** Run `command` and return its first line of output, or why it could not run. Stderr is read
 * too: `java -version` writes its version THERE, which is exactly the kind of detail that
 * makes a probe report "absent" for a toolchain that is present.
 * @param {ReadonlyArray<string>} command @returns {Probe} */
export function probe(command) {
  // Windows app-execution aliases (the WindowsApps `python`) can exit 0 with NO output when the
  // machine is busy; Article 8's final run caught it (2026-10-03). Only that exact symptom is
  // retried, at most twice; a real absence or failure is still reported on the first answer.
  let result = probeOnce(command);
  for (let retry = 0; retry < 2 && !result.ok && result.reason.endsWith('printed no version'); retry += 1) {
    result = probeOnce(command);
  }
  return result;
}

/** @param {ReadonlyArray<string>} command @returns {Probe} */
function probeOnce(command) {
  const [exe, ...args] = command;
  if (exe === undefined) return { ok: false, reason: 'no executable given' };
  /** @type {import('node:child_process').SpawnSyncReturns<string>} */
  let run;
  try {
    run = spawnSync(exe, args, {
      shell: false, encoding: 'utf8', timeout: PROBE_TIMEOUT_MS, windowsHide: true,
    });
  } catch (cause) {
    return { ok: false, reason: `${exe} could not be started: ${String(cause)}` };
  }
  if (run.error !== undefined) return { ok: false, reason: `${exe}: ${run.error.message}` };
  if (run.status !== 0) return { ok: false, reason: `${exe} exited ${String(run.status)}` };
  const text = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim();
  const first = text.split('\n')[0]?.trim() ?? '';
  return first === ''
    ? { ok: false, reason: `${exe} printed no version` }
    : { ok: true, version: first };
}

/** The `java` to use: the first of `JDK_HOME_VARS` that holds a directory with a `java` in
 * its `bin`, else whatever is on `PATH` — and the last of those is reported as `PATH` rather
 * than silently trusted, because a `java` on `PATH` is often a launcher for a much older
 * runtime than the JDK beside it.
 * @param {NodeJS.ProcessEnv} [env] @returns {{ exe: string, from: string }} */
export function javaExecutable(env = process.env) {
  for (const name of JDK_HOME_VARS) {
    const home = env[name];
    if (typeof home !== 'string' || home.trim() === '') continue;
    for (const leaf of ['java.exe', 'java']) {
      const candidate = join(home, 'bin', leaf);
      if (existsSync(candidate)) return { exe: candidate, from: name };
    }
  }
  return { exe: 'java', from: 'PATH' };
}

/** `java -version` says 21 or newer. Checked rather than assumed: single-file source launch
 * needs 11+, and the fixture uses 21-era syntax, so a Java 8 wrapper must be SKIPPED.
 * @param {string} version @returns {boolean} */
export function isJava21OrNewer(version) {
  const match = /version "(\d+)/.exec(version);
  const major = match === null ? 0 : Number(match[1]);
  return major >= 21;
}

/** The exact rustc invocation, as data so the README and the runner cannot disagree. Debug,
 * not release: the corpus measures conformance, not speed, and `-O` cost about forty seconds
 * per run on the machine this was written on. @type {ReadonlyArray<string>} */
export const RUSTC_FLAGS = Object.freeze(['--edition', '2021']);

/**
 * Compile a single Rust source with `rustc` into a fresh directory under `os.tmpdir()`.
 * std only: no `cargo`, no registry, no network, nothing fetched. A failure is a REASON, not
 * an exception — a missing compiler must read as SKIPPED and a broken source as FAILED, and a
 * throw here would blur the two.
 * @param {string} source absolute path to the `.rs` file @param {string} [rustc]
 * @returns {Build}
 */
export function buildRust(source, rustc = 'rustc') {
  const version = probe([rustc, '--version']);
  if (!version.ok) return { ok: false, reason: `rustc is absent: ${version.reason}` };
  if (!existsSync(source)) return { ok: false, reason: `the Rust source is missing: ${source}` };
  const out = mkdtempSync(join(tmpdir(), 'upp-rust-'));
  const exe = join(out, process.platform === 'win32' ? 'upp-plugin.exe' : 'upp-plugin');
  const run = spawnSync(rustc, [...RUSTC_FLAGS, '-o', exe, source], {
    shell: false, encoding: 'utf8', timeout: 180_000, windowsHide: true,
  });
  if (run.error !== undefined) return { ok: false, reason: `rustc failed to start: ${run.error.message}` };
  if (run.status !== 0) {
    const why = `${run.stderr ?? ''}`.trim().split('\n').slice(0, 4).join(' | ');
    return { ok: false, reason: `rustc exited ${String(run.status)}: ${why}` };
  }
  if (!existsSync(exe)) return { ok: false, reason: 'rustc reported success but produced no binary' };
  return { ok: true, exe, version: version.version };
}
