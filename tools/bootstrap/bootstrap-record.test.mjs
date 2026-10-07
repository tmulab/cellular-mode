// The install record is COMMITTED project history, so the questions here are the two a reviewer
// would ask of any committed file: is its shape exactly the declared one, and is every byte of it
// fit to publish.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA, VERSION, buildInstallManifest, validateInstallManifest,
} from './install-manifest.mjs';
import { publicationFindings, stringFinding } from './publication.mjs';
import { APPROVAL_NAMES, blockApprovalFor, parseApprovals } from './approvals.mjs';

/** @type {(...parts: string[]) => string} */
const j = (...parts) => parts.join('');

const HASH = 'a'.repeat(64);
const COMMIT = 'b'.repeat(40);

/** A minimal, valid manifest to mutate per test. @returns {Record<string, unknown>} */
const good = () => buildInstallManifest({
  plan: { profile: 'minimal', components: [{ id: 'method-core' }] },
  results: [{ path: 'AGENTS.md', mode: 'generate', created: true, sha256Before: null, sha256After: HASH }],
  source: { name: 'cellular-mode', version: '0.1.0', revision: COMMIT },
  targetName: 'demo-app',
  approvals: [{ action: 'create the first cell', at: '2026-10-06T12:00:00.000Z' }],
  integrations: [{ kind: 'hooks', status: 'proposed', detail: 'not activated by this version' }],
  host: { languages: ['javascript'], buildSystems: ['npm'], ci: [], hooks: 'none' },
  componentVersions: { 'method-core': '1.0.0' },
  limitations: [],
  now: '2026-10-06T12:00:00.000Z',
});

/** @param {Record<string, unknown>} manifest @param {RegExp} pattern @returns {void} */
function rejects(manifest, pattern) {
  const result = validateInstallManifest(manifest);
  assert.equal(result.ok, false, 'the manifest should have been refused');
  const text = result.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
  assert.match(text, pattern);
}

test('record · the built manifest is the declared schema, and it validates', () => {
  const manifest = good();
  assert.equal(manifest.schema, SCHEMA);
  assert.equal(manifest.version, VERSION);
  assert.deepEqual(manifest.components, [{ id: 'method-core', componentVersion: '1.0.0' }]);
  assert.deepEqual(manifest.target, { name: 'demo-app' });
  assert.deepEqual(validateInstallManifest(manifest), { ok: true, errors: [] });
  // The key set of every container is EXACTLY the contract's — read off the built document, so a
  // field added without a decision fails here rather than in somebody's next release.
  assert.deepEqual(Object.keys(manifest), ['schema', 'version', 'source', 'profile', 'components',
    'installedAt', 'target', 'files', 'integrations', 'approvals', 'host', 'limitations']);
  assert.deepEqual(Object.keys(/** @type {object} */ (manifest.host)),
    ['languages', 'buildSystems', 'ci', 'hooks']);
  assert.deepEqual(Object.keys(/** @type {object[]} */ (manifest.files)[0] ?? {}),
    ['path', 'mode', 'created', 'sha256Before', 'sha256After'], 'no block key when there is no block');
});

test('record · the key set is closed at every level', () => {
  rejects({ ...good(), extra: 1 }, /manifest\.extra: unknown key/);
  rejects({ ...good(), source: { name: 'x', version: '1', revision: null, origin: 'y' } }, /source\.origin: unknown key/);
  rejects({ ...good(), target: { name: 'demo-app', path: 'x' } }, /target\.path: unknown key/);
  rejects({ ...good(), host: { languages: [], buildSystems: [], ci: [], hooks: 'none', os: 'x' } }, /host\.os: unknown key/);
  const withFile = good();
  rejects({ ...withFile, files: [{ path: 'a.md', mode: 'copy', created: true, sha256Before: null, sha256After: HASH, owner: 'x' }] },
    /files\[0\]\.owner: unknown key/);
});

test('record · paths are relative, hashes are hex, instants are ISO-8601', () => {
  const base = good();
  for (const bad of ['/etc/passwd', j('C:', '/x/y'), '../up.md', 'a\\b']) {
    rejects({ ...base, files: [{ path: bad, mode: 'copy', created: true, sha256Before: null, sha256After: HASH }] },
      /files\[0\]\.path|must not be published/);
  }
  rejects({ ...base, files: [{ path: 'a.md', mode: 'copy', created: true, sha256Before: null, sha256After: 'ABC' }] },
    /sha256After must be lower-case hex/);
  rejects({ ...base, files: [{ path: 'a.md', mode: 'fetch', created: true, sha256Before: null, sha256After: HASH }] },
    /mode must be one of copy, generate, reference/);
  rejects({ ...base, installedAt: '2026-10-06' }, /installedAt: must be an ISO-8601 instant/);
  rejects({ ...base, approvals: [{ action: 'x', at: 'yesterday' }] }, /approvals\[0\]\.at/);
  rejects({ ...base, source: { name: 'x', version: '1', revision: 'HEAD' } }, /source\.revision/);
  rejects({ ...base, target: { name: '../other' } }, /target\.name: must be a plain directory basename/);
  rejects({ ...base, integrations: [{ kind: 'network', status: 'applied', detail: '' }] }, /integrations\[0\]\.kind/);
  rejects({ ...base, integrations: [{ kind: 'hooks', status: 'done', detail: '' }] }, /integrations\[0\]\.status/);
});

