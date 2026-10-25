// `upgrade --keep-modified` — the third choice between "overwrite somebody's work" and "this
// project can never upgrade again". A real adopter changed eight installed files on purpose (hooks,
// gates, a skill), and the whole-upgrade refusal of `upgrade` then locked them out for good.
//
// FOUR PROPERTIES ARE CHECKED AGAINST A REAL INSTALL ON DISK. Without the flag the refusal is
// unchanged (exit 3, zero writes). With it, a dry run still writes ZERO bytes — the whole tree is
// hashed before and after. With `--confirm`, the kept file is BYTE-IDENTICAL afterwards while the
// rest of the plan is applied, and the record marks it as this project's own: `status` reports
// healthy and `uninstall --dry-run` does not list it for removal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './main.mjs';
import { INSTALL_MANIFEST } from './plan-constants.mjs';
import { KEPT_REASON, changeCount, planUpgrade } from './upgrade-plan.mjs';
import { UPGRADE_KEEP_APPROVAL, keptLimitation, upgradedManifest } from './upgrade-record.mjs';
import { cleanup, makeProject, treeHash } from './fixtures/temp.mjs';
import { initGit } from './fixtures/projects.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LATER = '2026-10-24 09:30';
const MINE = '# my own edit, on purpose\n';
/** The file the adopter changed, and the one whose upstream bytes moved on. */
const KEPT = 'skills/pause/SKILL.md';
const MOVED = 'skills/cell/SKILL.md';

/** @param {string[]} args @param {string} [now]
 * @returns {{ code: number, out: string, err: string, all: string }} */
function run(args, now = '2026-10-06 12:00') {
  let out = '';
  let err = '';
  const code = main(['node', 'cli.mjs', ...args], {
    stdout: { write: (text) => { out += text; return true; } },
    stderr: { write: (text) => { err += text; return true; } },
    env: { CELLMODE_NOW: now, PATH: process.env.PATH ?? '' },
  });
  return { code, out, err, all: `${out}${err}` };
}

/** @param {string} target @param {string} rel @returns {string} */
const abs = (target, rel) => join(target, ...rel.split('/'));
/** @param {string} target @returns {Record<string, any>} */
const manifestOf = (target) => JSON.parse(readFileSync(abs(target, INSTALL_MANIFEST), 'utf8'));
/** @param {string} text @returns {string} */
const digest = (text) => createHash('sha256').update(text).digest('hex');

/** A real minimal install whose upstream `MOVED` file has changed since (the target holds older
 * bytes AND records them) and whose `KEPT` file the adopter edited on purpose.
 * @param {string} tag @returns {{ root: string, target: string }} */
