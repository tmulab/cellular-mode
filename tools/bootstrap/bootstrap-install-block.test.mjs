// A managed BLOCK in a file the project already owns: the one way Bootstrap ever modifies an
// existing file, and the approval that gates it. Split from `bootstrap-install.test.mjs` for the
// 200-line rule — that file is about what an install CREATES, this one about what it APPENDS to,
// and the two claims are read one at a time.
//
// Both halves matter: WITHOUT `--approve agents-block` their file is untouched and the refusal is
// RECORDED as a limitation; WITH it the block is appended after their text, and the record keeps the
// hash of the file before, the hash of the block itself (markers included — that is what tells a
// later uninstall intact from edited) and the approval that allowed it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './main.mjs';
import { sha256 } from './writer.mjs';
import { cleanup, makeProject } from './fixtures/temp.mjs';

const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });

/** @param {string[]} args @returns {{ code: number, all: string }} */
function run(args) {
  let all = '';
  const write = (/** @type {string} */ text) => { all += text; return true; };
  const io = { stdout: { write }, stderr: { write }, env: { ...ENV } };
  return { code: main(['node', 'cli.mjs', ...args], io), all };
}

/** @param {string} target @returns {Record<string, unknown>} */
const manifestOf = (target) => JSON.parse(readFileSync(join(target, 'vault', 'install-manifest.json'), 'utf8'));

/** Recomputes every recorded hash from the bytes on disk. @param {string} target
 * @param {Record<string, unknown>} manifest @returns {void} */
function hashesMatchDisk(target, manifest) {
  const files = /** @type {Array<{ path: string, sha256After: string }>} */ (manifest.files);
  assert.ok(files.length > 20, `expected a real install, got ${files.length} files`);
  for (const file of files) {
    assert.equal(sha256(readFileSync(join(target, ...file.path.split('/')))), file.sha256After,
      `${file.path}: the recorded hash is not what is on disk`);
  }
}

test('install · an existing AGENTS.md gets a managed block only with --approve agents-block', () => {
  const theirs = '# Their rules\n\nDo not delete this.\n';
  const refused = makeProject('noblock');
  try {
    writeFileSync(join(refused.target, 'AGENTS.md'), theirs);
    const result = run(['new', refused.target, '--profile', 'minimal', '--confirm']);
    assert.equal(result.code, 0, result.all);
    assert.equal(readFileSync(join(refused.target, 'AGENTS.md'), 'utf8'), theirs, 'their file is untouched');
    const limitations = /** @type {string[]} */ (manifestOf(refused.target).limitations);
    assert.ok(limitations.some((line) => /AGENTS\.md/.test(line) && /agents-block/.test(line)),
      `the refusal must be RECORDED, got: ${limitations.join(' | ')}`);
    assert.match(result.all, /Not applied \(1\)/);
  } finally {
    cleanup(refused.root);
  }
  const granted = makeProject('block');
  try {
    writeFileSync(join(granted.target, 'AGENTS.md'), theirs);
    const result = run(['new', granted.target, '--profile', 'minimal', '--confirm',
      '--approve', 'agents-block,first-cell']);
    assert.equal(result.code, 0, result.all);
    const text = readFileSync(join(granted.target, 'AGENTS.md'), 'utf8');
    assert.ok(text.startsWith(theirs), 'the block is APPENDED; their text stays first and intact');
    assert.match(text, /begin method-core -->[\s\S]+skills\/cell\/SKILL\.md[\s\S]+end method-core -->/);
    const manifest = manifestOf(granted.target);
    hashesMatchDisk(granted.target, manifest);
    const entry = /** @type {Array<{ path: string, created: boolean, sha256Before: string | null,
     *   block?: { component: string, sha256: string } }>} */ (manifest.files)
      .find((file) => file.path === 'AGENTS.md');
    assert.equal(entry?.block?.component, 'method-core');
    // The block's own digest, markers included: what tells a later uninstall intact from edited.
    assert.equal(entry?.block?.sha256, sha256(text.slice(text.indexOf('<!-- cellular-mode:begin'))));
    assert.equal(entry?.created, false);
    assert.equal(entry?.sha256Before, sha256(theirs), 'the record keeps what the file was before');
    assert.deepEqual(/** @type {Array<{ action: string }>} */ (manifest.approvals).map((a) => a.action).sort(),
      ['append a managed block to AGENTS.md', 'create the first cell']);
  } finally {
    cleanup(granted.root);
  }
});
