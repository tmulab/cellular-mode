// AD27 — the adaptive read port is a sandbox of TWO NAMES, and there is no writer anywhere.
//
// The confinement rule itself was proved twice already (H11 for the write port, O12 for the
// vault reader); this file is about the closed set and about what the port must NOT reach. So
// every refusal asserts WHICH guard answered: a test that only checked PERMISSION_DENIED
// would stay green with the whole name list deleted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ADAPTIVE_FILES, MAX_ADAPTIVE_BYTES, adaptiveDirOf, assertAdaptiveName, createAdaptiveReadPorts,
} from './adaptive-read-port.mjs';
import { kernelError } from '../kernel/assertions.mjs';

/** A project whose `.cellular/adaptive/` holds both files plus the hook's own cache. */
async function project({ withState = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'eip-adaptive-'));
  const dir = adaptiveDirOf(root);
  if (withState) {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'session.json'), '{"schema":1,"mode":"tired"}\n', 'utf8');
    await writeFile(join(dir, 'preferences.json'), '{"schema":1,"enabled":true}\n', 'utf8');
    // Deliberately present: the hook's idempotence cache is NOT part of the contract.
    await writeFile(join(dir, 'injected.json'), '{"hash":"x"}\n', 'utf8');
  }
  await mkdir(join(root, 'vault', 'state'), { recursive: true });
  await writeFile(join(root, 'vault', 'state', 'log.md'), '# log\n', 'utf8');
  await writeFile(join(root, 'secret.txt'), 'nope\n', 'utf8');
  return { root, dir, ...createAdaptiveReadPorts(root), cleanup: () => rm(root, { recursive: true, force: true }) };
}

/** @type {(error: unknown, message?: string) => boolean} */
const denied = (error, message) => {
  const named = kernelError(error);
  assert.equal(named.code, 'PERMISSION_DENIED');
  assert.equal(named.details[0]?.path, 'name');
  if (message !== undefined) assert.equal(named.details[0]?.message, message);
  return true;
};

test('AD27 the port carries fs.read, is the ONLY port, and has no write counterpart', async () => {
  const p = await project();
  try {
    assert.deepEqual(Object.keys(p).filter((k) => k.startsWith('read') || k.startsWith('write')), ['readAdaptive']);
    assert.equal(p.readAdaptive.permission, 'fs.read');
    // The module exports no writer at all: the grep IS the claim.
    const source = await (await import('node:fs/promises')).readFile(
      new URL('./adaptive-read-port.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /writeFile|mkdir|rm\(|unlink|appendFile/, 'no write primitive may be imported here');
  } finally {
    await p.cleanup();
  }
});

test('AD27 both declared names read, and the answer is TEXT, never a path or an object', async () => {
  const p = await project();
  try {
    assert.deepEqual([...ADAPTIVE_FILES], ['session.json', 'preferences.json']);
    for (const name of ADAPTIVE_FILES) {
      const text = await p.readAdaptive.fn(name);
      assert.equal(typeof text, 'string');
      assert.match(String(text), /^\{"schema":1/);
      assert.doesNotMatch(String(text), /[\\/]/, 'no path may leave through this port');
    }
  } finally {
    await p.cleanup();
  }
});

test('AD27 absence is a VALUE: no declaration, and no .cellular at all, both answer null', async () => {
  const empty = await project({ withState: false });
  try {
    assert.equal(await empty.readAdaptive.fn('session.json'), null, 'the normal state of a checkout');
  } finally {
    await empty.cleanup();
  }
  const p = await project();
  try {
    await rm(join(p.dir, 'session.json'));
    assert.equal(await p.readAdaptive.fn('session.json'), null);
    assert.equal(typeof await p.readAdaptive.fn('preferences.json'), 'string', 'the other file still reads');
  } finally {
    await p.cleanup();
  }
});

test('AD27 the closed set refuses everything else BY NAME — including the hook cache', async () => {
  const p = await project();
  try {
    for (const name of ['injected.json', 'session.json.bak', 'SESSION.JSON', 'session', '']) {
      await assert.rejects(() => p.readAdaptive.fn(name), (error) => denied(error));
    }
    await assert.rejects(() => p.readAdaptive.fn('injected.json'),
      (error) => denied(error, 'must be one of session.json, preferences.json'));
    // The cache exists on disk, which is the whole point of asserting it is refused.
    assert.equal(typeof await (await import('node:fs/promises')).readFile(join(p.dir, 'injected.json'), 'utf8'), 'string');
  } finally {
    await p.cleanup();
  }
});

test('AD27 the vault, the repository and the parent tree are all out of reach', async () => {
  const p = await project();
  try {
    for (const name of [
      '../../vault/state/log.md', '../../secret.txt', '../../../etc/passwd',
      'C:\\Windows\\win.ini', '/etc/passwd', '..\\..\\secret.txt', 'session.json\0.png',
    ]) {
      await assert.rejects(() => p.readAdaptive.fn(name), (error) => denied(error),
        `${name} must be refused`);
    }
    for (const name of [null, undefined, 7, { name: 'session.json' }, ['session.json']]) {
      await assert.rejects(() => p.readAdaptive.fn(name), (error) => denied(error));
    }
  } finally {
    await p.cleanup();
  }
});

test('AD27 a symbolic link in the confined directory is refused, not followed', async () => {
  const p = await project();
  try {
    await rm(join(p.dir, 'session.json'));
    try {
      await symlink(join(p.root, 'secret.txt'), join(p.dir, 'session.json'));
    } catch {
      return; // unprivileged Windows: the guard is proved by O12/H11 on the same helper
    }
    await assert.rejects(() => p.readAdaptive.fn('session.json'),
      (error) => denied(error, 'the target is a symbolic link'));
  } finally {
    await p.cleanup();
  }
});

test('AD27 the name rule is PURE and the size cap is real', async () => {
  assert.deepEqual(assertAdaptiveName('session.json'), ['session.json']);
  assert.throws(() => assertAdaptiveName('injected.json'), (error) => denied(error));
  const p = await project();
  try {
    await writeFile(join(p.dir, 'session.json'), 'x'.repeat(MAX_ADAPTIVE_BYTES + 1), 'utf8');
    await assert.rejects(() => p.readAdaptive.fn('session.json'),
      (error) => denied(error, `is larger than ${MAX_ADAPTIVE_BYTES} bytes`));
  } finally {
    await p.cleanup();
  }
});

test('AD27 the factory refuses to exist without a root', () => {
  for (const bad of ['', '   ', 7, null, undefined]) {
    assert.throws(() => createAdaptiveReadPorts(/** @type {string} */ (/** @type {unknown} */ (bad))), TypeError);
  }
});
