// The implementations under test, as a table a reviewer can read in one sitting.
//
// Each row says how to START the implementation and, when it cannot be started, WHY — in words
// that go straight into the interop record. Three statuses, and the distinction between them is
// the honest part:
//   READY ....... the toolchain is here, the implementation will be replayed
//   SKIPPED ..... the toolchain is absent; the corpus was NOT run and nothing is claimed
//   UNEXECUTED .. the source exists and was never executed on this machine, by design
//
// Nothing here spawns a plugin: `prepare` returns an argv array, and the one place that turns
// an argv array into a running plugin is `channel.mjs`.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildRust, isJava21OrNewer, javaExecutable, probe } from './toolchains.mjs';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CONFORMANCE_DIR = join(ROOT, 'upp', 'conformance');
export const CASES_DIR = join(CONFORMANCE_DIR, 'cases');
export const REFERENCE_MANIFEST = join(CONFORMANCE_DIR, 'manifest.json');

/** @typedef {{ ok: true, command: string[], cwd: string, version: string }
 *   | { ok: false, status: 'SKIPPED' | 'UNEXECUTED', reason: string }} Prepared */
/** @typedef {{ name: string, language: string, kind: 'process' | 'in-process' | 'source-only',
 *   dir: string, prepare: () => Prepared }} Implementation */

/** @type {(name: string) => string} */
const example = (name) => join(ROOT, 'examples', name);

/** Probing a toolchain starts a program and compiling Rust starts a compiler, so `prepare` is
 * memoised per process: three callers asking "is Rust available?" must not mean three builds.
 * The cache is per Node process, which is also the lifetime of a conformance run.
 * @type {Map<string, Prepared>} */
const prepared = new Map();

/** @type {(name: string, make: () => Prepared) => Prepared} */
function once(name, make) {
  const hit = prepared.get(name);
  if (hit !== undefined) return hit;
  const made = make();
  prepared.set(name, made);
  return made;
}
/** @type {(status: 'SKIPPED' | 'UNEXECUTED', reason: string) => Prepared} */
const no = (status, reason) => ({ ok: false, status, reason });

/** @type {(dir: string, file: string) => string | null} */
function sourceIn(dir, file) {
  const path = join(dir, file);
  return existsSync(path) ? path : null;
}

/** @type {Implementation[]} */
export const IMPLEMENTATIONS = [
  {
    name: 'in-process',
    language: 'JavaScript (in-process, no child process)',
    kind: 'in-process',
    dir: join(ROOT, 'eip', 'upp-host', 'fixtures'),
    prepare: () => ({ ok: true, command: [], cwd: ROOT, version: `node ${process.version}` }),
  },
  {
    name: 'node',
    language: 'JavaScript (child process)',
    kind: 'process',
    dir: example('upp-node'),
    prepare() {
      const source = sourceIn(this.dir, 'plugin.mjs');
      if (source === null) return no('SKIPPED', 'examples/upp-node/plugin.mjs is missing');
      return { ok: true, command: [process.execPath, source, REFERENCE_MANIFEST], cwd: this.dir, version: `node ${process.version}` };
    },
  },
  {
    name: 'python',
    language: 'Python 3 (standard library only)',
    kind: 'process',
    dir: example('upp-python'),
    prepare() {
      const { dir } = this;
      return once(this.name, () => {
        const source = sourceIn(dir, 'plugin.py');
        if (source === null) return no('SKIPPED', 'examples/upp-python/plugin.py is missing');
        const found = probe(['python', '--version']);
        if (!found.ok) return no('SKIPPED', `python is absent: ${found.reason}`);
        return { ok: true, command: ['python', source, REFERENCE_MANIFEST], cwd: dir, version: found.version };
      });
    },
  },
  {
    name: 'java',
    language: 'Java 21 (single-file source launch, no build tool)',
    kind: 'process',
    dir: example('upp-java'),
    prepare() {
      const { dir } = this;
      return once(this.name, () => {
        const source = sourceIn(dir, 'Plugin.java');
        if (source === null) return no('SKIPPED', 'examples/upp-java/Plugin.java is missing');
        const { exe, from } = javaExecutable();
        const found = probe([exe, '-version']);
        if (!found.ok) return no('SKIPPED', `java is absent: ${found.reason}`);
        if (!isJava21OrNewer(found.version)) {
          return no('SKIPPED', `the java found via ${from} is "${found.version}", and single-file launch needs 21+`);
        }
        return { ok: true, command: [exe, source, REFERENCE_MANIFEST], cwd: dir, version: `${found.version} (via ${from})` };
      });
    },
  },
  {
    name: 'rust',
    language: 'Rust (std only, compiled with rustc at test time)',
    kind: 'process',
    dir: example('upp-rust'),
    prepare() {
      const { dir } = this;
      return once(this.name, () => {
        const source = sourceIn(dir, 'plugin.rs');
        if (source === null) return no('SKIPPED', 'examples/upp-rust/plugin.rs is missing');
        const built = buildRust(source);
        if (!built.ok) return no('SKIPPED', built.reason);
        return { ok: true, command: [built.exe, REFERENCE_MANIFEST], cwd: dir, version: built.version };
      });
    },
  },
  {
    name: 'cpp',
    language: 'C++17 (source only)',
    kind: 'source-only',
    dir: example('upp-cpp'),
    prepare: () => no('UNEXECUTED',
      'this machine has no C++ compiler. The source is committed and has NEVER been compiled '
      + 'or run here; see examples/upp-cpp/README.md for the exact command somebody with a '
      + 'compiler should use, and treat every claim about it as unverified'),
  },
];

/** @param {string} name @returns {Implementation} */
export function implementationNamed(name) {
  const hit = IMPLEMENTATIONS.find((impl) => impl.name === name);
  if (hit === undefined) {
    throw new Error(`unknown implementation "${name}"; known: ${IMPLEMENTATIONS.map((i) => i.name).join(', ')}`);
  }
  return hit;
}
