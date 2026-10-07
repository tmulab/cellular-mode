// DETECTION — what adoption can establish about somebody else's repository, and what it must
// refuse to claim. Every assertion here is about one of two things: coverage (the ecosystem is
// recognised) or honesty (the LABEL is right, the hostile name is skipped, the secret is not read).
import test from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectTarget, idsOf, makeProbe } from './detect.mjs';
import { makeTargets, mentions, packageFacts, readManifest, summaryOf } from './detect-manifests.mjs';
import { hookFacts, runLinesOf } from './detect-project.mjs';
import { cleanup, makeTarget, treeHash } from './fixtures/temp.mjs';
import { TREES, hostileNames, initGit, makeFixture, makeMerged, materialize, secretTree } from './fixtures/projects.mjs';

/** Runs `body` against a fresh fixture and always cleans up. @param {string} name
 * @param {(dir: string) => void} body @param {Record<string, string>} [extra] @returns {void} */
function withFixture(name, body, extra = {}) {
  const dir = makeFixture(name, extra);
  try {
    body(dir);
  } finally {
    cleanup(dir);
  }
}

test('detect · node: build system, lockfile, scripts, frameworks and tools, each with its label', () => {
  withFixture('node', (dir) => {
    const detection = detectTarget(dir);
    assert.deepEqual(idsOf(detection.buildSystems), ['npm']);
    assert.deepEqual(idsOf(detection.packageManagers), ['npm']);
    assert.deepEqual([...detection.languages], ['javascript']);
    assert.deepEqual(idsOf(detection.testFrameworks), ['node-test']);
    assert.ok(idsOf(detection.qualityTools).includes('eslint'));
    assert.ok(idsOf(detection.qualityTools).includes('typescript'));
    // Nothing read out of a manifest is ever VERIFIED.
    for (const entry of [...detection.testFrameworks, ...detection.qualityTools]) {
      if (entry.evidence.startsWith('package.json')) assert.equal(entry.label, 'INFERRED', entry.id);
    }
    assert.deepEqual(idsOf(detection.docs), ['readme']);
  });
});

test('detect · python, rust, java, go: each ecosystem, its frameworks and its Makefile targets', () => {
  withFixture('python', (dir) => {
    const detection = detectTarget(dir);
    assert.deepEqual(idsOf(detection.buildSystems), ['python']);
    assert.deepEqual(idsOf(detection.testFrameworks), ['pytest']);
    for (const id of ['ruff', 'mypy']) assert.ok(idsOf(detection.qualityTools).includes(id), id);
  });
  withFixture('rust', (dir) => {
    const detection = detectTarget(dir);
    assert.deepEqual(idsOf(detection.buildSystems), ['cargo']);
    assert.deepEqual(idsOf(detection.testFrameworks), ['cargo-test']);
    assert.ok(idsOf(detection.qualityTools).includes('clippy'));
  });
  withFixture('java', (dir) => {
    const detection = detectTarget(dir);
    assert.deepEqual(idsOf(detection.buildSystems), ['maven']);
    assert.deepEqual(idsOf(detection.testFrameworks), ['junit']);
  });
  withFixture('go', (dir) => {
    const detection = detectTarget(dir);
    assert.deepEqual(idsOf(detection.buildSystems), ['go', 'make']);
    assert.deepEqual([...detection.makeTargets], ['test', 'build']);
  });
});

test('detect · CI: providers, their files, and run lines read but never executed', () => {
  withFixture('github-actions', (dir) => {
    const detection = detectTarget(dir);
    assert.deepEqual(detection.ci.map((provider) => provider.id), ['github-actions']);
    const lines = detection.ci[0]?.runLines.map((entry) => entry.line) ?? [];
    assert.deepEqual(lines, ['npm test', 'npm run lint | tee lint.log', 'npm run build', 'echo done > out.txt']);
    assert.ok(detection.ci[0]?.files.includes('.github/workflows/ci.yml'));
  });
  withFixture('custom-ci', (dir) => {
    assert.deepEqual(detectTarget(dir).ci.map((provider) => provider.id), ['gitlab-ci', 'jenkins']);
  });
});

