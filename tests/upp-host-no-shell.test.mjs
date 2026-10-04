// No shell, anywhere in the runtime — checked, not promised.
//
// A configuration file that can name a program is one `shell: true` away from being a
// configuration file that can run a command line. The claim in `eip/upp-host/README.md`
// ("argv only, never a shell string") is therefore worth exactly as much as this test: it
// reads every `.mjs` under `eip/` and refuses the whole family of shell entry points.
//
// It also pins the SPAWN SITE. One file in the runtime may start a process, and a reviewer
// should be able to find it by reading this test rather than by searching.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allFiles, read } from './helpers.mjs';

const RUNTIME = allFiles().filter((path) => path.startsWith('eip/') && path.endsWith('.mjs'));
// The forbidden-form scan reads the MODULES. A test file is allowed to quote a forbidden
// form in order to refuse it — `eip/upp/manifest.test.mjs` asserts that `shell: true` inside
// a manifest's `entry` is a breach, and a scan that could not tell the two apart would
// punish the test that proves the rule. Tests are checked by the narrower rule below: none
// of them may hand `shell: true` to a spawn.
const MODULES = RUNTIME.filter((path) => !path.endsWith('.test.mjs'));

/** The forbidden forms, each with the reason it is forbidden. `exec`/`execSync` take a
 * COMMAND STRING and hand it to `/bin/sh` or `cmd.exe`; `shell: true` does the same to an
 * argv array; `spawnSync` with a shell is the synchronous version of the same hole.
 * @type {ReadonlyArray<{ pattern: RegExp, why: string }>} */
const FORBIDDEN = Object.freeze([
  { pattern: /shell\s*:\s*true/, why: 'shell: true turns an argument into a command line' },
  { pattern: /\bexecSync\s*\(/, why: 'execSync takes a command STRING and runs it through a shell' },
  { pattern: /[^.\w]exec\s*\(\s*[`'"]/, why: 'exec with a string command runs it through a shell' },
  { pattern: /child_process['"]\s*\)?[^\n]*\bexec\b/, why: 'importing exec at all invites a string command' },
]);

test('upp-host · the runtime contains no shell execution of any form', () => {
  /** @type {string[]} */
  const findings = [];
  for (const path of MODULES) {
    const text = read(path);
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(text)) findings.push(`${path}: ${why}`);
    }
  }
  assert.deepEqual(findings, []);
  assert.ok(MODULES.length > 30, `expected to have read the runtime, saw ${MODULES.length} files`);
});

test('upp-host · no test file hands a shell to a spawn either', () => {
  const offenders = RUNTIME.filter((path) => path.endsWith('.test.mjs'))
    .filter((path) => /spawn[\s\S]{0,200}shell:\s*true/.test(read(path)));
  assert.deepEqual(offenders, []);
});

// Two files in the runtime may execute a program, each with a stated job. Named here so that
// a third one is a failing test rather than a code review somebody might not do:
//   channel.mjs ..... starts a PLUGIN and speaks the protocol to it (`spawn`)
//   toolchains.mjs .. asks a toolchain for its version and compiles the Rust conformance
//                     example (`spawnSync`); build-time only, no protocol conversation
const EXECUTORS = Object.freeze({
  'eip/upp-host/channel.mjs': /\bspawn\s*\(/,
  'eip/upp-host/toolchains.mjs': /\bspawnSync\s*\(/,
});

test('upp-host · only the two named MODULES execute a program, both argv-only', () => {
  // Modules, not tests: `eip/kernel/events.test.mjs` starts a clean Node process on purpose,
  // to prove a module can be imported with nothing else loaded. Test files are covered by the
  // shell rule above; what must stay at two is the number of SHIPPED executors.
  const found = MODULES.filter((path) => /\bspawn(Sync)?\s*\(/.test(read(path)));
  assert.deepEqual(found.sort(), Object.keys(EXECUTORS).sort(),
    'a third place that can execute something is a third security posture');
  for (const [path, pattern] of Object.entries(EXECUTORS)) {
    const text = read(path);
    assert.match(text, pattern, path);
    assert.match(text, /shell:\s*false/, `${path} must spawn with shell:false`);
    assert.match(text, /windowsHide:\s*true/, path);
  }
  assert.match(read('eip/upp-host/channel.mjs'), /spawn\(command\[0\] \?\? '', \[\.\.\.command\]\.slice\(1\)/,
    'the executable and its arguments are passed as an ARRAY, never joined');
});

test('upp-host · a conformance implementation is argv, never a command line', () => {
  const impl = read('eip/upp-host/conformance-impl.mjs');
  assert.match(impl, /command: \[/, 'every implementation row returns an argv ARRAY');
  assert.equal(/command:\s*[`'"]/.test(impl), false, 'and never a string to be re-split');
});

test('upp-host · the operator config forbids a command string by shape', () => {
  // The argv and env rules are shared by both entry kinds (`plugins` and `applications`), so
  // they are stated ONCE, in `entry-rules.mjs`. Two copies would be two postures.
  const text = read('eip/upp-host/entry-rules.mjs');
  assert.match(text, /never a shell string/);
  assert.match(text, /env must be an ARRAY of variable NAMES/);
  assert.match(read('eip/upp-host/config.mjs'), /never a shell string/, 'the plugin runtime rule too');
  assert.match(read('eip/upp-host/app-config.mjs'), /checkArgv/,
    'an application command goes through the same argv rule');
});
