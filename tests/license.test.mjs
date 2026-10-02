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

test('license · no third-party code is vendored into the repository', () => {
  const dirs = allDirs().filter((rel) => /(^|\/)(vendor|vendors|third[-_]party|lib\/vendor)$/i.test(rel));
  assert.deepEqual(dirs, [], report('vendored directories', dirs));
  const minified = allFiles().filter((rel) => /\.min\.(js|mjs|cjs|css)$/i.test(rel));
  assert.deepEqual(minified, [], report('minified bundles', minified));
  const offenders = allFiles().filter((rel) => /(^|\/)(three|jquery|lodash)(\.|-)/i.test(rel));
  assert.deepEqual(offenders, [], report('bundled libraries', offenders));
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
