// Hygiene: the licensing story is exact and self-consistent.
// LICENSE is the pristine, unmodified Apache-2.0 text (so a scanner can identify it by
// hash); authorship and copyright live in NOTICE and README; nothing third-party is
// bundled, and what influenced the method is credited in THIRD_PARTY_NOTICES.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, allDirs, allFiles, exists, read, report } from './helpers.mjs';

// sha256 of the canonical, unaltered Apache License 2.0 as published by the ASF.
const APACHE_2_0_SHA256 = 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30';

test('license · LICENSE is the canonical Apache-2.0 text, byte for byte', () => {
  const digest = createHash('sha256').update(readFileSync(join(ROOT, 'LICENSE'))).digest('hex');
  assert.equal(
    digest,
    APACHE_2_0_SHA256,
    'LICENSE must stay the unmodified upstream text; put the copyright line in NOTICE instead',
  );
});

test('license · package.json declares Apache-2.0', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.license, 'Apache-2.0');
});

test('license · README and NOTICE agree on license, author and origin', () => {
  for (const file of ['README.md', 'NOTICE']) {
    const text = read(file);
    assert.match(text, /Apache License 2\.0/, `${file} must name "Apache License 2.0"`);
    // Either the short form used in prose or the full legal name used in the copyright
    // line of NOTICE. Both name the same author; neither is preferred by the test.
    assert.match(
      text,
      /Hudson (A\. R\.|Augusto Rodrigues) Bonomo/,
      `${file} must credit the author`,
    );
    assert.match(text, /TMU-LAB/, `${file} must credit TMU-LAB as the origin`);
  }
});

test('license · THIRD_PARTY_NOTICES.md exists and is substantive', () => {
  assert.ok(exists('THIRD_PARTY_NOTICES.md'), 'THIRD_PARTY_NOTICES.md must exist');
  const text = read('THIRD_PARTY_NOTICES.md');
  assert.ok(text.length > 300, 'THIRD_PARTY_NOTICES.md must actually list the attributions');
  assert.match(text, /Parnas/, 'the Parnas citation must be credited');
});

// The rule used to be "nothing third-party is bundled". It is now narrowed, out loud,
// to "nothing third-party is bundled EXCEPT the hash-pinned three.js directory", because
// apps/observer vendors three@0.180.0 to render the cell graph with no network at all
// (ADR 0003, apps/observer/vendor/VENDOR.md). A narrowed rule with a pin is honest; a rule
// that stays broad while being false is not.
const VENDOR_DIR = 'apps/observer/vendor/three@0.180.0';

/** The upstream artefacts and their published SHA-256, from VENDOR.md.
 * @type {ReadonlyArray<readonly [string, string]>} */
const PINNED = [
  ['three.module.min.js', 'e2b5ee6bccd38fd6d8a2428546b83c5f2426d84b152ef82be8055556e3b40eb6'],
  ['three.core.min.js', '61ba0df005b05991361d040d8ff670e1aadfd0ce7aeebd1fdb0725957a8957de'],
];

test('license · the only vendored code is the hash-pinned three.js directory', () => {
  const dirs = allDirs().filter((rel) => /(^|\/)(vendor|vendors|third[-_]party|lib\/vendor)$/i.test(rel));
  assert.deepEqual(dirs, ['apps/observer/vendor'], report('vendored directories', dirs));
  const minified = allFiles().filter((rel) => /\.min\.(js|mjs|cjs|css)$/i.test(rel));
  assert.deepEqual(
    minified.map((rel) => rel.replace(`${VENDOR_DIR}/`, '')),
    ['three.core.min.js', 'three.module.min.js'],
    report('minified bundles outside the pinned directory', minified),
  );
  const offenders = allFiles()
    .filter((rel) => /(^|\/)(three|jquery|lodash)(\.|-)/i.test(rel))
    .filter((rel) => !rel.startsWith(`${VENDOR_DIR}/`));
  assert.deepEqual(offenders, [], report('bundled libraries', offenders));
});

test('license · the vendored directory holds exactly the declared files', () => {
  const present = allFiles()
    .filter((rel) => rel.startsWith('apps/observer/vendor/'))
    .map((rel) => rel.replace('apps/observer/vendor/', ''))
    .sort();
  assert.deepEqual(present, [
    'VENDOR.md',
    'three@0.180.0/LICENSE',
    'three@0.180.0/three.core.min.js',
    'three@0.180.0/three.module.min.d.ts',
    'three@0.180.0/three.module.min.js',
  ], report('files under apps/observer/vendor', present));
});

test('license · both vendored three.js builds match the published SHA-256', () => {
  for (const [name, expected] of PINNED) {
    const digest = createHash('sha256')
      .update(readFileSync(join(ROOT, VENDOR_DIR, name)))
      .digest('hex');
    assert.equal(digest, expected, `${name} is not the byte-for-byte npm artefact any more`);
  }
  // The hashes in the prose and the hashes in this test cannot drift apart.
  const vendorNotes = read('apps/observer/vendor/VENDOR.md');
  for (const [name, expected] of PINNED) {
    assert.ok(vendorNotes.includes(expected), `VENDOR.md must publish the hash of ${name}`);
  }
});

test('license · the vendored MIT licence travels with the code', () => {
  const text = read(`${VENDOR_DIR}/LICENSE`);
  assert.match(text, /The MIT License/, 'the upstream MIT text must be kept beside the build');
  assert.match(read('THIRD_PARTY_NOTICES.md'), /three\.js/, 'the notices must name three.js');
});

test('license · no runtime dependency was introduced', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined, 'the method ships with zero RUNTIME dependencies');
  assert.equal(pkg.peerDependencies, undefined);
  assert.equal(pkg.optionalDependencies, undefined);
  // Two development dependencies exist, both for verification, and the claim is
  // narrowed out loud rather than quietly becoming false: R-1 in
  // policy/relaxations.md, policy/allowed-dependencies.json, THIRD_PARTY_NOTICES.md.
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@types/node', 'typescript']);
});

test('license · every installed package is named with its licence in the notices', () => {
  const notices = read('THIRD_PARTY_NOTICES.md');
  /** @type {Array<[string, string]>} */
  const installed = [['typescript', 'Apache-2.0'], ['@types/node', 'MIT'], ['undici-types', 'MIT']];
  for (const [name, licence] of installed) {
    assert.ok(notices.includes(name), `${name} must be listed in THIRD_PARTY_NOTICES.md`);
    assert.ok(notices.includes(licence), `${name}'s licence (${licence}) must be stated`);
  }
  // The tree is exactly those three: the notices cannot silently fall behind it.
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual(
    Object.keys(lock.packages).filter((k) => k !== '').map((k) => k.replace('node_modules/', '')).sort(),
    ['@types/node', 'typescript', 'undici-types'],
  );
});
