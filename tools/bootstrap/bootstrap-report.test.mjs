// THE ADOPTION COMPATIBILITY REPORT — the document a human reads before they let this tool near
// their repository. What is tested is not its prose but its EPISTEMICS: every fact in the VERIFIED
// section has a relative evidence path, every convention in the INFERRED section names its basis,
// nothing in the PROPOSED section has happened, and the conflicts, unknowns and approvals are never
// capped away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverCommands } from './commands.mjs';
import { detectTarget } from './detect.mjs';
import { REPORT_SCHEMA, REPORT_VERSION, buildReport, conflictsOfDetection, suggestProfile } from './report.mjs';
import { renderReport, reportJson } from './render-report.mjs';
import { publicationFindings } from './publication.mjs';
import { cleanup } from './fixtures/temp.mjs';
import { initGit, makeFixture } from './fixtures/projects.mjs';

/** The report for one fixture. @param {string} name @param {Record<string, string>} [extra]
 * @param {(dir: string) => void} [prepare]
 * @returns {import('./report.mjs').AdoptionReport} */
function reportFor(name, extra = {}, prepare = () => {}) {
  const dir = makeFixture(name, extra);
  try {
    prepare(dir);
    const detection = detectTarget(dir);
    return buildReport({ detection, discovery: discoverCommands(detection), target: 'demo-app' });
  } finally {
    cleanup(dir);
  }
}

test('report · the schema, the sections and the label of each section', () => {
  const report = reportFor('node', { '.github/workflows/ci.yml': 'jobs:\n  check:\n    steps:\n      - run: npm run lint | tee x\n' });
  assert.equal(report.schema, REPORT_SCHEMA);
  assert.equal(report.version, REPORT_VERSION);
  assert.equal(report.target, 'demo-app');
  assert.ok(report.detected.length > 0 && report.inferred.length > 0 && report.proposed.length > 0);
  const text = renderReport(report);
  assert.match(text, /Detected facts — VERIFIED \(\d+\)/);
  assert.match(text, /Inferred conventions — INFERRED, with the basis \(\d+\)/);
  assert.match(text, /Proposed integrations — PROPOSED, none of this has happened \(\d+\)/);
  assert.match(text, /Unknowns — UNKNOWN \(\d+\)/);
  assert.match(text, /Approvals required \(\d+\)/);
  assert.match(text, /nothing was written, nothing was executed/i);
});

