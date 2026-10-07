// `new --confirm`: the install that actually happens, checked against the DISK, not against what the
// code says it did — every recorded hash recomputed from the file, every copy compared byte for byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './main.mjs';
import { loadCatalog } from './catalog.mjs';
import { partition, profileHere } from './fixtures/availability.mjs';
import { diskSource } from './source-read.mjs';
import { validateInstallManifest } from './install-manifest.mjs';
import { publicationFindings } from './publication.mjs';
import { sha256 } from './writer.mjs';
import { cleanup, listFiles, makeProject } from './fixtures/temp.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });

/** The repository's own approved contract, produced by the Prompt Builder in Stage 6 and committed
 * as an example. Copied rather than re-authored: a contract this test invented would prove only that
 * this test can invent one. It belongs to the OPTIONAL Builder, so a checkout that deleted that
 * module has neither it nor the Builder's CLI — and the first cell then falls back to a generic
 * discovery cell, which is the branch the two tests below take instead of claiming less. */
const EXAMPLE_CONTRACT = join(ROOT, 'examples', 'prompt-builder', 'project-contract.json');
const BUILDER_HERE = existsSync(EXAMPLE_CONTRACT) && existsSync(join(ROOT, 'tools', 'prompt-builder', 'cli.mjs'));

/** @param {string[]} args @returns {{ code: number, all: string }} */
function run(args) {
  let all = '';
  const write = (/** @type {string} */ text) => { all += text; return true; };
  const io = { stdout: { write }, stderr: { write }, env: { ...ENV } };
  return { code: main(['node', 'cli.mjs', ...args], io), all };
}

/** @param {string} target @returns {Record<string, unknown>} */
const manifestOf = (target) => JSON.parse(readFileSync(join(target, 'vault', 'install-manifest.json'), 'utf8'));

/** The optional modules a generated AGENTS.md may name, by component id. Asserted BOTH ways: the
 * section is there when the manifest carried the component and absent when it did not, so a checkout
 * that deleted one (where `profileHere` falls back) still proves the artefact tells the truth.
 * @type {ReadonlyArray<[string, string]>} */
const MODULE_SECTIONS = Object.freeze([['adaptive', 'Cellular Adaptive'],
  ['prompt-builder', 'Cellular Prompt Builder']]);

/** target path -> source path, for every copy an EXPANDABLE component declares. @returns {Map<string, string>} */
function sourceOfCopies() {
  const source = diskSource(ROOT);
  const catalog = loadCatalog(ROOT, source);
  assert.equal(catalog.ok, true, 'the catalog must load for the byte-identity check to mean anything');
  /** @type {Map<string, string>} */ const map = new Map();
  for (const { files } of partition(catalog, source).available) {
    for (const file of files) map.set(file.target, file.source);
  }
  return map;
}

/** Recomputes every recorded hash from the bytes on disk — the check that makes the record evidence
 * instead of a claim. @param {string} target @param {Record<string, unknown>} manifest */
function hashesMatchDisk(target, manifest) {
  const files = /** @type {Array<{ path: string, mode: string, sha256After: string }>} */ (manifest.files);
  assert.ok(files.length > 20, `expected a real install, got ${files.length} files`);
  for (const file of files) {
    assert.equal(sha256(readFileSync(join(target, ...file.path.split('/')))), file.sha256After,
      `${file.path} on disk does not match the hash the manifest recorded`);
  }
}

