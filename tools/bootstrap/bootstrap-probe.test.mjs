// THE READERS BENEATH DETECTION — the probe, the manifest parsers and the workflow reader, tested as
// units. They are separated from the ecosystem coverage tests because the question is different:
// not "is Rust recognised" but "is every one of these functions TOTAL" — absent, malformed,
// oversized and non-string input must each produce an answer rather than an exception, because the
// input is somebody else's repository and UNKNOWN is the only honest default.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTarget, idsOf, makeProbe } from './detect.mjs';
import { makeTargets, mentions, packageFacts, readManifest, summaryOf } from './detect-manifests.mjs';
import { runLinesOf } from './detect-project.mjs';
import { cleanup } from './fixtures/temp.mjs';
import { TREES, makeFixture, makeMerged } from './fixtures/projects.mjs';

/** Runs `body` against a fresh fixture and always cleans up. @param {string} name
 * @param {(dir: string) => void} body @returns {void} */
function withFixture(name, body) {
  const dir = makeFixture(name);
  try {
    body(dir);
  } finally {
    cleanup(dir);
  }
}

test('detect · the manifest readers are total, bounded and summary-only', () => {
  assert.equal(packageFacts(null), null);
  assert.equal(packageFacts('{not json'), null);
  assert.equal(packageFacts('[]'), null);
  const facts = packageFacts('{"scripts":{"test":"node --test","bad":3},"devDependencies":{"jest":"1"}}');
  assert.deepEqual(facts?.scripts, { test: 'node --test' });
  assert.deepEqual([...(facts?.dependencies ?? [])], ['jest']);
  assert.equal(mentions('line-length = 100\nruff', 'ruff'), true);
  assert.equal(mentions('truffle', 'ruff'), false, 'a substring is not a mention');
  assert.deepEqual([...makeTargets('.PHONY: test\ntest:\n\techo\nVAR := 1\nbuild:\n')], ['test', 'build']);
  assert.equal(summaryOf(null), '(not read)');
  assert.ok(summaryOf('a'.repeat(400)).length <= 100);
  withFixture('node', (dir) => {
    const probe = makeProbe(dir, ['package.json', 'src/index.mjs']);
    assert.equal(probe.has('package.json'), true);
    assert.equal(probe.firstMatch(/\.mjs$/), 'src/index.mjs');
    assert.equal(probe.readText('missing.md'), null);
    assert.deepEqual([...probe.matches(/^src\//)], ['src/index.mjs']);
  });
});

test('detect · a workflow with no run lines, and a merged polyglot repository', () => {
  assert.deepEqual([...runLinesOf(null)], []);
  assert.deepEqual([...runLinesOf('jobs:\n  check:\n    steps:\n      - uses: x\n')], []);
  const dir = makeMerged(['node', 'python', 'rust', 'github-actions']);
  try {
    const detection = detectTarget(dir);
    assert.deepEqual(idsOf(detection.buildSystems), ['cargo', 'npm', 'python']);
    assert.ok(detection.languages.includes('rust') && detection.languages.includes('python'));
    assert.ok(Object.keys(TREES).length >= 12, 'the fixture catalogue covers the declared ecosystems');
  } finally {
    cleanup(dir);
  }
});
