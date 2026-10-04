// The CI workflow, checked LOCALLY — because it cannot be checked remotely without a push,
// and "it will probably work on GitHub" is not a verdict. Everything here is a property of
// the file that can be read on this machine: the trigger, the permission grant, the pinning
// of every action, and the fact that each mandatory command names a script or a file that
// actually exists.
//
// The reader it uses is ./workflow-reader.mjs; the properties the FIRST REMOTE RUN taught this
// project (the matrix, the pinned image, the build/tests split, the required toolchains) are
// asserted in ./ci-workflow-matrix.test.mjs, and the pipefail guard in
// ./ci-workflow-pipefail.test.mjs. Three files, one per review, at the 200-line rule.
//
// NOT PROVED HERE: that the workflow passes on GitHub. Its first run FAILED and was corrected;
// the corrected file has not run remotely yet (tools/gates/CI.md). This file proves its shape
// and its safety properties, nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../tools/gates/scan.mjs';
import { WORKFLOW, block, lines, pkg, text, valuesOf } from './workflow-reader.mjs';

test('workflow · the file exists, is plain YAML and stays lean', () => {
  assert.ok(existsSync(join(ROOT, WORKFLOW)), `${WORKFLOW} must exist`);
  assert.ok(lines.length <= 120, `the workflow is ${lines.length} lines; keep it readable`);
  assert.equal(text.includes('\t'), false, 'tabs are not valid YAML indentation');
  assert.equal(/(?:^|[\s:-])[&*][A-Za-z_]/.test(text), false, 'no YAML anchors or aliases');
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    assert.equal(indent % 2, 0, `indent must be a multiple of two: ${JSON.stringify(line)}`);
  }
});

test('workflow · it runs on push to any branch and on pull_request', () => {
  const triggers = block('on');
  assert.ok(triggers.includes('push:'), `on: must include push — got ${JSON.stringify(triggers)}`);
  assert.ok(triggers.includes('pull_request:'), 'on: must include pull_request');
  // No `branches:` filter under push: every pushed commit is verified, not just main's.
  assert.equal(triggers.some((line) => line.startsWith('branches')), false,
    'no branch filter: Article 8 applies to every pushed commit');
});

test('workflow · pull_request_target is ABSENT — it would run with write access', () => {
  // `pull_request_target` runs in the context of the BASE repository, with its secrets and
  // a writable token, against code from the fork. For a verification workflow that is a
  // straight privilege escalation and there is no use for it here.
  assert.equal(text.includes('pull_request_target'), false);
  assert.equal(text.includes('workflow_run'), false, 'same reason: it runs privileged');
});

test('workflow · the only permission granted is contents: read', () => {
  const permissions = block('permissions');
  assert.deepEqual(permissions, ['contents: read'],
    `the top-level grant must be exactly contents: read — got ${JSON.stringify(permissions)}`);
  // No job-level grant may widen it.
  const grants = valuesOf('permissions');
  assert.equal(grants.length, 1, 'exactly one permissions block, at the top level');
  for (const scope of ['write-all', 'id-token', 'packages:', 'pull-requests: write']) {
    assert.equal(text.includes(scope), false, `${scope} must not appear`);
  }
});

test('workflow · no secret is referenced, and no credential is persisted', () => {
  assert.equal(/secrets\./.test(text), false, 'this workflow needs no secret');
  assert.equal(text.includes('GITHUB_TOKEN'), false);
  assert.ok(text.includes('persist-credentials: false'),
    'the checkout must not leave a token in .git/config');
});

test('workflow · every action is pinned to a full commit SHA, with its tag in a comment', () => {
  const uses = valuesOf('uses');
  assert.ok(uses.length >= 4, `expected checkout, node, python and java — got ${uses.length}`);
  for (const entry of uses) {
    const match = /^([\w.-]+\/[\w.-]+)@([0-9a-f]{40})\s+#\s*(v[\d.]+)$/.exec(entry);
    assert.ok(match !== null,
      `an action must read <owner>/<repo>@<40-hex sha> # <tag>: ${JSON.stringify(entry)}`);
    assert.ok((match?.[1] ?? '').startsWith('actions/'),
      `only official actions/* are used here: ${entry}`);
  }
});

