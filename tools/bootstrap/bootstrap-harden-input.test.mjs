// The hardening pass of `skills/harden/SKILL.md`, mechanized: the UNTRUSTED-INPUT half of
// `bootstrap/THREAT-MODEL.md`. Where `bootstrap-harden.test.mjs` reads Bootstrap's own source, this
// file feeds it hostile DATA — a forged path, a tampered component manifest, a filename a shell or
// an argument parser would misread — and asserts the refusal happens before anything is written.
//
// The three claims:
//   A FORGED PATH IS REFUSED STRUCTURALLY. A control, newline or bidi character in a path is a
//   refusal from `pathProblem`, which both the manifest validator and `confine` stand on, so the
//   same answer covers "may this be declared" and "may this be written".
//   A TAMPERED MANIFEST IS REFUSED WHOLE. Escaping, anchoring, an extra key and a mode nobody
//   implements are each a validation error, and an honest manifest still passes.
//   A HOSTILE FILENAME NEVER REACHES A COMMAND LINE. The target holds files called `-rf`,
//   `$(id).md` and `&& rm x.md`; after a full install every one of them is byte-identical, and a
//   sibling of the target is too. No `--` separator is needed because no filename is ever passed
//   to a subprocess at all (`bootstrap-harden.test.mjs` asserts that statically).
//
// The last test also pins the no-network claim behaviourally: a full install succeeds with the
// proxy variables pointed at a closed port, because nothing in it ever opens a socket.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateComponent } from './component-schema.mjs';
import { pathProblem } from './component-parts.mjs';
import { confine } from './writer.mjs';
import { main } from './main.mjs';
import { cleanup, makeProject, makeTarget } from './fixtures/temp.mjs';

test('harden · a control, newline or bidi character in a path is refused structurally', () => {
  const NL = String.fromCharCode(10);
  const BIDI = String.fromCharCode(0x202e);
  const forged = [`ok.md${NL}  all gates passed`, `a${String.fromCharCode(9)}b.md`,
    `x${BIDI}gnl.mjs`, `y${String.fromCharCode(0x200b)}.md`, `z${String.fromCharCode(0x7f)}.md`];
  for (const value of forged) {
    assert.notEqual(pathProblem(value), null, `${JSON.stringify(value)} must be refused as a path`);
  }
  assert.equal(pathProblem('vault/state/log.md'), null, 'and an ordinary path still passes');
  // The same refusal where it matters most: a component manifest cannot name such a target, and
  // the writer cannot be talked into one either.
  const manifest = {
    schema: 'cellular-mode/component-manifest', version: 1, id: 'forged', componentVersion: '1.0.0',
    description: 'A manifest that tries to forge a line of a report.',
    files: [{ source: 'AGENTS.md', target: forged[0], mode: 'copy' }],
    exclude: [], dependsOn: [], optionalDependsOn: [], conflicts: [],
    host: { requires: [] }, config: [], verify: [], uninstall: 'remove-owned',
  };
  const result = validateComponent(manifest);
  assert.equal(result.ok, false, 'a manifest naming a forged target was accepted');
  assert.ok(result.errors.some((e) => e.path.endsWith('.target')),
    `the refusal did not name the target: ${JSON.stringify(result.errors)}`);
  const dir = makeTarget('forged');
  try {
    assert.throws(() => confine(dir, String(forged[0])), /refused a target path/);
  } finally {
    cleanup(dir);
  }
});

test('harden · a full install succeeds with the proxy variables pointed at a dead address', () => {
  const { root, target } = makeProject('noproxy');
  try {
    let out = '';
    const code = main(['node', 'cli.mjs', 'new', target, '--profile', 'minimal', '--confirm'], {
      stdout: { write: (text) => { out += text; return true; } },
      stderr: { write: (text) => { out += text; return true; } },
      env: {
        CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '',
        HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9',
        ALL_PROXY: 'socks5://127.0.0.1:9', NO_PROXY: '',
      },
    });
    assert.equal(code, 0, `an install that needs no network must not notice a dead proxy:\n${out}`);
    const installed = readFileSync(join(target, 'vault', 'install-manifest.json'), 'utf8');
    assert.match(installed, /"schema": "cellular-mode\/install-manifest"/);
    // Nothing fetched, nothing attempted: the gate rule `bootstrap-is-transport-free` is the
    // static half of this claim and `tests/gates-bootstrap-boundary.test.mjs` asserts it.
    assert.doesNotMatch(out, /proxy|ECONNREFUSED|ENOTFOUND/i);
  } finally {
    cleanup(root);
  }
});

