// detect-tooling.mjs — what this project is BUILT and CHECKED with, as tables rather than prose.
//
// Every entry is one established fact with one piece of evidence, and every fact carries the label
// it earned. The distinction is the whole discipline of this file:
//   VERIFIED — a file with this name exists in the target. We looked; it is there.
//   INFERRED — a tool NAME appears inside a manifest we read. That a project lists `jest` is
//     excellent evidence that it uses jest, and it is still not proof: the dependency may be
//     vestigial, the script may be broken. Only EXECUTION could promote it, and analysis never
//     executes anything.
// Nothing here is ever VERIFIED on the strength of a manifest's contents, and nothing anywhere in
// adoption is VERIFIED-runnable without an approved run.
import { mentions, scriptMentions } from './detect-manifests.mjs';

/** @typedef {'VERIFIED'|'INFERRED'} Label */
/** @typedef {{ id: string, evidence: string, label: Label }} Detected */
/** The read-only view of a target that every detector takes. It is an OBJECT, not a directory:
 * a detector cannot open a file nobody put on this interface, and a test can drive the whole
 * detection from an in-memory tree.
 * @typedef {{ has: (rel: string) => boolean, firstMatch: (re: RegExp) => string | null,
 *   matches: (re: RegExp) => ReadonlyArray<string>,
 *   pkg: import('./detect-manifests.mjs').PackageFacts | null,
 *   text: (rel: string) => string | null, readText: (rel: string) => string | null,
 *   mentionsIn: (rels: ReadonlyArray<string>, token: string) => string | null }} Probe */

/** @param {string} id @param {string} evidence @param {Label} label @returns {Detected} */
const found = (id, evidence, label) => Object.freeze({ id, evidence, label });

/** The marker file of each build system. Presence is VERIFIED; what it implies is not. */
export const BUILD_MARKERS = Object.freeze([
  Object.freeze({ file: 'package.json', id: 'npm' }),
  Object.freeze({ file: 'pyproject.toml', id: 'python' }),
  Object.freeze({ file: 'setup.cfg', id: 'python' }),
  Object.freeze({ file: 'requirements.txt', id: 'python' }),
  Object.freeze({ file: 'Cargo.toml', id: 'cargo' }),
  Object.freeze({ file: 'go.mod', id: 'go' }),
  Object.freeze({ file: 'pom.xml', id: 'maven' }),
  Object.freeze({ file: 'build.gradle', id: 'gradle' }),
  Object.freeze({ file: 'build.gradle.kts', id: 'gradle' }),
  Object.freeze({ file: 'Makefile', id: 'make' }),
  Object.freeze({ file: 'CMakeLists.txt', id: 'cmake' }),
  Object.freeze({ file: 'composer.json', id: 'composer' }),
]);

/** The lockfile of each package manager. A project with two lockfiles has two, and the report
 * says so rather than picking a winner. */
export const LOCKFILES = Object.freeze([
  Object.freeze({ file: 'package-lock.json', id: 'npm' }),
  Object.freeze({ file: 'npm-shrinkwrap.json', id: 'npm' }),
  Object.freeze({ file: 'pnpm-lock.yaml', id: 'pnpm' }),
  Object.freeze({ file: 'yarn.lock', id: 'yarn' }),
  Object.freeze({ file: 'bun.lockb', id: 'bun' }),
  Object.freeze({ file: 'poetry.lock', id: 'poetry' }),
  Object.freeze({ file: 'Cargo.lock', id: 'cargo' }),
  Object.freeze({ file: 'go.sum', id: 'go' }),
]);

/** The manifests whose text may mention a Python tool. */
const PYTHON_FILES = Object.freeze(['pyproject.toml', 'setup.cfg', 'requirements.txt']);

/** PURE. The build systems whose marker file is present. @param {Probe} probe
 * @returns {ReadonlyArray<Detected>} */
export function detectBuildSystems(probe) {
  /** @type {Detected[]} */
  const out = [];
  for (const marker of BUILD_MARKERS) {
    if (probe.has(marker.file) && !out.some((entry) => entry.id === marker.id)) {
      out.push(found(marker.id, marker.file, 'VERIFIED'));
    }
  }
  const csproj = probe.firstMatch(/\.csproj$/);
  if (csproj !== null) out.push(found('dotnet', csproj, 'VERIFIED'));
  return Object.freeze(out);
}

/** PURE. The package managers whose lockfile is present. @param {Probe} probe
 * @returns {ReadonlyArray<Detected>} */
