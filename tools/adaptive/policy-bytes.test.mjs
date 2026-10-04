// CANONICAL POLICY BYTES — a line ending is a property of a CHECKOUT, not of a policy.
//
// The same `adaptive/policies/*.md` arrives with CRLF on one machine and LF on another and
// says exactly the same thing. The injected block, however, is measured in BYTES and
// asserted against numbers recorded in README.md — so an unnormalised CR made the
// documented size wrong on Linux and right on Windows, which is how CI run 37188606487
// failed a test that was green here (`.gitattributes` commits these files as LF; the local
// working copies had drifted to CRLF).
//
// The loader therefore maps CRLF to LF and NOTHING else: no trimming, no reflowing, no
// reordering, no rewording. A lone CR is left alone, because it is not a line ending in any
// checkout git produces — only a deliberate byte inside a policy would be one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { contextBlock, policyPathsFor } from './context.mjs';
import { POLICY_REL, readPolicyTexts } from './io.mjs';

const KEY = `${POLICY_REL}/demo.md`;
/** Content with every byte a normaliser must NOT touch: a tab, a trailing space, a blank
 * line, and a lone CR in the middle of a line. */
const POLICY_LF = '# Mode: demo\n\nOne line.\n- a bullet\twith a tab\nand trailing space \n';

/** @returns {string} */
const makeRoot = () => mkdtempSync(join(tmpdir(), 'cellular-policy-'));

/** Writes one policy file and reads it back through the loader.
 * @param {string} root @param {string} text @returns {string} */
function policyText(root, text) {
  mkdirSync(join(root, 'adaptive', 'policies'), { recursive: true });
  writeFileSync(join(root, 'adaptive', 'policies', 'demo.md'), text, 'utf8');
  const read = readPolicyTexts(root, [KEY]);
  assert.deepEqual(read.missing, [], 'the fixture policy must be readable');
  return String(read.texts[KEY]);
}

test('a policy read from a CRLF checkout is byte-identical to the same policy read from LF', () => {
  const root = makeRoot();
  try {
    const lf = policyText(root, POLICY_LF);
    const crlf = policyText(root, POLICY_LF.split('\n').join('\r\n'));
    assert.equal(crlf, lf, 'the line endings of a checkout are not policy content');
    assert.equal(lf, POLICY_LF, 'and the LF form is returned unchanged');
    assert.equal(crlf.includes('\r'), false);
    assert.ok(lf.includes('\twith a tab'), 'a tab is content');
    assert.ok(lf.includes('space \n'), 'a trailing space is content');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('only CRLF is normalised: a lone CR survives, and nothing is trimmed or reflowed', () => {
  const root = makeRoot();
  try {
    assert.equal(policyText(root, '# Mode: demo\nmac\rclassic\n'), '# Mode: demo\nmac\rclassic\n');
    assert.equal(policyText(root, '# Mode: demo\r\n\r\n'), '# Mode: demo\n\n', 'no trailing trim');
    assert.equal(policyText(root, '  indented\r\n'), '  indented\n', 'no leading trim');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the context block built from either checkout is the same block and the same size', () => {
  const root = makeRoot();
  try {
    /** @type {import('./types.mjs').EffectiveMode} */
    const effective = /** @type {never} */ ({
      enabled: true, standing: 'active', mode: 'tired', source: 'cli',
      activatedAt: '2026-10-03T14:02:00.000Z', expiresAt: '2026-10-03T18:02:00.000Z',
    });
    const paths = policyPathsFor(effective);
    assert.equal(paths.length, 2, 'an active mode injects the boundaries and its own policy');
    /** @type {(text: string) => string} */
    const block = (text) => {
      mkdirSync(join(root, 'adaptive', 'policies'), { recursive: true });
      for (const path of paths) writeFileSync(join(root, path), text, 'utf8');
      const read = readPolicyTexts(root, paths);
      assert.deepEqual(read.missing, []);
      return contextBlock(effective, read.texts);
    };
    const lf = block(POLICY_LF);
    const crlf = block(POLICY_LF.split('\n').join('\r\n'));
    assert.equal(crlf, lf);
    assert.equal(Buffer.byteLength(crlf, 'utf8'), Buffer.byteLength(lf, 'utf8'),
      'the documented byte budget must not depend on who checked the repository out');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('every policy file of THIS repository is already canonical on disk', () => {
  const root = join(import.meta.dirname, '..', '..');
  const read = readPolicyTexts(root, ['boundaries', 'tired', 'focus', 'explore']
    .map((name) => `${POLICY_REL}/${name}.md`));
  assert.deepEqual(read.missing, []);
  for (const [path, text] of Object.entries(read.texts)) {
    assert.equal(text.includes('\r'), false, `${path} still carries a CR after normalisation`);
  }
});