test('record · nothing secret-shaped and no machine path may be published', () => {
  const base = good();
  // The credential samples are ASSEMBLED, never written out: a test file holding a literal token
  // shape is the finding `tools/gates/secrets.mjs` exists to raise, and the convention of
  // `tools/prompt-builder/sensitive.mjs` is to split them with `j`.
  for (const value of [j('C:', '\\', 'Users', '\\someone\\project'), '/home/someone/project',
    j('/Us', 'ers/someone/x'), '\\\\server\\share', j('file:///c', ':', '/x'),
    j('api', '_key = sk-01234567890abcdef'),
    j('-----', 'BEGIN ', 'RSA ', 'PRIVATE KEY', '-----'), j('AKIA', 'IOSFODNN7EXAMPLE'),
    j('ghp', '_0123456789abcdefghijklmnopqrstuvwx'), j('xoxb', '-0123456789-abcdefghij'),
    j('someone', '@', 'example.com'), 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqaw==']) {
    assert.notEqual(stringFinding(value), null, `${value.slice(0, 24)} must be a finding`);
    rejects({ ...base, limitations: [value] }, /must not be published/);
  }
  // A whole digest is exempt, and nothing else is. VERIFIED by a real install: the first
  // `new --confirm` run refused its own commit id until this exemption existed.
  assert.equal(stringFinding(HASH), null);
  assert.equal(stringFinding(COMMIT), null);
  assert.notEqual(stringFinding(`${COMMIT}${COMMIT}`), null);
  // Keys are text somebody chose too.
  assert.deepEqual(publicationFindings({ '/home/someone': 1 }).map((f) => f.path), ['/home/someone']);
  assert.deepEqual(publicationFindings({ a: ['ok', j('C:', '/x')] }).map((f) => f.path), ['a[1]']);
  assert.deepEqual(publicationFindings({ a: 'relative/path.md', b: 2, c: null }), []);
});

test('record · approval ids are a closed list, parsed once, and a typo refuses', () => {
  assert.deepEqual([...APPROVAL_NAMES],
    ['agents-block', 'gitignore-block', 'hooks', 'first-cell', 'ci-workflow', 'baseline-checks']);
  assert.deepEqual([...parseApprovals('first-cell,hooks')], ['first-cell', 'hooks']);
  assert.deepEqual([...parseApprovals(undefined)], []);
  assert.deepEqual([...parseApprovals(' first-cell , ')], ['first-cell']);
  assert.throws(() => parseApprovals('firstcell'), (/** @type {{ code?: string, exitCode?: number }} */ e) => {
    assert.equal(e.code, 'USAGE');
    assert.equal(e.exitCode, 1);
    return true;
  });
  assert.equal(blockApprovalFor('AGENTS.md'), 'agents-block');
  assert.equal(blockApprovalFor('CLAUDE.md'), 'agents-block');
  assert.equal(blockApprovalFor('.gitignore'), 'gitignore-block');
});

test('record · the built document is deterministic and sorted', () => {
  const twice = [good(), good()];
  assert.equal(JSON.stringify(twice[0]), JSON.stringify(twice[1]));
  const unsorted = buildInstallManifest({
    plan: { profile: 'minimal', components: [{ id: 'method-core' }] },
    results: [
      { path: 'z.md', mode: 'copy', created: true, sha256Before: null, sha256After: HASH },
      { path: 'a.md', mode: 'copy', created: true, sha256Before: null, sha256After: HASH, block: 'method-core' },
    ],
    source: { name: 'x', version: '1', revision: null },
    targetName: 'demo-app',
    approvals: [],
    integrations: [],
    host: { languages: [], buildSystems: [], ci: [], hooks: 'none' },
    componentVersions: {},
    limitations: [],
    now: '2026-10-06T12:00:00.000Z',
  });
  assert.deepEqual(/** @type {Array<{ path: string }>} */ (unsorted.files).map((f) => f.path), ['a.md', 'z.md']);
  assert.equal(/** @type {Array<{ block?: string }>} */ (unsorted.files)[0]?.block, 'method-core');
  assert.equal(/** @type {Array<{ id: string, componentVersion: string }>} */ (unsorted.components)[0]?.componentVersion,
    '0.0.0', 'a component version nobody declared is recorded as 0.0.0, never guessed');
  assert.deepEqual(validateInstallManifest(unsorted), { ok: true, errors: [] });
});
