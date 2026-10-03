// O12 — the vault read ports are a sandbox, not a convenience.
//
// The write port already proved the confinement rule once (H11). What is new here is
// the CLOSED SET: the readable surface is a list of names, so the tests assert which
// guard answered, not merely that something was refused. A test that only checked
// PERMISSION_DENIED would stay green with the whole name list deleted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CELL_SLUG, MAX_READ_BYTES, VAULT_FILES, assertVaultName, createVaultReadPorts, stateDirOf,
} from './read-port.mjs';
import { kernelError } from '../kernel/assertions.mjs';

/** A vault with one of each protocol file plus two cell files. */
async function vault() {
  const root = await mkdtemp(join(tmpdir(), 'eip-vault-'));
  const state = stateDirOf(root);
  await mkdir(join(state, 'cells'), { recursive: true });
  for (const name of VAULT_FILES) await writeFile(join(state, name), `# ${name}\n`, 'utf8');
  await writeFile(join(state, 'cells', 'word-count.md'), '# Cell: Word count\n', 'utf8');
  await writeFile(join(state, 'cells', 'README.md'), '# Cells\n', 'utf8');
  return { root, state, ...createVaultReadPorts(root), cleanup: () => rm(root, { recursive: true, force: true }) };
}

/** @type {(error: unknown, message?: string) => boolean} */
const denied = (error, message) => {
  const named = kernelError(error);
  assert.equal(named.code, 'PERMISSION_DENIED');
  assert.equal(named.details[0]?.path, 'name');
  if (message !== undefined) assert.equal(named.details[0]?.message, message);
  return true;
};

test('O12 both ports carry the fs.read permission and nothing else', async () => {
  const v = await vault();
  try {
    assert.equal(v.readVault.permission, 'fs.read');
    assert.equal(v.listCells.permission, 'fs.read');
    assert.deepEqual(Object.keys(v).filter((k) => k === 'writeFile'), [],
      'a read composition offers no writer');
  } finally {
    await v.cleanup();
  }
});

test('O12 every declared name reads, and the answer is TEXT, never a path', async () => {
  const v = await vault();
  try {
    for (const name of VAULT_FILES) {
      assert.equal(await v.readVault.fn(name), `# ${name}\n`);
    }
    assert.equal(await v.readVault.fn('cells/word-count.md'), '# Cell: Word count\n');
    assert.deepEqual(await v.listCells.fn(), ['README', 'word-count'].filter((s) => CELL_SLUG.test(s)));
    assert.deepEqual(await v.listCells.fn(), ['word-count'],
      'README.md is not a cell: the slug shape excludes it');
  } finally {
    await v.cleanup();
  }
});

test('O12 an absent file is null, not a refusal: an incomplete vault is a normal state', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'eip-empty-'));
  try {
    const { readVault, listCells } = createVaultReadPorts(empty);
    assert.equal(await readVault.fn('log.md'), null, 'no vault at all');
    assert.equal(await readVault.fn('cells/word-count.md'), null);
    assert.deepEqual(await listCells.fn(), []);
    await mkdir(stateDirOf(empty), { recursive: true });
    assert.equal(await readVault.fn('INDEX.md'), null, 'a vault with no files yet');
    assert.deepEqual(await listCells.fn(), [], 'no cells/ directory');
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});