test('workflow · the checkout is deep, because the trailer check reads commits', () => {
  // `fetch-depth: 0` is not a convenience: `ci-trailer.mjs` asks git whether a commit is an
  // ancestor of the Article-8 boundary, and a shallow clone cannot answer.
  assert.deepEqual(valuesOf('fetch-depth'), ['0']);
});

test('workflow · dependencies come from the lockfile, never from a resolver', () => {
  assert.ok(text.includes('npm ci'), 'npm ci installs exactly the lockfile');
  assert.equal(/npm\s+(?:i|install)\b/.test(text), false, 'npm install would ignore the lockfile');
  assert.ok(existsSync(join(ROOT, 'package-lock.json')), 'npm ci needs package-lock.json');
});


test('workflow · the polyglot toolchains are provisioned, and Rust is probed not installed', () => {
  assert.ok(text.includes('actions/setup-python'), 'Python is needed by the conformance row');
  assert.ok(text.includes('actions/setup-java'), 'Java 21 is needed by the conformance row');
  assert.ok(/python-version:\s*'3\.(1[2-9]|[2-9]\d)'/.test(text), 'Python 3.12 or newer');
  assert.ok(/distribution:\s*temurin/.test(text) && /java-version:\s*'21'/.test(text));
  assert.ok(text.includes('rustc --version'), 'rustc is probed, never installed');
  assert.equal(/curl|wget|rustup|apt-get/.test(text), false,
    'nothing is downloaded by hand: the runner image already carries rustc');
  assert.ok(text.includes('JAVA_HOME'), 'the conformance probe resolves java through JAVA_HOME');
});

/** The mandatory commands, and what each one must actually be.
 * @type {ReadonlyArray<{ command: string, script?: string, file?: string }>} */
const MANDATORY = Object.freeze([
  { command: 'npm run typecheck', script: 'typecheck' },
  { command: 'node tools/gates/trilateral.mjs', file: 'tools/gates/trilateral.mjs' },
  { command: 'node --test' },
  { command: 'npm run gates', script: 'gates' },
  { command: 'node tools/gates/check-all.mjs --release', file: 'tools/gates/check-all.mjs' },
  { command: 'node tools/cellmode/cli.mjs check', file: 'tools/cellmode/cli.mjs' },
  { command: 'npm run upp:conformance', script: 'upp:conformance' },
  { command: 'node tools/gates/ci-trailer.mjs', file: 'tools/gates/ci-trailer.mjs' },
]);

test('workflow · every mandatory check is present and resolves to something real', () => {
  for (const { command, script, file } of MANDATORY) {
    assert.ok(text.includes(command), `the workflow must run: ${command}`);
    if (script !== undefined) {
      assert.ok(typeof pkg.scripts?.[script] === 'string',
        `package.json must define the script ${script}`);
    }
    if (file !== undefined) assert.ok(existsSync(join(ROOT, file)), `${file} must exist`);
  }
});

test('workflow · CI re-runs the suite and never reads the local evidence as proof', () => {
  const code = lines.filter((line) => !line.trim().startsWith('#')).join(' ');
  assert.equal(code.includes('.cellular'), false,
    'CI must not read local evidence: it is not in the checkout, and it would not be proof');
  assert.equal(code.includes('verify:final'), false,
    'verify:final writes a record for the LOCAL machine; CI re-runs the checks instead');
  assert.ok(text.includes('GITHUB_STEP_SUMMARY') || text.includes('ci-trailer.mjs'),
    'the run must publish what it established');
});

test('workflow · nothing bypasses a gate, and the run is serialised per ref', () => {
  assert.equal(text.includes('--no-verify'), false);
  assert.equal(/continue-on-error:\s*true/.test(text), false, 'a step that may fail is not a gate');
  assert.equal(/if:\s*(?:true|always\(\))/.test(text), false);
  const concurrency = block('concurrency');
  assert.ok(concurrency.some((line) => line.startsWith('group:') && line.includes('github.ref')),
    `concurrency must be grouped per ref — got ${JSON.stringify(concurrency)}`);
});
