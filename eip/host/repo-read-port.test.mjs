// A19, A20 — the repository read port is a sandbox, not a convenience.
//
// This port opens a whole project rather than one directory, so the tests assert WHICH guard
// answered: a test satisfied by any PERMISSION_DENIED would stay green with the exclusion
// list deleted. The invariant that matters most is checked directly — what `listRepoFiles`
// lists is exactly what `readRepoFile` accepts — because a report about files nobody can
// open, or a file nobody reported, is how an auditor acquires a blind spot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MAX_READ_BYTES } from './read-port.mjs';
import { MAX_REPO_FILES, createRepoReadPorts } from './repo-read-port.mjs';
import { kernelError } from '../kernel/assertions.mjs';
import { EVIDENCE_PATH } from '../../tools/gates/evidence.mjs';

/** A small project: a module, a document, a dotfile, an excluded directory and a vendored artefact. */
async function project() {
  const root = await mkdtemp(join(tmpdir(), 'eip-repo-'));
  /** @type {(rel: string, text: string) => Promise<void>} */
  const put = async (rel, text) => {
    const target = join(root, ...rel.split('/'));
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, text, 'utf8');
  };
  for (const [rel, text] of [
    ['package.json', '{"name":"x"}\n'],
    ['eip/sdk/index.mjs', 'export const a = 1;\n'],
    ['docs/notes.md', '# notes\n'],
    ['.gitattributes', '* -text\n'],
    ['.claude/skills/cell/SKILL.md', '# skill\n'],
    ['node_modules/left-pad/index.js', 'module.exports = 1;\n'],
    ['.git/HEAD', 'ref: refs/heads/main\n'],
    ['apps/observer/vendor/three@0.180.0/VENDOR.md', '# vendor\n'],
    ['apps/observer/vendor/three@0.180.0/three.core.min.js', 'x=1\n'],
  ]) await put(String(rel), String(text));
  return { root, ...createRepoReadPorts(root), cleanup: () => rm(root, { recursive: true, force: true }) };
}

/** @type {(error: unknown, message?: string) => boolean} */
const denied = (error, message) => {
  const named = kernelError(error);
  assert.equal(named.code, 'PERMISSION_DENIED');
  assert.equal(named.details[0]?.path, 'name');
  if (message !== undefined) assert.equal(named.details[0]?.message, message);
  return true;
};

test('A19 the four ports carry fs.read and nothing else, and none of them writes', async () => {
  const p = await project();
  try {
    const ports = /** @type {Record<string, { permission?: string }>} */ (/** @type {unknown} */ (p));
    for (const name of ['readRepoFile', 'listRepoFiles', 'readEvidence', 'readHead']) {
      assert.equal(ports[name]?.permission, 'fs.read', name);
    }
    assert.deepEqual(Object.keys(p).filter((key) => /write|spawn|exec/i.test(key)), []);
  } finally {
    await p.cleanup();
  }
});

test('A19 the listing applies the gates\' exclusion list and the segment rule', async () => {
  const p = await project();
  try {
    const listed = (await p.listRepoFiles.fn()).map((file) => file.path);
    assert.deepEqual(listed, [
      '.claude/skills/cell/SKILL.md',
      '.gitattributes',
      'apps/observer/vendor/three@0.180.0/VENDOR.md',
      'docs/notes.md',
      'eip/sdk/index.mjs',
      'package.json',
    ]);
    // Named one by one, so the deepEqual above cannot be "fixed" by deleting the exclusions:
    // not ours, the record rather than the work, and the hash-pinned upstream artefact.
    for (const absent of ['node_modules/left-pad/index.js', '.git/HEAD',
      'apps/observer/vendor/three@0.180.0/three.core.min.js']) {
      assert.equal(listed.includes(absent), false, absent);
    }
    const [first] = await p.listRepoFiles.fn();
    assert.ok(Number(first?.size) > 0 && Number(first?.modifiedMs) > 0);
    assert.equal(/[A-Za-z]:[\\/]/.test(JSON.stringify(await p.listRepoFiles.fn())), false);
  } finally {
    await p.cleanup();
  }
});