test('O12 every escape attempt is PERMISSION_DENIED, with the guard that answered named', async () => {
  const v = await vault();
  try {
    // Drive-letter forms are BUILT, never written as literals: an absolute path baked
    // into a source file is itself a leak (tests/leaks.test.mjs).
    const letter = String.fromCharCode(67);
    /** @type {Array<[unknown, string]>} */
    const attempts = [
      ['', 'a vault name must be a non-empty string'],
      [undefined, 'a vault name must be a non-empty string'],
      [7, 'a vault name must be a non-empty string'],
      ['log\0.md', 'a vault name may not contain a NUL byte'],
      ['cells/../../secret.md', `must be one of ${VAULT_FILES.join(', ')} or cells/<slug>.md`],
      ['cells/..md', 'parent-directory traversal is refused'],
      ['cells/....md', 'must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'],
      ['cells/a/b.md', `must be one of ${VAULT_FILES.join(', ')} or cells/<slug>.md`],
      ['../log.md', `must be one of ${VAULT_FILES.join(', ')} or cells/<slug>.md`],
      ['/etc/passwd', `must be one of ${VAULT_FILES.join(', ')} or cells/<slug>.md`],
      [`${letter}:/absolute.md`, `must be one of ${VAULT_FILES.join(', ')} or cells/<slug>.md`],
      [resolve(tmpdir(), 'absolute.md'), `must be one of ${VAULT_FILES.join(', ')} or cells/<slug>.md`],
      ['policy.md', `must be one of ${VAULT_FILES.join(', ')} or cells/<slug>.md`],
      ['index.md', `must be one of ${VAULT_FILES.join(', ')} or cells/<slug>.md`],
      ['cells/word-count', 'a cell file must end in .md'],
      ['cells/Word-Count.md', 'a cell slug must match ^[a-z0-9-]{1,80}$'],
      ['cells/word_count.md', 'a cell slug must match ^[a-z0-9-]{1,80}$'],
      [`cells/${'a'.repeat(81)}.md`, 'must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'],
      [`cells/a${String.fromCharCode(92)}b.md`, 'path separators are refused'],
    ];
    for (const [name, message] of attempts) {
      await assert.rejects(() => v.readVault.fn(name), (e) => denied(e, message),
        `"${String(name)}" must be refused by the named guard`);
    }
    // Pure, so it is also asserted without a disk: the list IS the validation.
    assert.deepEqual(assertVaultName('cells/word-count.md'), ['cells', 'word-count.md']);
    assert.deepEqual(assertVaultName('log.md'), ['log.md']);
  } finally {
    await v.cleanup();
  }
});

test('O12 a symlink or junction cannot redirect a read out of the vault', async (t) => {
  const v = await vault();
  const outsideDir = join(v.root, '..', `eip-read-escape-${process.pid}`);
  const outsideFile = join(outsideDir, 'word-count.md');
  /** @type {string[]} */
  const refused = [];
  // A file symlink needs privilege on Windows; a directory JUNCTION normally does
  // not, and `lstat` reports a junction as a symbolic link. The junction form also
  // exercises the INTERMEDIATE-component case (cells/ itself redirected), which only
  // resolving the whole chain can catch. Skip only if neither form is permitted.
  /** @type {(target: string, link: string, type: 'file' | 'junction') => Promise<string | null>} */
  const tryLink = async (target, link, type) => {
    try {
      await symlink(target, link, type);
      return type;
    } catch (cause) {
      refused.push(`${type}: ${String(/** @type {{ code?: unknown }} */ (cause).code)}`);
      return null;
    }
  };
  try {
    await mkdir(outsideDir, { recursive: true });
    await writeFile(outsideFile, 'SECRET\n', 'utf8');
    const asFile = await tryLink(outsideFile, join(v.state, 'cells', 'leak.md'), 'file');
    if (asFile !== null) {
      await assert.rejects(() => v.readVault.fn('cells/leak.md'),
        (e) => denied(e, 'the target is a symbolic link'));
    }
    // The whole cells/ directory replaced by a junction to the outside.
    await rm(join(v.state, 'cells'), { recursive: true, force: true });
    const asJunction = await tryLink(outsideDir, join(v.state, 'cells'), 'junction');
    if (asFile === null && asJunction === null) {
      t.skip(`link creation refused (${refused.join(', ')}) — guard not exercised`);
      return;
    }
    if (asJunction !== null) {
      t.diagnostic('intermediate junction exercised');
      await assert.rejects(() => v.readVault.fn('cells/word-count.md'),
        (e) => denied(e, 'the target resolves outside the confined directory'));
    }
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
    await v.cleanup();
  }
});

test('O12 a file larger than the cap is refused, and the port needs a root to own', async () => {
  const v = await vault();
  try {
    assert.equal(MAX_READ_BYTES, 4 * 1024 * 1024);
    await writeFile(join(v.state, 'log.md'), 'x'.repeat(MAX_READ_BYTES + 1), 'utf8');
    await assert.rejects(() => v.readVault.fn('log.md'),
      (e) => denied(e, `is larger than ${MAX_READ_BYTES} bytes`));
  } finally {
    await v.cleanup();
  }
  assert.throws(() => createVaultReadPorts(''), TypeError);
  // @ts-expect-error deliberate contract violation: the port needs a root.
  assert.throws(() => createVaultReadPorts(undefined), TypeError);
});
