// THE UPGRADE PLAN, from a fixture — the decision half of `upgrade`, with no filesystem in sight.
// `bootstrap-upgrade.test.mjs` proves the command against a real install; this file pins the
// classification itself, path class by path class, because that is where an upgrade can do harm:
// one wrong class and a tool either overwrites somebody's work or claims to have upgraded a file
// it never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REASONS, changeCount, planUpgrade, staticReason } from './upgrade-plan.mjs';
import { upgradedManifest } from './upgrade-record.mjs';

/** @typedef {import('./status.mjs').FileFact} FileFact */

/** One recorded file, as `status-read.mjs` would report it.
 * @param {Partial<import('./status.mjs').Entry> & { path: string }} entry
 * @param {import('./status.mjs').FileState} state @returns {FileFact} */
const fact = (entry, state) => ({
  entry: { mode: 'copy', created: true, sha256Before: null, sha256After: 'a'.repeat(64),
    block: null, ...entry },
  state,
  block: entry.block === undefined || entry.block === null ? null : 'intact',
  sha256: state === 'missing' ? null : 'a'.repeat(64),
});

/** @type {(overrides: Partial<Parameters<typeof planUpgrade>[0]>) =>
 *   Parameters<typeof planUpgrade>[0]} */
const input = (overrides) => ({
  files: [], targets: {}, sourceDigest: () => 'b'.repeat(64), present: () => false, skeleton: {},
  ...overrides,
});

test('upgrade plan · an immutable copy is replaced only when the source moved on', () => {
  const files = [fact({ path: 'skills/cell/SKILL.md' }, 'healthy')];
  const targets = { 'skills/cell/SKILL.md': 'skills/cell/SKILL.md' };
  const moved = planUpgrade(input({ files, targets }));
  assert.deepEqual(moved.replace.map((change) => change.path), ['skills/cell/SKILL.md']);
  assert.equal(moved.findings.length, 0);
  const same = planUpgrade(input({ files, targets, sourceDigest: () => 'a'.repeat(64) }));
  assert.equal(changeCount(same), 0);
  assert.equal(same.current, 1);
});

test('upgrade plan · a modified immutable file is a finding, and a missing one is an add', () => {
  const targets = { 'skills/cell/SKILL.md': 'skills/cell/SKILL.md' };
  const edited = planUpgrade(input({ files: [fact({ path: 'skills/cell/SKILL.md' }, 'modified')], targets }));
  assert.equal(edited.findings.length, 1);
  assert.equal(changeCount(edited), 0, 'a refused upgrade plans no write at all');
  assert.match(String(edited.findings[0]?.why), /the WHOLE upgrade is refused/);
  const gone = planUpgrade(input({ files: [fact({ path: 'skills/cell/SKILL.md' }, 'missing')], targets }));
  assert.deepEqual(gone.add.map((change) => change.path), ['skills/cell/SKILL.md']);
  assert.equal(gone.findings.length, 0);
});

test('upgrade plan · evolving, generated, block and referenced paths are left alone by CLASS', () => {
  const cases = [
    [fact({ path: 'vault/state/INDEX.md', mode: 'generate' }, 'modified'), REASONS.evolving],
    [fact({ path: 'vault/verification.json', mode: 'generate' }, 'modified'), REASONS.evolving],
    [fact({ path: 'AGENTS.md', mode: 'generate' }, 'healthy'), REASONS.generated],
    [fact({ path: '.gitignore', created: false, mode: 'generate', block: { component: 'x', sha256: null } }, 'modified'), REASONS.block],
    [fact({ path: 'package.json', created: false, mode: 'reference' }, 'referenced'), REASONS.referenced],
  ];
  for (const [item, reason] of cases) {
    const file = /** @type {FileFact} */ (item);
    assert.equal(staticReason(file), reason, file.entry.path);
    const plan = planUpgrade(input({ files: [file], targets: { [file.entry.path]: 'whatever' } }));
    assert.equal(changeCount(plan), 0, file.entry.path);
    assert.equal(plan.findings.length, 0, file.entry.path);
    assert.deepEqual(plan.untouched, [{ path: file.entry.path, reason }]);
  }
});

