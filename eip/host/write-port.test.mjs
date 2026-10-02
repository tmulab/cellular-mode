// H11 — the write port is a sandbox, not a convenience.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createWritePort } from './write-port.mjs';
import { kernelError } from '../kernel/assertions.mjs';

async function sandbox() {
  const dir = await mkdtemp(join(tmpdir(), 'eip-reports-'));
  return { dir, port: createWritePort(dir), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** @type {(error: unknown) => boolean} */
const denied = (error) => {
  const named = kernelError(error);
  assert.equal(named.name, 'KernelError');
  assert.equal(named.code, 'PERMISSION_DENIED');
  assert.equal(named.details[0]?.path, 'name');
  return true;
};

// The symlink case asserts WHICH guard answered. Both link guards would refuse a
// link (`lstat` reports a link as neither a file nor a directory), so a test that
// only checked PERMISSION_DENIED would stay green with the symlink guard deleted.
/** @type {(error: unknown) => boolean} */
const deniedAsLink = (error) => {
  denied(error);
  assert.equal(kernelError(error).details[0]?.message, 'the target is a symbolic link');
  return true;
};

test('H11 a safe name is written under reportsDir and answers with the relative name', async () => {
  const { dir, port, cleanup } = await sandbox();
  try {
    assert.equal(port.permission, 'fs.write');
    const answer = await port.fn('report-c.json', '{"words":69}');
    assert.equal(answer, 'report-c.json', 'the API must not publish the filesystem layout');
    assert.equal(await readFile(join(dir, 'report-c.json'), 'utf8'), '{"words":69}');
    await port.fn('report-c.json', 'second'); // overwriting an own file is allowed
    assert.equal(await readFile(join(dir, 'report-c.json'), 'utf8'), 'second');
  } finally {
    await cleanup();
  }
});

test('H11 every escape attempt is PERMISSION_DENIED and writes nothing', async () => {
  const { dir, port, cleanup } = await sandbox();
  try {
    // Drive-letter forms are BUILT, never written as literals: an absolute path
    // baked into a source file is itself a leak (tests/leaks.test.mjs).
    const letter = String.fromCharCode(67);
    const attempts = [
      '../outside.json', '../../etc/passwd', 'a/b.json', 'a\\b.json', '..', '.',
      '/absolute.json', '\\absolute.json', `${letter}:/absolute.json`, `${letter}:\\absolute.json`,
      resolve(tmpdir(), 'absolute.json'), 'with\0nul.json', '', '.hidden',
      'with space.json', 'x'.repeat(65),
    ];
    for (const name of attempts) {
      await assert.rejects(() => port.fn(name, 'payload'), denied, `"${name}" must be refused`);
    }
    await assert.rejects(() => port.fn('ok.json', { not: 'a string' }), denied);
    assert.deepEqual(await readdir(dir), [], 'the sandbox must be untouched');
  } finally {
    await cleanup();
  }
});

test('H11 a target that exists and is not a regular file is refused', async () => {
  const { dir, port, cleanup } = await sandbox();
  try {
    await mkdir(join(dir, 'already-a-dir.json'));
    await assert.rejects(() => port.fn('already-a-dir.json', 'payload'), denied);
  } finally {
    await cleanup();
  }
});

test('H11 a symlinked target is refused, so a link cannot redirect a write', async (t) => {
  const { dir, port, cleanup } = await sandbox();
  const outsideDir = join(dir, '..', `eip-escape-${process.pid}`);
  const outsideFile = join(outsideDir, 'target.json');
  const link = join(dir, 'link.json');
  /** @type {string[]} */
  const refused = [];
  // A file symlink needs privilege on Windows; a directory JUNCTION normally does
  // not, and `lstat` reports a junction as a symbolic link — so the junction
  // exercises the SAME guard. Try the strongest form first, fall back, and skip
  // only if neither is permitted: a green test that tested nothing is worse than
  // a visible gap.
  /** @type {(target: string, type: 'file' | 'junction') => Promise<string | null>} */
  const tryLink = async (target, type) => {
    try {
      await symlink(target, link, type);
      return type;
    } catch (cause) {
      // The fs error carries a `code`; naming the shape beats assuming an Error.
      const failure = /** @type {{ code?: unknown }} */ (cause);
      refused.push(`${type}: ${String(failure.code)}`);
      return null;
    }
  };
  try {
    await mkdir(outsideDir, { recursive: true });
    await writeFile(outsideFile, 'original', 'utf8');
    const used = (await tryLink(outsideFile, 'file')) ?? (await tryLink(outsideDir, 'junction'));
    if (used === null) {
      t.diagnostic(`no link type is permitted for this account (${refused.join(', ')})`);
      t.skip(`link creation refused (${refused.join(', ')}) — guard not exercised`);
      return;
    }
    t.diagnostic(`guard exercised with a ${used} link${refused.length ? ` (${refused.join(', ')})` : ''}`);
    await assert.rejects(() => port.fn('link.json', 'hijacked'), deniedAsLink);
    assert.equal(await readFile(outsideFile, 'utf8'), 'original', 'the linked file must be untouched');
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
    await cleanup();
  }
});

test('H11 the port refuses to exist without a directory to own', () => {
  assert.throws(() => createWritePort(''), TypeError);
  // @ts-expect-error deliberate contract violation: the port needs a directory name.
  assert.throws(() => createWritePort(undefined), TypeError);
});