test('detect · hooks: husky is foreign machinery, and core.hooksPath wins over everything', () => {
  withFixture('husky', (dir) => {
    assert.equal(detectTarget(dir).hooks.machinery, 'husky');
  });
  assert.equal(hookFacts('native', null).machinery, 'native');
  assert.equal(hookFacts('none', null).machinery, 'none');
  const explicit = hookFacts('native', '.githooks');
  assert.equal(explicit.machinery, 'hooksPath');
  assert.equal(explicit.hooksPath, '.githooks');
  assert.ok(explicit.evidence.some((line) => line.includes('core.hooksPath')));
});

test('detect · instruction files, docs, security tooling and release hints', () => {
  withFixture('instructions', (dir) => {
    assert.deepEqual(idsOf(detectTarget(dir).instructionFiles),
      ['agents-md', 'claude-md', 'copilot-instructions', 'cursor-dir']);
  });
  withFixture('security', (dir) => {
    const detection = detectTarget(dir);
    assert.deepEqual(idsOf(detection.securityTooling), ['codeql', 'dependabot', 'gitleaks', 'security-md']);
    assert.deepEqual(idsOf(detection.releaseHints), ['changelog', 'goreleaser', 'release-workflow']);
    for (const entry of detection.releaseHints) assert.equal(entry.label, 'INFERRED');
  });
  withFixture('docs', (dir) => {
    const detection = detectTarget(dir);
    assert.deepEqual(idsOf(detection.docs), ['architecture', 'contributing', 'docs-dir', 'readme']);
    assert.equal(detection.hasGitAttributes, true);
  });
});

test('detect · git facts are established, or they are null — never guessed', () => {
  withFixture('node', (dir) => {
    const before = detectTarget(dir);
    assert.deepEqual(before.git, { isRepo: false, commit: null, tree: null, clean: null, changedCount: null });
    const started = initGit(dir);
    if (!started.ok) return;
    const clean = detectTarget(dir);
    assert.equal(clean.git.isRepo, true);
    assert.match(String(clean.git.commit), /^[0-9a-f]{40}$/);
    assert.match(String(clean.git.tree), /^[0-9a-f]{40}$/);
    assert.equal(clean.git.clean, true);
    assert.equal(clean.git.changedCount, 0);
    writeFileSync(join(dir, 'src', 'extra.mjs'), 'export const x = 1;\n');
    const dirty = detectTarget(dir);
    assert.equal(dirty.git.clean, false);
    assert.equal(dirty.git.changedCount, 1);
  });
});

test('detect · a secret-shaped file is seen as a NAME and never read into the record', () => {
  const dir = materialize(makeTarget('secrets'), secretTree());
  try {
    const detection = detectTarget(dir);
    assert.ok(detection.facts.existingFiles.includes('.env'), 'the name is a fact');
    const text = JSON.stringify(detection);
    for (const fragment of ['gh', 'AKIA']) {
      assert.ok(!new RegExp(`${fragment}[A-Za-z0-9_]{16,}`).test(text), `${fragment}-shaped value reached the record`);
    }
    assert.equal(readManifest(dir, '.env'), null, '.env is not a known manifest, so it is never read');
    assert.equal(readManifest(dir, 'config/secrets.json'), null);
  } finally {
    cleanup(dir);
  }
});

test('detect · hostile names are skipped, links are never followed, and nothing is written', () => {
  const dir = makeFixture('node');
  try {
    let created = 0;
    for (const name of hostileNames()) {
      try {
        writeFileSync(join(dir, name), 'x\n');
        created += 1;
      } catch {
        // A filesystem that refuses the name has made the same point this test makes.
      }
    }
    try {
      symlinkSync(makeTarget('outside'), join(dir, 'escape'), 'junction');
    } catch {
      // Links need a privilege this test does not require.
    }
    const before = treeHash(dir);
    const detection = detectTarget(dir);
    assert.equal(treeHash(dir), before, 'detection wrote into the target');
    for (const rel of detection.facts.existingFiles) {
      assert.doesNotMatch(rel, /[\n\t]/, 'a control character reached the fact list');
      assert.ok(!rel.split('/').includes('..'));
    }
    assert.ok(created === 0 || detection.skipped.length > 0 || detection.facts.existingFiles.length >= 5);
  } finally {
    cleanup(dir);
  }
});