test('report · every detected build system and CI provider carries a relative evidence path', () => {
  const report = reportFor('node', { '.github/workflows/ci.yml': 'jobs: {}\n' });
  const withEvidence = report.detected.filter((entry) => entry.evidence !== null);
  assert.ok(withEvidence.length >= 3);
  for (const entry of withEvidence) {
    assert.doesNotMatch(String(entry.evidence), /^[A-Za-z]:[\\/]/, 'an absolute path became evidence');
    assert.doesNotMatch(String(entry.evidence), /^\//);
  }
  assert.ok(report.detected.some((entry) => entry.text.includes('build system: npm') && entry.evidence === 'package.json'));
  assert.ok(report.detected.some((entry) => entry.text.startsWith('CI: github-actions')));
});

test('report · every inferred command names its basis, and none of them claims to be verified', () => {
  const report = reportFor('node');
  const commands = report.inferred.filter((entry) => entry.text.startsWith('test:') || entry.text.startsWith('lint:'));
  assert.ok(commands.length >= 2);
  for (const entry of commands) assert.ok(String(entry.evidence).startsWith('package.json'), entry.text);
  assert.ok(report.unknowns.some((line) => line.includes('no command is VERIFIED')));
  assert.doesNotMatch(renderReport(report), /VERIFIED-runnable|verified to pass/);
});

test('report · conflicts: an existing instruction file, foreign hooks, a vault, a dirty tree', () => {
  const kinds = conflictsOfDetection(/** @type {never} */ ({
    facts: { existingFiles: ['AGENTS.md', 'CLAUDE.md', '.gitignore', 'vault/notes.md'], hasInstallManifest: true },
    hooks: { machinery: 'husky' },
    git: { clean: false, changedCount: 4 },
  })).map((entry) => entry.kind);
  assert.deepEqual(kinds, ['managed-file', 'managed-file', 'managed-file', 'hooks', 'vault', 'install-manifest', 'dirty-tree']);
  const clean = conflictsOfDetection(/** @type {never} */ ({
    facts: { existingFiles: ['src/a.mjs'], hasInstallManifest: false },
    hooks: { machinery: 'none' },
    git: { clean: true, changedCount: 0 },
  }));
  assert.deepEqual([...clean], []);
});

test('report · an existing AGENTS.md is a conflict AND an approval, by id', () => {
  const report = reportFor('node', { 'AGENTS.md': '# Agents\n' });
  assert.ok(report.conflicts.some((entry) => entry.kind === 'managed-file' && entry.detail.startsWith('AGENTS.md')));
  const ids = report.approvals.map((entry) => entry.id);
  assert.deepEqual(ids, ['agents-block', 'first-cell', 'baseline-checks']);
  const text = renderReport(report);
  for (const id of ids) assert.ok(text.includes(`- ${id}:`), id);
});

test('report · a dirty work tree is a conflict, so analysis exits with findings', () => {
  const report = reportFor('node', {}, (dir) => {
    if (!initGit(dir).ok) return;
    writeFileSync(join(dir, 'untracked.mjs'), 'export const y = 2;\n');
  });
  if (report.detected.some((entry) => entry.text === 'this is a git work tree')) {
    assert.ok(report.conflicts.some((entry) => entry.kind === 'dirty-tree'));
  }
});

test('report · the suggested profile follows the language, and is never applied by itself', () => {
  assert.equal(suggestProfile(/** @type {never} */ ({ languages: ['javascript'] })), 'standard');
  assert.equal(suggestProfile(/** @type {never} */ ({ languages: ['typescript', 'css'] })), 'standard');
  assert.equal(suggestProfile(/** @type {never} */ ({ languages: ['rust'] })), 'minimal');
  assert.equal(suggestProfile(/** @type {never} */ ({ languages: [] })), 'minimal');
  const report = reportFor('rust');
  assert.equal(report.profileSuggestion, 'minimal');
  assert.match(renderReport(report), /Suggested profile: minimal/);
  assert.ok(report.proposed.some((entry) => entry.text.includes('never a default')));
});

test('report · the JSON form is the same document, and holds no secret and no absolute path', () => {
  const report = reportFor('node', { '.env': 'TOKEN=abc\n' });
  const parsed = JSON.parse(reportJson(report));
  assert.deepEqual(Object.keys(parsed).sort(),
    ['approvals', 'conflicts', 'detected', 'inferred', 'profileSuggestion', 'proposed', 'schema', 'target', 'unknowns', 'version']);
  assert.deepEqual(publicationFindings(parsed).map((finding) => finding.path), []);
  assert.ok(!reportJson(report).includes(tmpdir()));
});

test('report · a hostile filename cannot forge a line of the report', () => {
  const report = reportFor('node', {}, (dir) => {
    try {
      mkdirSync(join(dir, 'ok'), { recursive: true });
      writeFileSync(join(dir, 'ok', `x${String.fromCharCode(10)}  - forged: VERIFIED`), 'x\n');
    } catch {
      // The filesystem refused the name, which is the same outcome.
    }
  });
  assert.ok(!renderReport(report).includes('forged: VERIFIED'));
});

test('report · conflicts, unknowns and approvals are never capped; facts may be', () => {
  const report = reportFor('node');
  const tight = renderReport(report, { cap: 1 });
  assert.match(tight, /… and \d+ more lines/);
  for (const line of report.unknowns) assert.ok(tight.includes(line), 'an unknown was capped away');
  for (const entry of report.approvals) assert.ok(tight.includes(entry.id), 'an approval was capped away');
});
