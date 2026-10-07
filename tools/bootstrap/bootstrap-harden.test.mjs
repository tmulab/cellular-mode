// The hardening pass of `skills/harden/SKILL.md`, mechanized: the STATIC half of
// `bootstrap/THREAT-MODEL.md`. Every claim that document makes about capabilities is asserted here
// against the real source of the module, so a future cell cannot acquire one by accident.
//
// Three claims, in the order the threat model lists them. The untrusted-DATA half of the same pass
// is `bootstrap-harden-input.test.mjs`, and the install-level half `bootstrap-harden-install.test.mjs`.
//   NO SHELL ANYWHERE. Not `shell: true`, not `exec`/`execSync` (whose single argument IS a shell
//   command line), not `execFile`, not `fork`. The same scan covers the three Article 8
//   verification modules of decision BS3, where only ONE literal `npm` of the built-in suite is
//   allowed a shell and a contract's argv never is.
//   ONE SPAWNER. `node:child_process` is imported by exactly one file, which is also what the gate
//   rule `bootstrap-starts-a-process-in-exec-only` states as data.
//   LITERAL ARGV. Every argument array Bootstrap builds is string literals, with one documented
//   interpolated element: the target DIRECTORY, passed after a `--root` flag to the Builder's CLI.
//   No filename from a target ever reaches a command line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOOKS_ARGV } from './integrate-hooks.mjs';
import { UNSET_ARGV } from './uninstall.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HERE = fileURLToPath(new URL('.', import.meta.url));

/** The CODE of a module, with every comment blanked. A file that documents the rule it obeys —
 * "`shell: true` only for the literal npm" — must not be read as breaking it; and a scan that
 * cannot tell code from prose would push the next author towards saying less.
 * @param {string} text @returns {string} */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

/** The module's own non-test source, as `{ rel, text }`. Fixtures are INCLUDED: a fixture that
 * opened a shell would still be a shell in this directory. Tests are excluded because they are
 * allowed to write `shell: true` into a manifest fixture as the hostile input it is.
 * @returns {ReadonlyArray<{ rel: string, text: string }>} */
function sources() {
  /** @type {Array<{ rel: string, text: string }>} */
  const out = [];
  /** @param {string} dir @param {string} prefix @returns {void} */
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')) {
        out.push({ rel, text: code(readFileSync(join(dir, entry.name), 'utf8')) });
      }
    }
  };
  walk(HERE, '');
  return out;
}

/** The three Article 8 verification modules BS3 generalized. They are NOT part of Bootstrap and
 * survive its removal; they are scanned here because Bootstrap GENERATES the contract they read. */
const VERIFICATION = Object.freeze(['verification-contract.mjs', 'verification-argv.mjs', 'verification-suite.mjs']);

/** Process APIs whose command is a STRING a shell parses. `.exec(` of a regular expression is
 * excluded by the leading boundary, which is why this is a list of names and not a search for
 * `exec`. @type {ReadonlyArray<RegExp>} */
const STRING_COMMAND_APIS = Object.freeze([
  /(?<![.\w])execSync\s*\(/, /(?<![.\w])exec\s*\(/, /(?<![.\w])execFile(?:Sync)?\s*\(/,
  /(?<![.\w])fork\s*\(/, /\bspawn\s*\(/,
]);

test('harden · no shell and no string-command process API, in Bootstrap or the BS3 gate modules', () => {
  /** @type {string[]} */
  const offenders = [];
  for (const { rel, text } of sources()) {
    if (/shell\s*:\s*true/.test(text)) offenders.push(`${rel}: shell: true`);
    for (const api of STRING_COMMAND_APIS) {
      if (api.test(text)) offenders.push(`${rel}: ${String(api)}`);
    }
  }
  assert.deepEqual(offenders, [], `a shell or a string-command API reached Bootstrap:\n${offenders.join('\n')}`);
  // The gate side of BS3. `shell: true` must appear in NONE of them as a literal: the built-in
  // suite passes its one `npm` as a positional argument, and a contract's argv never does.
  for (const name of VERIFICATION) {
    const text = code(readFileSync(join(ROOT, 'tools', 'gates', name), 'utf8'));
    assert.doesNotMatch(text, /shell\s*:\s*true/, `${name} must not hard-code a shell`);
    for (const api of STRING_COMMAND_APIS.filter((re) => !/spawn/.test(String(re)))) {
      assert.doesNotMatch(text, api, `${name} must not use a string-command API`);
    }
  }
});

test('harden · exactly one file in Bootstrap can start a program, and it is exec.mjs', () => {
  const spawners = sources()
    .filter(({ text }) => /from\s+'node:child_process'/.test(text))
    .map(({ rel }) => rel);
  assert.deepEqual(spawners, ['exec.mjs'], 'the capability lives in one file or the rule is a fiction');
  // Comments stripped on purpose: the prose of this module says `shell: false` too, and a check
  // that a DOC claim is present would have stayed green when the code said the opposite. Found by
  // mutating `shell: false` to `shell: true` and watching only the scan above turn red.
  const exec = code(readFileSync(join(HERE, 'exec.mjs'), 'utf8'));
  assert.match(exec, /shell:\s*false/, 'and that file states shell: false in CODE');
  assert.match(exec, /timeout:/, 'and bounds the run');
  assert.match(exec, /maxBuffer:/, 'and bounds the captured output');
});

test('harden · every argv Bootstrap builds is literal, bar one documented directory', () => {
  /** The only non-literal elements allowed, and the file each is allowed in. A target FILENAME is
   * absent from this list on purpose: no filename from a target ever reaches a command line. */
  const ALLOWED = Object.freeze({
    'process.execPath': 'compose-builder.mjs',
    cli: 'compose-builder.mjs',
    '...args': 'compose-builder.mjs',
    targetRoot: 'compose-builder.mjs',
    '...HOOKS_ARGV': 'integrate-hooks.mjs',
    '...UNSET_ARGV': 'uninstall.mjs',
    // Test-only, and literal: two `-c` flags carrying a fixture name and an `.invalid` address.
    '...identityFlags()': 'fixtures/projects.mjs',
  });
  const CALL = /(?:^|[^\w.])(?:run|execRun|runCheck)\s*\(\s*\[([^\]]*)\]/g;
  /** @type {string[]} */
  const offenders = [];
  let seen = 0;
  for (const { rel, text } of sources()) {
    for (const match of text.matchAll(CALL)) {
      seen += 1;
      for (const raw of String(match[1]).split(',')) {
        const element = raw.trim().replace(/\s+/g, ' ');
        if (element === '' || /^'[^']*'$/.test(element)) continue;
        const owner = ALLOWED[/** @type {keyof typeof ALLOWED} */ (element)];
        if (owner !== rel) offenders.push(`${rel}: ${element}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `a non-literal argv element:\n${offenders.join('\n')}`);
  assert.ok(seen >= 6, `the scan found ${seen} argv arrays, so it is reading the real call sites`);
  // The two exported command constants, read as the data they are: no shell punctuation, no path.
  for (const argv of [HOOKS_ARGV, UNSET_ARGV]) {
    assert.equal(argv[0], 'git');
    for (const element of argv) {
      assert.match(element, /^[A-Za-z0-9._/-]+$/, `${element} is not a plain argument`);
    }
  }
});