test('upgrade plan · a path the catalog gained is added, unless it is already there unrecorded', () => {
  const targets = { 'skills/operation/SKILL.md': 'skills/operation/SKILL.md' };
  const fresh = planUpgrade(input({ targets }));
  assert.deepEqual(fresh.add.map((change) => change.path), ['skills/operation/SKILL.md']);
  const theirs = planUpgrade(input({ targets, present: () => true }));
  assert.equal(changeCount(theirs), 0);
  assert.deepEqual(theirs.untouched, [{ path: 'skills/operation/SKILL.md', reason: REASONS.unowned }]);
});

test('upgrade plan · a dropped catalog entry and a source this checkout lacks are never written', () => {
  const dropped = planUpgrade(input({ files: [fact({ path: 'old/THING.md' }, 'healthy')] }));
  assert.deepEqual(dropped.untouched, [{ path: 'old/THING.md', reason: REASONS.dropped }]);
  const absent = planUpgrade(input({
    files: [fact({ path: 'skills/cell/SKILL.md' }, 'healthy')],
    targets: { 'skills/cell/SKILL.md': 'skills/cell/SKILL.md' },
    sourceDigest: () => null,
  }));
  assert.deepEqual(absent.untouched, [{ path: 'skills/cell/SKILL.md', reason: REASONS.unknownSource }]);
  assert.equal(changeCount(absent), 0);
});

test('upgrade plan · the skeleton is extended only where a file is absent, and never for log.md', () => {
  const skeleton = { 'log.md': '# log\n', 'cells/README.md': '# Cells\n', 'INDEX.md': '# index\n' };
  const plan = planUpgrade(input({ skeleton, present: (/** @type {string} */ rel) => rel.endsWith('INDEX.md') }));
  assert.deepEqual(plan.skeleton.map((change) => change.path), ['vault/state/cells/README.md']);
});

test('upgrade record · the amended manifest carries every untouched key and adds one approval', () => {
  const manifest = Object.freeze({
    schema: 'cellular-mode/install-manifest', version: 1,
    source: { name: 'cellular-mode', version: '1.0.0', revision: null },
    profile: 'minimal', components: [{ id: 'method-core', componentVersion: '1.0.0' }],
    installedAt: '2026-10-06T12:00:00.000Z', target: { name: 'demo-app' },
    files: [{ path: 'skills/cell/SKILL.md', mode: 'copy', created: true, sha256Before: null, sha256After: 'a'.repeat(64) }],
    integrations: [{ kind: 'hooks', status: 'skipped', detail: 'no git' }],
    approvals: [{ action: 'first-cell', at: '2026-10-06T12:00:00.000Z' }],
    host: { languages: ['js'], buildSystems: [], ci: [], hooks: 'none' }, limitations: ['none'],
  });
  const amended = /** @type {Record<string, any>} */ (upgradedManifest({
    manifest,
    written: [
      { path: 'skills/cell/SKILL.md', sha256After: 'b'.repeat(64), mode: 'copy' },
      { path: 'vault/state/cells/README.md', sha256After: 'c'.repeat(64), mode: 'generate' },
    ],
    source: { name: 'cellular-mode', version: '2.0.0', revision: 'f'.repeat(40) },
    componentVersions: { 'method-core': '2.0.0' }, now: '2026-10-24T09:30:00.000Z',
  }));
  assert.equal(amended.source.version, '2.0.0');
  assert.equal(amended.installedAt, '2026-10-24T09:30:00.000Z');
  assert.deepEqual(amended.components, [{ id: 'method-core', componentVersion: '2.0.0' }]);
  assert.deepEqual(amended.integrations, manifest.integrations);
  assert.equal(amended.files.length, 2);
  assert.equal(amended.files[0]?.sha256After, 'b'.repeat(64));
  assert.equal(amended.approvals.length, 2);
  assert.equal(amended.approvals[1]?.action, 'upgrade --confirm');
  assert.deepEqual(Object.keys(amended).sort(), Object.keys(manifest).sort(), 'the key set is closed');
});