test('A19 what the listing lists is exactly what the reader accepts, and no more', async () => {
  const p = await project();
  try {
    for (const file of await p.listRepoFiles.fn()) {
      assert.equal(typeof await p.readRepoFile.fn(file.path), 'string', `${file.path} listed, not readable`);
    }
    // And the converse: an excluded path is refused, not silently empty.
    for (const rel of ['node_modules/left-pad/index.js', '.git/HEAD', EVIDENCE_PATH,
      'apps/observer/vendor/three@0.180.0/three.core.min.js']) {
      await assert.rejects(() => p.readRepoFile.fn(rel), (error) => denied(error), rel);
    }
    assert.equal(await p.readRepoFile.fn('docs/absent.md'), null, 'absence is a VALUE, not a refusal');
  } finally {
    await p.cleanup();
  }
});

test('A19 a symlink or junction cannot redirect a read out of the project', async (t) => {
  const p = await project();
  const outsideDir = join(p.root, '..', `eip-repo-escape-${process.pid}`);
  /** @type {string[]} */
  const refused = [];
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
    await writeFile(join(outsideDir, 'secret.md'), 'SECRET\n', 'utf8');
    const asFile = await tryLink(join(outsideDir, 'secret.md'), join(p.root, 'docs', 'leak.md'), 'file');
    if (asFile !== null) {
      await assert.rejects(() => p.readRepoFile.fn('docs/leak.md'),
        (error) => denied(error, 'the target is a symbolic link'));
      // A link is not a file: the listing must not report it either.
      assert.equal((await p.listRepoFiles.fn()).some((file) => file.path === 'docs/leak.md'), false);
    }
    const asJunction = await tryLink(outsideDir, join(p.root, 'outside'), 'junction');
    if (asFile === null && asJunction === null) {
      t.skip(`link creation refused (${refused.join(', ')}) — guard not exercised`);
      return;
    }
    if (asJunction !== null) {
      await assert.rejects(() => p.readRepoFile.fn('outside/secret.md'),
        (error) => denied(error, 'the target resolves outside the confined directory'));
    }
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
    await p.cleanup();
  }
});

test('A20 readEvidence opens ONE file, and readHead answers the commit or null', async () => {
  const p = await project();
  try {
    assert.equal(await p.readEvidence.fn(), null, 'no record yet is null, never a fabricated leg');
    await mkdir(join(p.root, '.cellular', 'evidence'), { recursive: true });
    await writeFile(join(p.root, EVIDENCE_PATH.split('/').join('\\')), '{"schema":1}\n', 'utf8');
    assert.deepEqual(await p.readEvidence.fn(), { schema: 1 });
    await writeFile(join(p.root, '.cellular', 'evidence', 'trilateral.json'), 'not json\n', 'utf8');
    assert.equal(await p.readEvidence.fn(), null, 'unparsable is UNKNOWN, not half-read');
    // `.git/HEAD` points at a ref with no object in this fixture.
    assert.equal(await p.readHead.fn(), null);
    await mkdir(join(p.root, '.git', 'refs', 'heads'), { recursive: true });
    await writeFile(join(p.root, '.git', 'refs', 'heads', 'main'), `${'c'.repeat(40)}\n`, 'utf8');
    assert.equal(await p.readHead.fn(), 'c'.repeat(40));
  } finally {
    await p.cleanup();
  }
});

test('A19 the caps are real: an oversized file is refused and the bounds are declared', async () => {
  const p = await project();
  try {
    assert.equal(MAX_REPO_FILES, 20000);
    assert.ok(MAX_READ_BYTES >= 1024);
    await writeFile(join(p.root, 'huge.md'), 'x'.repeat(MAX_READ_BYTES + 1), 'utf8');
    await assert.rejects(() => p.readRepoFile.fn('huge.md'),
      (error) => denied(error, `is larger than ${MAX_READ_BYTES} bytes`));
    assert.throws(() => createRepoReadPorts(''), (cause) => cause instanceof TypeError);
  } finally {
    await p.cleanup();
  }
});