test('install · standard, with an approved contract, plans the first cell through the Builder', () => {
  const { root, target } = makeProject('standard');
  try {
    mkdirSync(join(target, 'vault'), { recursive: true });
    if (BUILDER_HERE) copyFileSync(EXAMPLE_CONTRACT, join(target, 'vault', 'project-contract.json'));
    const profile = profileHere('standard');
    const result = run(['new', target, '--profile', profile, '--confirm', '--approve', 'first-cell']);
    assert.equal(result.code, 0, result.all);
    assert.match(result.all, /Not activated\. To start: node tools\/cellmode\/cli\.mjs open/);

    const manifest = manifestOf(target);
    assert.deepEqual(validateInstallManifest(manifest), { ok: true, errors: [] });
    assert.deepEqual(manifest.target, { name: 'demo-app' }, 'the target is a basename, never a path');
    assert.deepEqual(publicationFindings(manifest), [], 'nothing publishable-unsafe reached the record');
    assert.equal(manifest.profile, profile);
    hashesMatchDisk(target, manifest);

    // A copy claims to BE the upstream file. Checked byte for byte against the SOURCE path the
    // catalog maps it from — which is not always the target path (`.claude/` pointers are copied
    // out of `adapters/`), so the mapping is read from the catalog rather than assumed.
    const fromSource = sourceOfCopies();
    const copies = /** @type {Array<{ path: string, mode: string }>} */ (manifest.files)
      .filter((file) => file.mode === 'copy');
    assert.ok(copies.length > 20, `expected copies, got ${copies.length}`);
    for (const file of copies) {
      const source = fromSource.get(file.path);
      assert.ok(source !== undefined, `${file.path} is recorded as a copy but the catalog maps no source to it`);
      assert.deepEqual(readFileSync(join(target, ...file.path.split('/'))),
        readFileSync(join(ROOT, ...String(source).split('/'))), `${file.path} is not byte-identical`);
    }

    // The first cell exists, is PLANNED, and nothing is active.
    const index = readFileSync(join(target, 'vault', 'state', 'INDEX.md'), 'utf8');
    assert.match(index, /\| 📋 \|/, 'a planned cell must be in the index');
    assert.doesNotMatch(index, /\| 🔵 \|/, 'nothing may be active: planning is not activation');
    assert.match(readFileSync(join(target, 'vault', 'state', 'CURRENT-CELL.md'), 'utf8'), /No active cell/i);
    assert.match(readFileSync(join(target, 'vault', 'state', 'log.md'), 'utf8'), /^# /, 'the log is the empty header');
    const cells = listFiles(join(target, 'vault', 'state', 'cells'));
    assert.deepEqual(cells.filter((rel) => rel !== 'README.md').length, 1, cells.join(', '));
    assert.equal(cells.includes('project-discovery.md'), !BUILDER_HERE,
      'with an approved contract the Builder names the cell; without the Builder it is the discovery cell');
    const firstCell = /** @type {Array<{ kind: string, status: string, detail: string }>} */ (manifest.integrations)
      .find((entry) => entry.kind === 'first-cell');
    assert.equal(firstCell?.status, 'applied');
    assert.match(String(firstCell?.detail), BUILDER_HERE
      ? /approved project contract|not activated/ : /Prompt Builder not installed in the source/);

    // A generated AGENTS.md names exactly what the manifest says was installed, and nothing else.
    const agents = readFileSync(join(target, 'AGENTS.md'), 'utf8');
    const ids = new Set(/** @type {Array<{ id: string }>} */ (manifest.components).map(({ id }) => id));
    assert.match(agents, /^# demo-app/);
    for (const [id, name] of MODULE_SECTIONS) assert.equal(new RegExp(name).test(agents), ids.has(id), name);
    assert.doesNotMatch(agents, /Observer|Universal Plugin Protocol|Cursor/);
    assert.doesNotMatch(agents, /\{\{/, 'no placeholder survived rendering');

    // The scratch directory is ignored, with markers a later uninstall can find.
    const ignore = readFileSync(join(target, '.gitignore'), 'utf8');
    assert.match(ignore, /# cellular-mode:begin \(bootstrap\)/);
    assert.match(ignore, /vault\/bootstrap\//);
    assert.match(readFileSync(join(target, 'vault', 'verification.json'), 'utf8'), /"checks": \[\]/);

    // And a second run refuses: a manifest present is never a silent reinstall.
    const second = run(['new', target, '--profile', 'standard', '--confirm']);
    assert.equal(second.code, 3);
    assert.match(second.all, /already there|run status/);
  } finally {
    cleanup(root);
  }
});

test('install · minimal, with no contract, plans a generic discovery cell — only when approved', () => {
  const approved = makeProject('discovery');
  try {
    const result = run(['new', approved.target, '--profile', 'minimal', '--confirm', '--approve', 'first-cell']);
    assert.equal(result.code, 0, result.all);
    assert.ok(listFiles(join(approved.target, 'vault', 'state', 'cells')).includes('project-discovery.md'));
    const manifest = manifestOf(approved.target);
    hashesMatchDisk(approved.target, manifest);
    const cell = /** @type {Array<{ kind: string, detail: string }>} */ (manifest.integrations)
      .find((entry) => entry.kind === 'first-cell');
    assert.match(String(cell?.detail), BUILDER_HERE
      ? /no project contract in the target/ : /Prompt Builder not installed in the source/);
    assert.deepEqual(manifest.approvals, [{ action: 'create the first cell', at: '2026-10-06T12:00:00.000Z' }]);
    // Minimal names nothing optional in AGENTS.md.
    const agents = readFileSync(join(approved.target, 'AGENTS.md'), 'utf8');
    assert.doesNotMatch(agents, /Adaptive|Prompt Builder|Observer/);
    assert.match(agents, /tools\/cellmode\/cli\.mjs/);
  } finally {
    cleanup(approved.root);
  }
  const withheld = makeProject('nocell');
  try {
    const result = run(['new', withheld.target, '--profile', 'minimal', '--confirm']);
    assert.equal(result.code, 0, result.all);
    assert.deepEqual(listFiles(join(withheld.target, 'vault', 'state', 'cells')), ['README.md'],
      'no approval, no cell — and the state skeleton is still there');
    const cell = /** @type {Array<{ kind: string, status: string, detail: string }>} */ (manifestOf(withheld.target).integrations)
      .find((entry) => entry.kind === 'first-cell');
    assert.equal(cell?.status, 'proposed');
    assert.match(String(cell?.detail), /approval "first-cell" was not given/);
  } finally {
    cleanup(withheld.root);
  }
});
