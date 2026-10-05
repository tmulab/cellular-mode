// The hardening pass for the Builder as a NEW CAPABILITY — `skills/harden/SKILL.md` §2,
// written up in `prompt-builder/THREAT-MODEL.md`. Each test here is one of that document's
// mitigations, so a finding that became a line in the threat model comes back if it regresses.
//
// Four claims, each about a trust boundary rather than about a feature:
//   1. the inspection walk never leaves the root it was given, by any link;
//   2. a document on disk is bounded BEFORE it is parsed, so a hostile file is a refusal and
//      never an out-of-memory crash;
//   3. the Builder's private draft directory is not version-controlled;
//   4. the Builder holds no network and no process privilege at all.
// Temporary directories only: the repository's own `vault/` is never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOf, detailsOf } from './errors.mjs';
import { MAX_DOCUMENT_BYTES } from './store-read.mjs';
import { builderPath, listProjectFiles, readContract, readDraft, vaultPath } from './store.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** @type {(name: string) => string} */
const freshDir = (name) => mkdtempSync(join(tmpdir(), `builder-${name}-`));
/** The error a call raised, or `null`. `assert.throws` returns nothing, and this pass has to
 * inspect the code and the details — the machine-readable half of a refusal.
 * @type {(fn: () => unknown) => Error | null} */
const caught = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return /** @type {Error} */ (error);
  }
};
/** @type {(file: string, bytes: number) => void} */
const writeBytes = (file, bytes) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, 'a'.repeat(bytes), 'utf8');
};

test('harden · the inspection walk never follows a link out of the root it was given', (t) => {
  const root = freshDir('root');
  const outside = freshDir('outside');
  try {
    writeFileSync(join(root, 'package.json'), '{"name":"inspected"}\n', 'utf8');
    mkdirSync(join(outside, 'nested'), { recursive: true });
    writeFileSync(join(outside, 'nested', 'elsewhere.md'), 'not part of the project\n', 'utf8');
    writeFileSync(join(outside, 'target.txt'), 'not part of the project\n', 'utf8');
    /** @type {string[]} */
    const made = [];
    for (const [name, target, type] of /** @type {Array<[string, string, 'junction' | 'file']>} */ ([
      ['linked-tree', outside, 'junction'],
      ['linked-file', join(outside, 'target.txt'), 'file'],
    ])) {
      try {
        symlinkSync(target, join(root, name), type);
        made.push(name);
      } catch { /* an unprivileged Windows session cannot create this kind of link */ }
    }
    if (made.length === 0) {
      t.skip('this session may not create symbolic links or junctions, so the walk cannot be '
        + 'shown refusing to follow one here; the claim is still enforced by the dirent test in '
        + 'listProjectFiles, which records neither a link nor its target');
      return;
    }
    const found = listProjectFiles(root).map((file) => file.path);
    assert.deepEqual(found, ['package.json'],
      `the walk recorded ${found.join(', ')}: a link is neither followed nor listed`);
    assert.equal(readFileSync(join(outside, 'target.txt'), 'utf8').length > 0, true,
      'and the target is still there: the walk is read-only, links included');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('harden · a draft or a contract past the byte ceiling is refused, not parsed', () => {
  const root = freshDir('caps');
  try {
    assert.equal(MAX_DOCUMENT_BYTES, 1024 * 1024, 'the ceiling is a named decision, not a guess');
    writeBytes(builderPath(root, 'draft.json'), MAX_DOCUMENT_BYTES + 1);
    const draftError = caught(() => readDraft(root));
    assert.equal(codeOf(draftError), 'BAD_DRAFT');
    assert.match(String(draftError?.message), /past the \d+-byte ceiling/);
    assert.deepEqual(detailsOf(draftError), { bytes: MAX_DOCUMENT_BYTES + 1, limit: MAX_DOCUMENT_BYTES });
    writeBytes(vaultPath(root, 'project-contract.json'), MAX_DOCUMENT_BYTES + 1);
    const contractError = caught(() => readContract(root));
    assert.equal(codeOf(contractError), 'BAD_CONTRACT');
    assert.match(String(contractError?.message), /past the \d+-byte ceiling/);
    // And the ceiling is not the only check: a file UNDER it that is not JSON still refuses,
    // so adding the cap did not replace the parse guard with a cheaper one.
    writeBytes(builderPath(root, 'draft.json'), 32);
    assert.equal(codeOf(caught(() => readDraft(root))), 'BAD_DRAFT');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('harden · the private draft directory is ignored by version control', () => {
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  const lines = ignore.split('\n').map((line) => line.trim());
  assert.ok(lines.includes('vault/builder/'),
    'vault/builder/ holds an unapproved working draft and must never be committed');
  // The approved records are NOT ignored: the contract and the cells are what gets committed.
  assert.equal(lines.includes('vault/'), false, 'ignoring the whole vault would hide the record');
  assert.equal(lines.includes('vault/project-contract.json'), false);
});
