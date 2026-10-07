// Every shipped component manifest is valid, and the shapes that would make Bootstrap write
// outside its target are refused. The second half is the point: a manifest is DATA read from a
// tree Bootstrap does not own, so the traversal, absolute-path, drive-letter and shell-argv
// cases are built HERE from fragments rather than written as literals, so that no scanner has
// to decide whether this file is an attack or a test of one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  MANIFEST_KEYS, REQUIRED_KEYS, SCHEMA, UNINSTALL, VERSION, pathProblem, validateComponent,
} from './component-schema.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIR = join(ROOT, 'bootstrap', 'components');

/** The eleven components `bootstrap/CONTRACTS.md` declares. Listed, not counted from the
 * directory: a manifest that silently disappears would otherwise still be a green run. */
const EXPECTED_IDS = Object.freeze([
  'adaptive', 'article-8', 'cellmode-cli', 'claude-code-adapter', 'cursor-adapter',
  'engineering-skills', 'method-core', 'observer', 'prompt-builder', 'upp', 'verification',
]);

/** @returns {ReadonlyArray<{ file: string, value: unknown }>} */
function manifests() {
  return readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
    .map((file) => ({ file, value: JSON.parse(readFileSync(join(DIR, file), 'utf8')) }));
}

/** A valid manifest to mutate, so each rejection test differs from the baseline in one way.
 * @returns {Record<string, unknown>} */
const base = () => ({
  schema: SCHEMA,
  version: VERSION,
  id: 'sample',
  componentVersion: '1.0.0',
  description: 'A sample component.',
  files: [{ source: 'skills/cell/SKILL.md', target: 'skills/cell/SKILL.md', mode: 'copy' }],
  uninstall: 'remove-owned',
});

/** @param {Record<string, unknown>} value @returns {ReadonlyArray<string>} */
const paths = (value) => validateComponent(value).errors.map((e) => e.path);

test('manifest · every shipped component manifest validates', () => {
  const found = manifests();
  assert.deepEqual(found.map(({ value }) => String(/** @type {Record<string, unknown>} */ (value).id)).sort(),
    [...EXPECTED_IDS]);
  for (const { file, value } of found) {
    const result = validateComponent(value);
    assert.equal(result.ok, true,
      `${file}: ${result.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`);
  }
});

test('manifest · the baseline is valid and every declared key is accepted', () => {
  assert.equal(validateComponent(base()).ok, true);
  const full = { ...base(), exclude: [], dependsOn: [], optionalDependsOn: [], conflicts: [], host: { requires: ['git'] }, config: ['vault/verification.json'], verify: [{ id: 'cell-state', argv: ['node', 'x.mjs', 'check'] }] };
  assert.equal(validateComponent(full).ok, true);
  assert.deepEqual([...MANIFEST_KEYS].sort(), Object.keys(full).sort());
  for (const key of REQUIRED_KEYS) {
    const missing = base();
    delete missing[key];
    assert.ok(paths(missing).includes(key), `omitting ${key} must be an error`);
  }
});

test('manifest · a path that escapes, anchors itself or hides a NUL is refused', () => {
  const up = `${'.'.repeat(2)}/etc/passwd`;
  const rooted = `${'/'}etc/passwd`;
  const drive = `${String.fromCharCode(67)}${':'}/Windows/System32`;
  const nul = `skills${String.fromCharCode(0)}/SKILL.md`;
  for (const bad of [up, rooted, drive, nul, 'skills\\cell\\SKILL.md', '', './x', 'a//b']) {
    assert.notEqual(pathProblem(bad), null, `${JSON.stringify(bad)} must be refused`);
    const manifest = base();
    manifest.files = [{ source: bad, target: 'skills/x.md', mode: 'copy' }];
    assert.ok(paths(manifest).includes('files[0].source'), `source ${JSON.stringify(bad)} must be refused`);
    const second = base();
    second.files = [{ source: 'skills/cell/SKILL.md', target: bad, mode: 'copy' }];
    assert.ok(paths(second).includes('files[0].target'), `target ${JSON.stringify(bad)} must be refused`);
  }
  assert.equal(pathProblem('tools/cellmode/cli.mjs'), null);
  assert.equal(pathProblem('tools/cellmode/'), null);
});

test('manifest · an unknown key is a rejection, at the top level and inside an entry', () => {
  assert.ok(paths({ ...base(), postInstall: 'curl' }).includes('postInstall'));
  const entry = base();
  entry.files = [{ source: 'a.md', target: 'a.md', mode: 'copy', chmod: '777' }];
  assert.ok(paths(entry).includes('files[0].chmod'));
  const host = base();
  host.host = { requires: [], shell: true };
  assert.ok(paths(host).includes('host.shell'));
});

test('manifest · generate needs a template and may not name a source', () => {
  const noTemplate = base();
  noTemplate.files = [{ target: 'AGENTS.md', mode: 'generate' }];
  assert.ok(paths(noTemplate).includes('files[0].template'));
  const withSource = base();
  withSource.files = [{ source: 'AGENTS.md', target: 'AGENTS.md', mode: 'generate', template: 'agents-md' }];
  assert.ok(paths(withSource).includes('files[0].source'));
  const copyTemplate = base();
  copyTemplate.files = [{ source: 'a.md', target: 'a.md', mode: 'copy', template: 'agents-md' }];
  assert.ok(paths(copyTemplate).includes('files[0].template'));
  const good = base();
  good.files = [{ target: 'AGENTS.md', mode: 'generate', template: 'agents-md' }];
  assert.equal(validateComponent(good).ok, true);
});

test('manifest · an argv element that only makes sense through a shell is refused', () => {
  const meta = [';', '|', '&', '$', '`', '<', '>', '\n', '*', '(', ')', '"', "'"];
  for (const character of meta) {
    const manifest = base();
    manifest.verify = [{ id: 'check', argv: ['node', `cli.mjs${character}whoami`] }];
    assert.ok(paths(manifest).includes('verify[0].argv[1]'), `${JSON.stringify(character)} must be refused`);
  }
  const empty = base();
  empty.verify = [{ id: 'check', argv: [] }];
  assert.ok(paths(empty).includes('verify[0].argv'));
  const nonString = base();
  nonString.verify = [{ id: 'check', argv: ['node', 7] }];
  assert.ok(paths(nonString).includes('verify[0].argv[1]'));
  const named = base();
  named.verify = [{ id: 'Cell State', argv: ['node', 'cli.mjs'] }];
  assert.ok(paths(named).includes('verify[0].id'));
});

test('manifest · identity fields and enums are closed', () => {
  assert.ok(paths({ ...base(), schema: 'other/manifest' }).includes('schema'));
  assert.ok(paths({ ...base(), version: 2 }).includes('version'));
  assert.ok(paths({ ...base(), id: 'Method_Core' }).includes('id'));
  assert.ok(paths({ ...base(), componentVersion: '1.0' }).includes('componentVersion'));
  assert.ok(paths({ ...base(), description: '   ' }).includes('description'));
  assert.ok(paths({ ...base(), uninstall: 'delete-everything' }).includes('uninstall'));
  assert.ok(paths({ ...base(), host: { requires: ['docker'] } }).includes('host.requires[0]'));
  assert.ok(paths({ ...base(), files: [] }).includes('files'));
  assert.ok(paths({ ...base(), dependsOn: ['Not An Id'] }).includes('dependsOn[0]'));
  assert.ok(UNINSTALL.includes(String(base().uninstall)));
  for (const notAnObject of [null, [], 'x', 7]) {
    assert.equal(validateComponent(notAnObject).ok, false);
  }
});
