// fixtures/projects.mjs — TEST-ONLY. Small, real trees that stand in for the ecosystems adoption
// has to recognise. Under `fixtures/`, the suffix every component manifest excludes, so none of it
// is ever copied into anybody's project.
//
// EACH FIXTURE IS A FEW FILES, NOT A PROJECT. The detectors read manifests and filenames, so a
// `Cargo.toml` with two lines exercises exactly what a real one would. A fixture big enough to
// build would be a fixture nobody reads.
//
// THE SECRET FIXTURE BUILDS ITS SECRETS FROM FRAGMENTS, on purpose. A literal token in a source
// file is a finding in this repository's own secrets gate, and rightly so: "it is only a test"
// is how a real one eventually gets committed. The pieces are joined at run time, which exercises
// the detectors with a secret-SHAPED string without this file ever containing one.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { run } from '../exec.mjs';
import { makeTarget } from './temp.mjs';

/** @typedef {Readonly<Record<string, string>>} Tree */

/** Writes a tree of `/`-separated relative paths into `root`. @param {string} root @param {Tree} tree
 * @returns {string} */
export function materialize(root, tree) {
  for (const [rel, text] of Object.entries(tree)) {
    const absolute = join(root, ...rel.split('/'));
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  }
  return root;
}

/** A GitHub Actions workflow with one simple `run:` and one that needs a shell — the two cases
 * `commands.parseSimpleArgv` has to tell apart. */
const WORKFLOW = `name: ci
on: [push]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
      - run: npm run lint | tee lint.log
      - name: build
        run: |
          npm run build
          echo done > out.txt
`;

/** The fixture trees, by name. Data: adding an ecosystem is an entry here and a row in the
 * detection table of the report, never a branch in a detector.
 * @type {Readonly<Record<string, Tree>>} */
export const TREES = Object.freeze({
  node: {
    'package.json': `${JSON.stringify({
      name: 'demo', version: '1.0.0',
      scripts: { test: 'node --test', lint: 'eslint .', typecheck: 'tsc -p jsconfig.json', build: 'node build.mjs' },
      devDependencies: { eslint: '^9.0.0', typescript: '^5.0.0' },
    }, null, 2)}\n`,
    'package-lock.json': '{"lockfileVersion":3}\n',
    'src/index.mjs': 'export const hello = () => 1;\n',
    'test/index.test.mjs': 'import test from "node:test";\ntest("ok", () => {});\n',
    'README.md': '# demo\n',
  },
  python: {
    'pyproject.toml': '[project]\nname = "demo"\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n\n[tool.ruff]\nline-length = 100\n',
    'requirements.txt': 'pytest\nruff\nmypy\n',
    'src/demo.py': 'def hello():\n    return 1\n',
    'tests/test_demo.py': 'def test_hello():\n    assert True\n',
  },
  rust: {
    'Cargo.toml': '[package]\nname = "demo"\nversion = "0.1.0"\n\n[lints.clippy]\nall = "warn"\n',
    'Cargo.lock': '# generated\n',
    'src/main.rs': 'fn main() { println!("hi"); }\n',
  },
  java: {
    'pom.xml': '<project><artifactId>demo</artifactId></project>\n',
    'src/main/java/Demo.java': 'class Demo {}\n',
    'src/test/java/DemoTest.java': 'class DemoTest {}\n',
  },
  go: {
    'go.mod': 'module example.com/demo\n\ngo 1.22\n',
    'go.sum': '\n',
    'main.go': 'package main\n\nfunc main() {}\n',
    Makefile: 'test:\n\tgo test ./...\n\nbuild:\n\tgo build ./...\n',
  },
  'github-actions': { '.github/workflows/ci.yml': WORKFLOW },
  'custom-ci': {
    '.gitlab-ci.yml': 'stages: [test]\ntest:\n  script:\n    - make test\n',
    Jenkinsfile: 'pipeline { agent any }\n',
  },
  husky: { '.husky/pre-commit': '#!/bin/sh\nnpm test\n' },
  instructions: {
    'AGENTS.md': '# Agents\n\nFollow the house style.\n',
    'CLAUDE.md': '# Claude\n\nSee AGENTS.md.\n',
    '.cursor/rules/house.mdc': 'house rules\n',
    '.github/copilot-instructions.md': 'be terse\n',
  },
  security: {
    'SECURITY.md': '# Security\n\nReport privately.\n',
    '.github/dependabot.yml': 'version: 2\n',
    '.github/workflows/codeql.yml': 'name: codeql\non: [push]\n',
    '.gitleaks.toml': '[allowlist]\n',
    '.github/workflows/release.yml': 'name: release\non:\n  push:\n    tags: ["v*"]\n',
    'CHANGELOG.md': '# Changelog\n',
    '.goreleaser.yml': 'builds: []\n',
  },
  docs: {
    'README.md': '# demo\n',
    'docs/guide.md': '# Guide\n',
    'ARCHITECTURE.md': '# Architecture\n',
    'CONTRIBUTING.md': '# Contributing\n',
    '.gitattributes': '* text=auto\n',
  },
  'failing-baseline': {
    'package.json': `${JSON.stringify({ name: 'red', version: '1.0.0', scripts: { test: 'node fail.js' } }, null, 2)}\n`,
    'fail.js': 'process.exit(1);\n',
  },
});

