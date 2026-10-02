// Tests for the key audit — A1..A8 ported from the original toolkit, plus the
// custom-prefix case and the CLI exit codes. Convention: `node --test`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keysFromMap, classify, report } from './key-audit.mjs';

const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));

const MAP = [
  '| Key | Provides | Injects | Owner | Card. |',
  '| --- | --- | --- | --- | --- |',
  '| `shop.cart` | X | — | shop | single |',
  '| `shop.pricing` | Y | — | shop | by name |',
  '| `shop.catalog` | Z | — | shop | single |',
  '| `shop-package` | `shop.cart` · `shop.pricing` |',
].join('\n');

const SOURCES = [
  { file: 'packages/p/src/a.ts', text: "export default { name: 'shop.cart', apply() {} };" },
  { file: 'packages/p/src/b.ts', text: "export const x = { name: 'shop.pricing:express' };" },
  { file: 'packages/p/src/c.ts', text: '/** `shop.catalog` — no named implementation. */\nexport function f() {}' },
];

describe('key audit · reads the map', () => {
  test('A1 extracts only the keys, not the package rows', () => {
    assert.deepEqual(keysFromMap(MAP), ['shop.cart', 'shop.pricing', 'shop.catalog']);
  });

  test('A9 a custom prefix narrows the audit to one namespace', () => {
    const map = MAP + '\n| `billing.invoice` | W | — | billing | single |';
    assert.deepEqual(keysFromMap(map, { prefix: 'billing\\.[a-z-]+' }), ['billing.invoice']);
    assert.equal(keysFromMap(map).length, 4);
  });
});

describe('key audit · three buckets, and the middle one is what matters', () => {
  test('A2 a literal `name:` counts as implemented', () => {
    assert.deepEqual(classify(['shop.cart'], SOURCES).named.map((c) => c.key), ['shop.cart']);
  });

  test('A3 a `by name` variant counts for the parent key, and the evidence shows which', () => {
    assert.match(String(classify(['shop.pricing'], SOURCES).named[0]?.evidence), /shop\.pricing:express/);
  });

  test('A4 a key cited only in PROSE goes to the middle bucket, never to the named one', () => {
    const r = classify(['shop.catalog'], SOURCES);
    assert.deepEqual(r.named, []);
    assert.deepEqual(r.proseOnly.map((c) => c.key), ['shop.catalog']);
    assert.equal(r.proseOnly[0]?.file, 'packages/p/src/c.ts');
  });

  test('A5 a key that appears nowhere goes to absent', () => {
    assert.deepEqual(classify(['shop.shipping'], SOURCES).absent, ['shop.shipping']);
  });

  test('A6 there is NO `total` field: summing the middle bucket is exactly the error to avoid', () => {
    const r = classify(['shop.cart', 'shop.pricing', 'shop.catalog', 'shop.shipping'], SOURCES);
    assert.equal(r.named.length, 2);
    assert.equal(r.proseOnly.length, 1);
    assert.equal(r.absent.length, 1);
    // Rounding an audit in its own favour is worse than no audit: a `total` would
    // invite adding the prose-only bucket to the named one.
    assert.equal('total' in r, false);
  });
});

describe('key audit · the report does not round in its own favour', () => {
  test('A7 reports the three numbers separately and cites evidence from each bucket', () => {
    const text = report(MAP, SOURCES);
    assert.match(text, /2 of 3/);
    assert.match(text, /prose only/);
    assert.match(text, /packages\/p\/src\/c\.ts/);
  });

  test('A8 an absent key is NAMED — silence about what is missing is the worst report', () => {
    const text = report(MAP + '\n| `shop.shipping` | W | — | shop | single |', SOURCES);
    assert.match(text, /shop\.shipping/);
  });
});

/** @param {string[]} keys @param {Record<string, string>} files @returns {string} */
function fixture(keys, files) {
  const root = mkdtempSync(join(tmpdir(), 'key-audit-'));
  mkdirSync(join(root, 'contracts'), { recursive: true });
  const rows = ['| Key | Provides |', '| --- | --- |', ...keys.map((k) => `| \`${k}\` | X |`)];
  writeFileSync(join(root, 'contracts', 'key-map.md'), rows.join('\n'));
  const src = join(root, 'packages', 'p', 'src', 'deep');
  mkdirSync(src, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(src, name), text);
  return root;
}

/** @param {string} root @param {string[]} [args]
 * @returns {{ code: number, stdout: string, stderr: string }} */
function run(root, args = []) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, '--root', root, ...args], { encoding: 'utf8' });
    return { code: 0, stdout, stderr: '' };
  } catch (cause) {
    // execFileSync throws an Error carrying the child's status and streams.
    const failure = /** @type {{ status?: unknown, stdout?: unknown, stderr?: unknown }} */ (cause);
    return {
      code: typeof failure.status === 'number' ? failure.status : 1,
      stdout: String(failure.stdout ?? ''),
      stderr: String(failure.stderr ?? ''),
    };
  }
}

describe('key audit · CLI exit codes (a CI gate, unlike the original)', () => {
  test('A10 exit 0 when every declared key has a named implementation', () => {
    const root = fixture(['shop.cart'], { 'a.ts': "export default { name: 'shop.cart' };" });
    const r = run(root);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /1 of 1/);
    rmSync(root, { recursive: true, force: true });
  });

  test('A11 exit 2 when any key is prose-only or absent', () => {
    const root = fixture(['shop.cart', 'shop.catalog'], { 'a.ts': '/** `shop.catalog` */' });
    const r = run(root);
    assert.equal(r.code, 2);
    assert.match(r.stdout, /prose only \(1\)/);
    assert.match(r.stdout, /shop\.cart/);
    rmSync(root, { recursive: true, force: true });
  });

  test('A12 exit 1 with a clear message (no stack) when the map cannot be read', () => {
    const root = mkdtempSync(join(tmpdir(), 'key-audit-'));
    const r = run(root);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /cannot read key map/);
    assert.doesNotMatch(r.stderr, /at .*key-audit/);
    rmSync(root, { recursive: true, force: true });
  });

  test('A13 exit 1 on an unknown option, and --ext/--prefix are honoured', () => {
    const root = fixture(['shop.cart'], { 'a.js': "export default { name: 'shop.cart' };" });
    assert.equal(run(root, ['--nope', 'x']).code, 1);
    assert.equal(run(root, ['--ext', '.ts']).code, 2); // .js files not collected
    assert.equal(run(root, ['--ext', '.ts,.js']).code, 0);
    assert.equal(run(root, ['--prefix', 'billing\\.[a-z-]+']).stdout.includes('0 of 0'), true);
    rmSync(root, { recursive: true, force: true });
  });
});
