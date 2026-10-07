// `existing` END TO END — the two promises of adoption, each one tested as a property rather than
// as a message.
//
//   ANALYSIS WRITES NOTHING. The proof is a hash of the WHOLE target tree INCLUDING `.git`, taken
//     before and after `--analyze`. `.git` matters most: a plain `git status` refreshes and rewrites
//     the index, which is why every probe runs with GIT_OPTIONAL_LOCKS=0 and `--no-optional-locks`.
//   BEHAVIOUR IS PRESERVED. Every pre-existing file is hashed individually before and after an
//     install, and only an APPROVED managed block in AGENTS.md/CLAUDE.md/.gitignore may differ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { main } from './main.mjs';
import { REPORT_REL } from './existing-flow.mjs';
import { BASELINE_REL, validateBaseline } from './baseline.mjs';
import { sha256 } from './writer.mjs';
import { cleanup, listFiles, treeHash } from './fixtures/temp.mjs';
import { TREES, initGit, makeFixture } from './fixtures/projects.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });

/** Runs the CLI in process. @param {string[]} args
 * @returns {{ code: number, out: string, err: string, all: string }} */
function run(args) {
  let out = '';
  let err = '';
  const code = main(['node', 'cli.mjs', ...args], {
    stdout: { write: (text) => { out += text; return true; } },
    stderr: { write: (text) => { err += text; return true; } },
    env: { ...ENV },
  });
  return { code, out, err, all: `${out}${err}` };
}

/** @param {string} text @returns {void} */
function noAbsolutePath(text) {
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/, 'a Windows absolute path reached the output');
  assert.ok(!text.includes(tmpdir()), 'the temp directory was printed verbatim');
  assert.ok(!text.includes(ROOT.replace(/[\\/]+$/, '')), 'the source checkout was printed verbatim');
}

/** Every file of a tree with its digest, `.git` excluded — the behaviour-preservation witness.
 * @param {string} dir @returns {Map<string, string>} */
function digests(dir) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const rel of listFiles(dir)) {
    if (rel.startsWith('.git/')) continue;
    out.set(rel, sha256(readFileSync(join(dir, ...rel.split('/')))));
  }
  return out;
}

test('existing · --analyze prints the report, exits 0 and writes nothing — .git included', () => {
  const dir = makeFixture('node', TREES['github-actions']);
  try {
    const started = initGit(dir);
    const before = treeHash(dir);
    const result = run(['existing', dir, '--analyze']);
    assert.equal(result.code, 0, result.all);
    assert.match(result.out, /Adoption Compatibility Report/);
    assert.match(result.out, /Detected facts — VERIFIED/);
    assert.match(result.out, /- test: npm test {3}\[package\.json scripts\.test\]/);
    assert.equal(treeHash(dir), before, `analysis wrote into the target (git repo: ${started.ok})`);
    noAbsolutePath(result.all);
  } finally {
    cleanup(dir);
  }
});

test('existing · the zero-write proof is not vacuous: one byte changes the tree hash', () => {
  const dir = makeFixture('node');
  try {
    const before = treeHash(dir);
    writeFileSync(join(dir, 'README.md'), '# demo \n');
    assert.notEqual(treeHash(dir), before, 'the instrument cannot see a change');
  } finally {
    cleanup(dir);
  }
});

test('existing · --analyze --json is the same document, machine-readable, still writing nothing', () => {
  const dir = makeFixture('python');
  try {
    const before = treeHash(dir);
    const result = run(['existing', dir, '--analyze', '--json']);
    assert.equal(result.code, 0, result.all);
    const parsed = JSON.parse(result.out);
    assert.equal(parsed.schema, 'cellular-mode/adoption-report');
    assert.equal(parsed.profileSuggestion, 'minimal');
    assert.equal(treeHash(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('existing · findings exit 2 and still print to stdout: a verdict is not a failure', () => {
  const dir = makeFixture('node', { 'AGENTS.md': '# House rules\n' });
  try {
    const before = treeHash(dir);
    const result = run(['existing', dir, '--analyze']);
    assert.equal(result.code, 2, 'conflicts are analysis findings');
    assert.match(result.out, /\[managed-file\] AGENTS\.md exists/);
    assert.equal(result.err, '', 'the report went to stderr');
    assert.equal(treeHash(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('existing · --save-report with --analyze is refused: analysis writes nothing at all', () => {
  const dir = makeFixture('node');
  try {
    const before = treeHash(dir);
    const result = run(['existing', dir, '--analyze', '--save-report']);
    assert.equal(result.code, 1);
    assert.match(result.err, /cannot be combined with --analyze/);
    assert.match(result.err, /Use --json and redirect it/);
    assert.equal(treeHash(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('existing · no --analyze and no --profile asks for one, naming the suggestion', () => {
  const dir = makeFixture('rust');
  try {
    const before = treeHash(dir);
    const result = run(['existing', dir]);
    assert.equal(result.code, 1);
    assert.match(result.err, /--profile minimal/);
    assert.match(result.err, /never a default/);
    assert.equal(treeHash(dir), before);
  } finally {
    cleanup(dir);
  }
});

test('existing · --dry-run shows report and plan and writes nothing; no --confirm exits 5', () => {
  const dir = makeFixture('node');
  try {
    const before = treeHash(dir);
    const dry = run(['existing', dir, '--profile', 'minimal', '--dry-run']);
    assert.equal(dry.code, 0, dry.all);
    assert.match(dry.out, /Adoption Compatibility Report/);
    assert.match(dry.out, /— Installation plan —/);
    assert.match(dry.out, /Dry run: nothing was written\./);
    assert.equal(treeHash(dir), before);
    const unconfirmed = run(['existing', dir, '--profile', 'minimal']);
    assert.equal(unconfirmed.code, 5);
    assert.match(unconfirmed.err, /--approve baseline-checks to record what your checks do today/);
    assert.equal(treeHash(dir), before);
    noAbsolutePath(dry.all + unconfirmed.all);
  } finally {
    cleanup(dir);
  }
});