test('harden · a tampered component manifest is refused before anything is installed', () => {
  const base = {
    schema: 'cellular-mode/component-manifest', version: 1, id: 'hostile', componentVersion: '1.0.0',
    description: 'Every way a manifest can try to leave the target.',
    exclude: [], dependsOn: [], optionalDependsOn: [], conflicts: [],
    host: { requires: [] }, config: [], verify: [], uninstall: 'remove-owned',
  };
  // Assembled from fragments: a literal drive path in a source file is a finding in this
  // repository's own leaks gate, and "it is only a test" is how a real one gets committed.
  const drivePath = ['C', ':/Windows/system32/x'].join('');
  /** @type {ReadonlyArray<[string, Record<string, unknown>]>} */
  const cases = [
    ['source escapes upward', { source: '../../../etc/passwd', target: 'a.md', mode: 'copy' }],
    ['source is absolute', { source: '/etc/passwd', target: 'a.md', mode: 'copy' }],
    ['source is a drive path', { source: drivePath, target: 'a.md', mode: 'copy' }],
    ['target escapes upward', { source: 'AGENTS.md', target: '../outside.md', mode: 'copy' }],
    ['target is absolute', { source: 'AGENTS.md', target: '/etc/cron.d/x', mode: 'copy' }],
    ['target carries a NUL', { source: 'AGENTS.md', target: `a${String.fromCharCode(0)}.md`, mode: 'copy' }],
    ['an unknown key rides along', { source: 'AGENTS.md', target: 'a.md', mode: 'copy', postinstall: 'x' }],
    ['a mode nobody implements', { source: 'AGENTS.md', target: 'a.md', mode: 'execute' }],
  ];
  for (const [why, entry] of cases) {
    assert.equal(validateComponent({ ...base, files: [entry] }).ok, false, `${why} was accepted`);
  }
  assert.deepEqual(validateComponent({ ...base,
    files: [{ source: 'AGENTS.md', target: 'AGENTS.md', mode: 'copy' }] }),
  { ok: true, errors: [] },
  'and an honest manifest is still accepted, so the refusals are narrow');
});

test('harden · a hostile filename in the target never reaches a command line', () => {
  const { root, target } = makeProject('dashnames');
  const sentinel = join(root, 'sentinel.txt');
  writeFileSync(sentinel, 'untouched\n');
  /** Names a shell or an argument parser would misread. `--` separators are irrelevant here
   * because no filename is ever passed to a subprocess at all. */
  const names = ['-rf', '--version', '-no-such-flag', ';whoami.md', '$(id).md', '`id`.md', '&& rm x.md'];
  /** @type {string[]} */
  const created = [];
  for (const name of names) {
    try {
      writeFileSync(join(target, name), `content of ${name}\n`);
      created.push(name);
    } catch { /* a filesystem that refuses the name has made the same point */ }
  }
  try {
    assert.ok(created.length >= 3, `only ${created.length} hostile names could be created`);
    let out = '';
    const code = main(['node', 'cli.mjs', 'existing', target, '--profile', 'minimal', '--confirm'], {
      stdout: { write: (text) => { out += text; return true; } },
      stderr: { write: (text) => { out += text; return true; } },
      env: { CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' },
    });
    assert.equal(code, 0, `the install refused a project that merely has odd filenames:\n${out}`);
    for (const name of created) {
      assert.equal(readFileSync(join(target, name), 'utf8'), `content of ${name}\n`,
        `${name} was changed or removed: a filename reached something that acted on it`);
    }
    assert.equal(readFileSync(sentinel, 'utf8'), 'untouched\n', 'a sibling of the target was touched');
    assert.doesNotMatch(out, /\$\(id\)|`id`/, 'an unsanitized hostile name was printed verbatim');
  } finally {
    cleanup(root);
  }
});
