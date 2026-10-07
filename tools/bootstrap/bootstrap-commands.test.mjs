// DISCOVERED COMMANDS — the argv arrays adoption believes this project checks itself with, and the
// line it refuses to cross. Two rules are tested harder than anything else here:
//   nothing is VERIFIED (analysis executes nothing, so every discovery is INFERRED), and
//   nothing that needs a shell ever becomes a command (it becomes text a human reads).
import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverCommands, labelOf, parseSimpleArgv } from './commands.mjs';
import { detectTarget } from './detect.mjs';
import { cleanup } from './fixtures/temp.mjs';
import { makeFixture } from './fixtures/projects.mjs';

/** The discovery for one fixture. @param {string} name @param {Record<string, string>} [extra]
 * @returns {import('./commands.mjs').Discovery} */
function discoverFixture(name, extra = {}) {
  const dir = makeFixture(name, extra);
  try {
    return discoverCommands(detectTarget(dir));
  } finally {
    cleanup(dir);
  }
}

/** @param {import('./commands.mjs').Discovery} discovery @returns {string[]} */
const argvs = (discovery) => discovery.commands.map((entry) => entry.argv.join(' '));

test('commands · a simple line becomes an argv array, and a shell line never does', () => {
  assert.deepEqual([...(parseSimpleArgv('npm test') ?? [])], ['npm', 'test']);
  assert.deepEqual([...(parseSimpleArgv('  go test ./...  ') ?? [])], ['go', 'test', './...']);
  assert.deepEqual([...(parseSimpleArgv('node --test "a b"') ?? [])], ['node', '--test', 'a b']);
  assert.deepEqual([...(parseSimpleArgv("mvn -q 'clean test'") ?? [])], ['mvn', '-q', 'clean test']);
  for (const line of [
    'npm test | tee log', 'npm test && npm run lint', 'echo $HOME', 'npm test > out.txt',
    'rm -rf *', '$(whoami)', 'a `b`', 'npm test; echo', 'cd x && y', 'ls ~/x',
  ]) assert.equal(parseSimpleArgv(line), null, line);
  assert.equal(parseSimpleArgv('npm "unbalanced'), null, 'an unbalanced quote is a refusal');
  assert.equal(parseSimpleArgv(''), null);
  assert.equal(parseSimpleArgv('   '), null);
  assert.equal(parseSimpleArgv(42), null);
  assert.equal(parseSimpleArgv(`npm ${'a'.repeat(400)}`), null, 'an absurd line is not parsed');
});

test('commands · node scripts become npm commands, each with the script that is its basis', () => {
  const discovery = discoverFixture('node');
  assert.deepEqual(argvs(discovery).slice(0, 4),
    ['npm test', 'npm run typecheck', 'npm run lint', 'npm run build']);
  const test1 = discovery.commands[0];
  assert.equal(test1?.label, 'test');
  assert.equal(test1?.status, 'INFERRED');
  assert.equal(test1?.basis, 'package.json scripts.test');
  for (const entry of discovery.commands) assert.equal(entry.status, 'INFERRED', entry.id);
});

test('commands · one rule per ecosystem: python, cargo, maven, go, make', () => {
  assert.ok(argvs(discoverFixture('python')).includes('python -m pytest'));
  const rust = argvs(discoverFixture('rust'));
  assert.deepEqual(rust, ['cargo test', 'cargo build']);
  assert.ok(argvs(discoverFixture('java')).includes('mvn -q test'));
  const go = argvs(discoverFixture('go'));
  assert.ok(go.includes('go test ./...'));
  assert.ok(go.includes('make test') && go.includes('make build'));
  const gradle = argvs(discoverFixture('java', {
    'build.gradle': 'plugins { id "java" }\n', gradlew: '#!/bin/sh\n',
  }));
  assert.ok(gradle.includes('./gradlew test'), 'a wrapper is the only gradle entry point worth proposing');
});

test('commands · a CI run line is a command only when it parses; otherwise it is UNKNOWN text', () => {
  const discovery = discoverFixture('github-actions');
  assert.deepEqual(argvs(discovery), ['npm test', 'npm run build']);
  for (const entry of discovery.commands) {
    assert.equal(entry.basis, '.github/workflows/ci.yml');
    assert.equal(entry.status, 'INFERRED');
  }
  assert.deepEqual(discovery.unknown.map((entry) => entry.text),
    ['npm run lint | tee lint.log', 'echo done > out.txt']);
  for (const entry of discovery.unknown) {
    assert.equal(entry.basis, '.github/workflows/ci.yml');
    assert.match(entry.reason, /needs a shell/);
  }
});

test('commands · a manifest basis beats a workflow basis, and no argv is listed twice', () => {
  const dir = makeFixture('node', { '.github/workflows/ci.yml': 'jobs:\n  check:\n    steps:\n      - run: npm test\n' });
  try {
    const discovery = discoverCommands(detectTarget(dir));
    const tests = discovery.commands.filter((entry) => entry.argv.join(' ') === 'npm test');
    assert.equal(tests.length, 1, 'the same command was discovered twice');
    assert.equal(tests[0]?.basis, 'package.json scripts.test', 'the manifest is the stronger basis');
  } finally {
    cleanup(dir);
  }
});

test('commands · a label is derived from the words, and `other` is the honest default', () => {
  assert.equal(labelOf(['npm', 'test']), 'test');
  assert.equal(labelOf(['cargo', 'clippy']), 'lint');
  assert.equal(labelOf(['npx', 'tsc', '--noEmit']), 'typecheck');
  assert.equal(labelOf(['make', 'build']), 'build');
  assert.equal(labelOf(['./deploy.sh']), 'other');
});

test('commands · a project with nothing recognisable discovers nothing, and says so by being empty', () => {
  const discovery = discoverFixture('docs');
  assert.deepEqual(argvs(discovery), []);
  assert.deepEqual([...discovery.unknown], []);
});
