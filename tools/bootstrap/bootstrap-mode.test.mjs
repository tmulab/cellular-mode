// A declared working mode changes WORDING AND VERBOSITY ONLY (`adaptive/policies/boundaries.md`).
//
// The way to show that is not to read the renderer. It is to INSTALL TWICE — once in `ready`, once
// in `tired` — and compare the file list, every hash, and the install record. Anything a mode
// changed to a file, a check, an approval or a verification would show up here as a difference.
//
// And the converse is checked too: the two renderings are NOT the same text. A mode that changed
// nothing at all would be a lie of a different kind, so the dry run is where the difference is
// allowed to live, and the only place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './main.mjs';
import { profileHere } from './fixtures/availability.mjs';
import { cleanup, listFiles, makeProject } from './fixtures/temp.mjs';
import { sha256 } from './writer.mjs';

const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });

/** @param {string[]} args @returns {{ code: number, all: string }} */
function run(args) {
  let all = '';
  const write = (/** @type {string} */ text) => { all += text; return true; };
  const io = { stdout: { write }, stderr: { write }, env: { ...ENV } };
  return { code: main(['node', 'cli.mjs', ...args], io), all };
}

/** Every file of a target with its hash. The install record is excluded only because it names the
 * target, which differs by construction; it is compared separately below.
 * @param {string} dir @returns {Array<[string, string]>} */
const fingerprint = (dir) => listFiles(dir)
  .filter((rel) => rel !== 'vault/install-manifest.json')
  .map((rel) => [rel, sha256(readFileSync(join(dir, ...rel.split('/'))))]);

test('adaptive · --mode tired installs byte-identical files; only the wording differs', () => {
  const ready = makeProject('ready');
  const tired = makeProject('tired');
  try {
    const profile = profileHere('standard');
    const a = run(['new', ready.target, '--profile', profile, '--confirm', '--approve', 'first-cell']);
    const b = run(['new', tired.target, '--profile', profile, '--confirm', '--approve', 'first-cell', '--mode', 'tired']);
    assert.equal(a.code, 0, a.all);
    assert.equal(b.code, 0, b.all);
    assert.deepEqual(fingerprint(tired.target), fingerprint(ready.target),
      'a mode changed a file, a hash or a file list — which no mode may do');
    // The record differs in nothing but the target name, so the mode is absent from it as well.
    const strip = (/** @type {string} */ dir, /** @type {string} */ name) => readFileSync(
      join(dir, 'vault', 'install-manifest.json'), 'utf8').split(name).join('TARGET');
    assert.equal(strip(tired.target, 'demo-app'), strip(ready.target, 'demo-app'));
  } finally {
    cleanup(ready.root);
    cleanup(tired.root);
  }
});

test('adaptive · the wording does differ, and that is the only thing that may', () => {
  const { root, target } = makeProject('wording');
  try {
    const plain = run(['new', target, '--profile', 'minimal', '--dry-run']);
    const short = run(['new', target, '--profile', 'minimal', '--dry-run', '--mode', 'tired']);
    assert.equal(plain.code, 0, plain.all);
    assert.equal(short.code, 0, short.all);
    assert.match(plain.all, /installation plan\. This is a dry run/);
    assert.match(short.all, /plan only\. Nothing is written\./);
    assert.notEqual(plain.all, short.all);
  } finally {
    cleanup(root);
  }
});

test('adaptive · a plan in every mode names the same files, approvals and conflicts', () => {
  const { root, target } = makeProject('modes');
  try {
    /** @type {Map<string, string>} */
    const decisions = new Map();
    for (const mode of ['ready', 'tired', 'focus', 'explore']) {
      const result = run(['new', target, '--profile', profileHere('standard'), '--dry-run', '--mode', mode, '--verbose']);
      assert.equal(result.code, 0, result.all);
      decisions.set(mode, (result.all.match(/^ {2}- \S+$/gm) ?? []).sort().join('\n'));
    }
    const ready = decisions.get('ready');
    assert.ok(String(ready).length > 200, 'the comparison must actually have matched a list of paths');
    for (const mode of ['tired', 'focus', 'explore']) {
      assert.equal(decisions.get(mode), ready, `--mode ${mode} changed which paths and decisions are listed`);
    }
  } finally {
    cleanup(root);
  }
});