export function detectPackageManagers(probe) {
  /** @type {Detected[]} */
  const out = [];
  for (const lock of LOCKFILES) {
    if (probe.has(lock.file) && !out.some((entry) => entry.id === lock.id)) {
      out.push(found(lock.id, lock.file, 'VERIFIED'));
    }
  }
  return Object.freeze(out);
}

/** PURE. The JavaScript test runners named in `package.json`. A dependency and a script mention
 * are both INFERRED and both recorded, because either one alone is enough to guess wrong.
 * @param {Probe} probe @returns {Detected[]} */
function jsTestFrameworks(probe) {
  /** @type {Detected[]} */
  const out = [];
  const pkg = probe.pkg;
  if (pkg === null) return out;
  for (const name of ['jest', 'vitest', 'mocha', 'ava', 'tap', 'jasmine']) {
    if (pkg.dependencies.includes(name) || scriptMentions(pkg, name)) {
      out.push(found(name, 'package.json', 'INFERRED'));
    }
  }
  if (scriptMentions(pkg, '--test') || scriptMentions(pkg, 'node:test')) {
    out.push(found('node-test', 'package.json scripts', 'INFERRED'));
  }
  return out;
}

/** PURE. Every test framework this target appears to use. @param {Probe} probe
 * @returns {ReadonlyArray<Detected>} */
export function detectTestFrameworks(probe) {
  const out = jsTestFrameworks(probe);
  const pytest = probe.mentionsIn(PYTHON_FILES, 'pytest');
  if (pytest !== null) out.push(found('pytest', pytest, 'INFERRED'));
  else if (probe.firstMatch(/^tests?\/.*\.py$/) !== null && probe.has('pyproject.toml')) {
    out.push(found('unittest', 'pyproject.toml', 'INFERRED'));
  }
  if (probe.has('Cargo.toml')) out.push(found('cargo-test', 'Cargo.toml', 'INFERRED'));
  if (probe.has('go.mod')) out.push(found('go-test', 'go.mod', 'INFERRED'));
  const junit = probe.has('pom.xml') ? 'pom.xml'
    : probe.has('build.gradle') ? 'build.gradle'
      : probe.has('build.gradle.kts') ? 'build.gradle.kts' : null;
  if (junit !== null) out.push(found('junit', junit, 'INFERRED'));
  return Object.freeze(out);
}

/** The lint and type tools whose presence is established by a FILE. */
const QUALITY_FILES = Object.freeze([
  Object.freeze({ file: 'tsconfig.json', id: 'tsc' }),
  Object.freeze({ file: 'jsconfig.json', id: 'tsc-checkjs' }),
  Object.freeze({ file: '.eslintrc', id: 'eslint' }),
  Object.freeze({ file: '.eslintrc.json', id: 'eslint' }),
  Object.freeze({ file: '.eslintrc.cjs', id: 'eslint' }),
  Object.freeze({ file: 'eslint.config.js', id: 'eslint' }),
  Object.freeze({ file: 'eslint.config.mjs', id: 'eslint' }),
  Object.freeze({ file: '.ruff.toml', id: 'ruff' }),
  Object.freeze({ file: '.flake8', id: 'flake8' }),
  Object.freeze({ file: 'mypy.ini', id: 'mypy' }),
  Object.freeze({ file: 'clippy.toml', id: 'clippy' }),
  Object.freeze({ file: '.golangci.yml', id: 'golangci-lint' }),
]);

/** PURE. The lint and typecheck tools this target appears to use. @param {Probe} probe
 * @returns {ReadonlyArray<Detected>} */
export function detectQualityTools(probe) {
  /** @type {Detected[]} */
  const out = [];
  for (const entry of QUALITY_FILES) {
    if (probe.has(entry.file) && !out.some((seen) => seen.id === entry.id)) {
      out.push(found(entry.id, entry.file, 'VERIFIED'));
    }
  }
  const pkg = probe.pkg;
  if (pkg !== null) {
    for (const name of ['eslint', 'typescript', 'prettier', 'biome', 'oxlint']) {
      if ((pkg.dependencies.includes(name) || scriptMentions(pkg, name))
        && !out.some((seen) => seen.id === name)) out.push(found(name, 'package.json', 'INFERRED'));
    }
  }
  for (const name of ['ruff', 'flake8', 'mypy', 'pylint', 'black']) {
    const where = probe.mentionsIn(PYTHON_FILES, name);
    if (where !== null && !out.some((seen) => seen.id === name)) out.push(found(name, where, 'INFERRED'));
  }
  if (probe.has('Cargo.toml') && mentions(probe.text('Cargo.toml'), 'clippy')
    && !out.some((seen) => seen.id === 'clippy')) out.push(found('clippy', 'Cargo.toml', 'INFERRED'));
  return Object.freeze(out);
}