function adopted(tag) {
  const { root, target } = makeProject(tag);
  initGit(target, { commit: false });
  const install = run(['new', target, '--profile', 'minimal', '--confirm', '--approve', 'first-cell']);
  assert.equal(install.code, 0, install.all);
  writeFileSync(abs(target, MOVED), '# an older skill\n');
  const manifest = manifestOf(target);
  const entry = manifest.files.find((/** @type {{ path: string }} */ file) => file.path === MOVED);
  assert.ok(entry, `${MOVED} is not a recorded file`);
  entry.sha256After = digest('# an older skill\n');
  writeFileSync(abs(target, INSTALL_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(abs(target, KEPT), MINE);
  return { root, target };
}

test('upgrade --keep-modified · without the flag it still refuses; the dry run writes zero bytes', () => {
  const { root, target } = adopted('upgrade-keep-dry');
  try {
    const before = treeHash(target);
    const refused = run(['upgrade', target, '--dry-run'], LATER);
    assert.equal(refused.code, 3, refused.all);
    assert.match(refused.out, /REFUSED/);
    assert.equal(treeHash(target), before, 'the refusal wrote something');
    const dry = run(['upgrade', target, '--dry-run', '--keep-modified'], LATER);
    assert.equal(dry.code, 0, dry.all);
    assert.doesNotMatch(dry.out, /REFUSED/);
    assert.match(dry.out, /kept\s+1 \(changed here after install — the project's own now\)/);
    assert.match(dry.out, /skills\/pause\/SKILL\.md/);
    assert.match(dry.out, /receives NO further method update/);
    assert.match(dry.out, /replace\s+1\n\s+skills\/cell\/SKILL\.md/);
    assert.equal(treeHash(target), before, 'the dry run wrote something into the target');
    const needed = run(['upgrade', target, '--keep-modified'], LATER);
    assert.equal(needed.code, 5, needed.all);
    assert.match(needed.err, /Re-run with --confirm/);
    assert.equal(treeHash(target), before, 'the run without --confirm wrote something');
    assert.doesNotMatch(dry.all, /[A-Za-z]:[\\/]/, 'an absolute path reached the output');
  } finally {
    cleanup(root);
  }
});

test('upgrade --keep-modified --confirm · the kept file is untouched, the rest of the plan is applied', () => {
  const { root, target } = adopted('upgrade-keep-confirm');
  try {
    const done = run(['upgrade', target, '--confirm', '--keep-modified'], LATER);
    assert.equal(done.code, 0, done.all);
    assert.match(done.out, /Replaced: 1 file/);
    assert.match(done.out, /Kept, untouched, now this project's own \(--keep-modified\): 1 file/);
    assert.match(done.out, /= skills\/pause\/SKILL\.md/);
    // The adopter's bytes, exactly; and the file whose source moved on now holds the new bytes.
    assert.equal(readFileSync(abs(target, KEPT), 'utf8'), MINE);
    assert.equal(readFileSync(abs(target, MOVED), 'utf8'),
      readFileSync(join(ROOT, ...MOVED.split('/')), 'utf8'));
    const manifest = manifestOf(target);
    const entry = manifest.files.find((/** @type {{ path: string }} */ file) => file.path === KEPT);
    assert.equal(entry.created, false, 'the kept file is recorded as one Bootstrap did not write');
    assert.equal(entry.mode, 'reference');
    assert.equal(entry.sha256After, digest(MINE), 'the record carries the bytes on disk now');
    assert.equal(entry.sha256Before, digest(MINE));
    assert.ok(manifest.limitations.includes(keptLimitation(KEPT)), 'the record says WHY it was kept');
    assert.ok(manifest.approvals.some((/** @type {{ action: string }} */ a) => a.action === UPGRADE_KEEP_APPROVAL));
    assert.doesNotMatch(done.all, /[A-Za-z]:[\\/]/, 'an absolute path reached the output');
  } finally {
    cleanup(root);
  }
});

test('upgrade --keep-modified --confirm · status is healthy, uninstall keeps it, a later upgrade leaves it', () => {
  const { root, target } = adopted('upgrade-keep-after');
  try {
    assert.equal(run(['upgrade', target, '--confirm', '--keep-modified'], LATER).code, 0);
    const status = run(['status', target, '--verbose'], LATER);
    assert.equal(status.code, 0, status.all);
    assert.match(status.out, /State: healthy/);
    assert.doesNotMatch(status.out, /Modified:/);
    // `uninstall --dry-run` plans a removal for what the install created and still owns. The kept
    // file is not one of those any more: it is listed as kept, never under `remove`.
    const uninstall = run(['uninstall', target, '--dry-run', '--verbose'], LATER);
    assert.equal(uninstall.code, 0, uninstall.all);
    assert.doesNotMatch(uninstall.out, /skills\/pause\/SKILL\.md — created by the install and unchanged/);
    assert.match(uninstall.out, /skills\/pause\/SKILL\.md — reference: this file already existed/);
    assert.equal(readFileSync(abs(target, KEPT), 'utf8'), MINE);
    // And no later upgrade goes near it: it is now left alone BY CLASS, not re-found as a finding.
    const again = run(['upgrade', target, '--dry-run', '--verbose'], LATER);
    assert.equal(again.code, 0, again.all);
    assert.doesNotMatch(again.out, /REFUSED/);
    assert.match(again.out, /referenced, never written by Bootstrap[^\n]*\n(?:\s+\S+\n)*\s+skills\/pause\/SKILL\.md/);
  } finally {
    cleanup(root);
  }
});

test('upgrade plan · with keepModified a modified immutable file is kept, not a finding', () => {
  /** @type {import('./status.mjs').FileFact} */
  const fact = {
    entry: { path: KEPT, mode: 'copy', created: true, sha256Before: null,
      sha256After: 'a'.repeat(64), block: null },
    state: 'modified', block: null, sha256: 'd'.repeat(64),
  };
  /** @type {Parameters<typeof planUpgrade>[0]} */
  const base = { files: [fact], targets: { [KEPT]: KEPT, [MOVED]: MOVED },
    sourceDigest: () => 'b'.repeat(64), present: () => false, skeleton: {} };
  const refused = planUpgrade(base);
  assert.equal(refused.findings.length, 1);
  assert.deepEqual(refused.kept, []);
  const kept = planUpgrade({ ...base, keepModified: true });
  assert.deepEqual(kept.findings, []);
  assert.deepEqual(kept.kept, [{ path: KEPT, reason: KEPT_REASON, sha256: 'd'.repeat(64) }]);
  assert.equal(KEPT_REASON, "changed here after install — the project's own now");
  // The rest of the plan proceeds: the path the catalog holds and the target lacks is still added.
  assert.deepEqual(kept.add.map((change) => change.path), [MOVED]);
  assert.equal(changeCount(kept), 1, 'a kept file is not a write');
});

test('upgrade record · a kept path becomes referenced, with its own hash and one limitation', () => {
  const manifest = Object.freeze({
    schema: 'cellular-mode/install-manifest', version: 1,
    source: { name: 'cellular-mode', version: '1.0.0', revision: null },
    profile: 'minimal', components: [{ id: 'method-core', componentVersion: '1.0.0' }],
    installedAt: '2026-10-06T12:00:00.000Z', target: { name: 'demo-app' },
    files: [{ path: KEPT, mode: 'copy', created: true, sha256Before: null, sha256After: 'a'.repeat(64) }],
    integrations: [], approvals: [{ action: 'first-cell', at: '2026-10-06T12:00:00.000Z' }],
    host: { languages: ['js'], buildSystems: [], ci: [], hooks: 'none' }, limitations: ['none'],
  });
  const input = { manifest, written: [], source: { name: 'cellular-mode', version: '2.0.0', revision: null },
    componentVersions: {}, now: '2026-10-24T09:30:00.000Z', kept: [{ path: KEPT, sha256: 'd'.repeat(64) }] };
  const amended = /** @type {Record<string, any>} */ (upgradedManifest(input));
  assert.deepEqual(amended.files, [{ path: KEPT, mode: 'reference', created: false,
    sha256Before: 'd'.repeat(64), sha256After: 'd'.repeat(64) }]);
  assert.deepEqual(amended.limitations, ['none', keptLimitation(KEPT)]);
  assert.equal(amended.approvals[1]?.action, UPGRADE_KEEP_APPROVAL);
  assert.deepEqual(Object.keys(amended).sort(), Object.keys(manifest).sort(), 'the key set is closed');
  // Twice over, the same bytes: the limitation is appended once, never duplicated.
  const twice = /** @type {Record<string, any>} */ (upgradedManifest({ ...input, manifest: amended }));
  assert.deepEqual(twice.limitations, amended.limitations);
});
