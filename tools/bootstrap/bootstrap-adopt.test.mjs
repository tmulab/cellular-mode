// ADOPTION, THE WRITING HALF — what an install into a live codebase does, and the one property it
// must never violate: BEHAVIOUR PRESERVATION. Every pre-existing file is hashed individually before
// and after, and only an APPROVED managed block in AGENTS.md, CLAUDE.md or .gitignore may differ.
//
// The analysis half, and the proof that it writes nothing, is in `bootstrap-existing.test.mjs`.
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

test('existing · an install creates files, writes a valid baseline, and changes no existing file', () => {
  const dir = makeFixture('node', TREES['github-actions']);
  try {
    initGit(dir);
    const before = digests(dir);
    const result = run(['existing', dir, '--profile', 'minimal', '--confirm', '--approve', 'first-cell']);
    assert.equal(result.code, 0, result.all);
    assert.match(result.out, /Adopted Cellular Mode into/);
    assert.match(result.out, /No pre-existing file was replaced/);
    const after = digests(dir);
    for (const [rel, digest] of before) {
      assert.equal(after.get(rel), digest, `a pre-existing file changed: ${rel}`);
    }
    assert.ok(after.size > before.size, 'nothing was installed');
    const baseline = JSON.parse(readFileSync(join(dir, ...BASELINE_REL.split('/')), 'utf8'));
    assert.deepEqual(validateBaseline(baseline).errors.map((error) => error.path), []);
    assert.deepEqual(baseline.commands.map((/** @type {{ argv: string[] }} */ c) => c.argv.join(' ')),
      ['npm test', 'npm run typecheck', 'npm run lint', 'npm run build']);
    assert.ok(String(baseline.limitations[0]).includes('needs --approve baseline-checks'));
    const manifest = JSON.parse(readFileSync(join(dir, 'vault', 'install-manifest.json'), 'utf8'));
    assert.ok(manifest.files.some((/** @type {{ path: string }} */ f) => f.path === BASELINE_REL),
      'the baseline is controlled history, so the manifest records it');
    noAbsolutePath(result.all);
  } finally {
    cleanup(dir);
  }
});

test('existing · an existing AGENTS.md is appended to only with its approval, and never replaced', () => {
  const original = '# House rules\n\nBe brief.\n';
  const dir = makeFixture('node', { 'AGENTS.md': original, '.gitignore': 'node_modules/\n' });
  try {
    const refused = run(['existing', dir, '--profile', 'minimal', '--confirm']);
    assert.equal(refused.code, 0, refused.all);
    assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), original,
      'the block was written without its approval');
    assert.match(refused.out, /Not applied/);
    assert.match(refused.out, /agents-block/);
    assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'node_modules/\n');
  } finally {
    cleanup(dir);
  }
  const approved = makeFixture('node', { 'AGENTS.md': original });
  try {
    const result = run(['existing', approved, '--profile', 'minimal', '--confirm',
      '--approve', 'agents-block,first-cell']);
    assert.equal(result.code, 0, result.all);
    const text = readFileSync(join(approved, 'AGENTS.md'), 'utf8');
    assert.ok(text.startsWith(original), 'the original content is no longer the prefix of the file');
    assert.match(text, /cellular-mode:begin method-core/);
    assert.match(text, /cellular-mode:end method-core/);
  } finally {
    cleanup(approved);
  }
});

test('existing · --save-report on the install path writes scratch, and keeps it out of the manifest', () => {
  const dir = makeFixture('node');
  try {
    const result = run(['existing', dir, '--profile', 'minimal', '--confirm', '--save-report']);
    assert.equal(result.code, 0, result.all);
    assert.match(result.out, /git-ignored scratch, so it is NOT in the install manifest/);
    const saved = JSON.parse(readFileSync(join(dir, ...REPORT_REL.split('/')), 'utf8'));
    assert.equal(saved.schema, 'cellular-mode/adoption-report');
    const manifest = JSON.parse(readFileSync(join(dir, 'vault', 'install-manifest.json'), 'utf8'));
    assert.ok(!manifest.files.some((/** @type {{ path: string }} */ f) => f.path === REPORT_REL));
  } finally {
    cleanup(dir);
  }
});

test('existing · an install already there refuses, and a foreign hook manager is never touched', () => {
  const dir = makeFixture('husky', { 'package.json': '{"name":"h","version":"1.0.0"}\n' });
  try {
    // A git repository, because `article-8` — and therefore the hook decision — exists only there.
    if (!initGit(dir).ok) return;
    const hook = readFileSync(join(dir, '.husky', 'pre-commit'), 'utf8');
    const result = run(['existing', dir, '--profile', 'minimal', '--confirm', '--approve', 'first-cell']);
    assert.equal(result.code, 0, result.all);
    assert.equal(readFileSync(join(dir, '.husky', 'pre-commit'), 'utf8'), hook);
    assert.match(result.out, /husky hook machinery is already present/);
    const again = run(['existing', dir, '--profile', 'minimal', '--confirm']);
    assert.equal(again.code, 3, 'a second adoption must refuse, never silently reinstall');
    assert.match(again.err, /already there, so nothing was installed\. status: healthy/,
      'the refusal names the classification, so a human is never left to guess');
  } finally {
    cleanup(dir);
  }
});