/** The secret-shaped fixture, assembled at run time so that this FILE holds no secret.
 * @returns {Tree} */
export function secretTree() {
  const token = ['gh', 'p', '_', 'A'.repeat(20), '7x'].join('');
  const key = ['AKIA', 'B'.repeat(16)].join('');
  return Object.freeze({
    '.env': `API_KEY=${token}\nAWS_ACCESS_KEY_ID=${key}\n`,
    'config/secrets.json': `${JSON.stringify({ token, contact: ['dev', '@', 'example.com'].join('') })}\n`,
    'package.json': `${JSON.stringify({ name: 'leaky', version: '1.0.0', scripts: { test: 'node --test' } }, null, 2)}\n`,
  });
}

/** The hostile-name fixture: names that would forge a line of a report or escape the target if any
 * of them were ever trusted. Returned as a FUNCTION because some of these names cannot be created
 * on every filesystem, and the caller has to tolerate that.
 * @returns {ReadonlyArray<string>} */
export function hostileNames() {
  return Object.freeze([
    `ok.md${String.fromCharCode(10)}  all gates passed`,
    `tab${String.fromCharCode(9)}name.md`,
    '..weird.md',
    'dot..dot.md',
  ]);
}

/** A temp directory holding one named fixture tree, ready for a detector.
 * @param {string} name a key of `TREES` @param {Tree} [extra] merged over the tree
 * @returns {string} */
export function makeFixture(name, extra = {}) {
  const tree = TREES[name];
  if (tree === undefined) throw new Error(`no such fixture: ${name}`);
  return materialize(makeTarget(name), { ...tree, ...extra });
}

/** The identity a fixture commit is made with. Passed as `-c` flags on each invocation, NEVER
 * written to the machine's global git configuration, and assembled from fragments so that this file
 * contains no address. @returns {ReadonlyArray<string>} */
export function identityFlags() {
  return Object.freeze([
    '-c', 'user.name=Fixture',
    '-c', `user.email=${['fixture', '@', 'example', '.invalid'].join('')}`,
  ]);
}

/**
 * Turns a fixture directory into a real git repository with one commit — the only way to exercise
 * commit, tree and cleanliness honestly. Every git call goes through `exec.run` (argv, no shell),
 * because `node:child_process` is confined to that one module.
 * @param {string} dir @param {{ commit?: boolean }} [options]
 * @returns {{ ok: boolean, reason: string | null }}
 */
export function initGit(dir, options = {}) {
  const init = run(['git', 'init', '--quiet'], { cwd: dir });
  if (!init.ok) return { ok: false, reason: 'git init did not succeed here' };
  if (options.commit === false) return { ok: true, reason: null };
  run(['git', 'add', '-A'], { cwd: dir });
  const commit = run(['git', ...identityFlags(), 'commit', '--quiet', '-m', 'fixture'], { cwd: dir });
  return commit.ok ? { ok: true, reason: null } : { ok: false, reason: 'git commit did not succeed here' };
}

/** A temp directory holding several fixture trees merged — a polyglot repository, which is what
 * most real ones are. @param {ReadonlyArray<string>} names @returns {string} */
export function makeMerged(names) {
  /** @type {Record<string, string>} */
  const tree = {};
  for (const name of names) Object.assign(tree, TREES[name] ?? {});
  return materialize(makeTarget('merged'), tree);
}
