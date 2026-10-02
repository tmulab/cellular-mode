// Hygiene: no personal data, no machine-local paths, no private project names and no
// secrets anywhere in the repository.
//
// Every needle is assembled at runtime from fragments so that THIS FILE never contains
// a literal copy of a forbidden string and therefore never flags itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, allFiles, isTextFile, read, report } from './helpers.mjs';
import { checkSecrets } from '../tools/gates/secrets.mjs';
import { readPolicy } from '../tools/gates/scan.mjs';

/** @type {(...parts: string[]) => string} */
const j = (...parts) => parts.join('');

// --- Forbidden literals -----------------------------------------------------------
// `sensitive: true` means the match is case-SENSITIVE. The only such needle is the
// developer's OS account name: its lower-case form is a machine path leak, while the
// capitalised personal name "H" + "udson" is the author's legitimate attribution in
// LICENSE/NOTICE/README and must stay.
const LITERALS = [
  { needle: j('hud', 'so'), sensitive: true, why: 'OS account name / home-directory leak' },
  { needle: j('C:', '\\', 'Users'), why: 'Windows absolute home path' },
  { needle: j('/', 'Users', '/'), why: 'macOS absolute home path' },
  { needle: j('Al', 'ine'), why: 'private person name' },
  { needle: j('neuro', 'diverg'), why: 'health-condition framing (removed from the method)' },
  { needle: j('PhD', 'Nucleus'), why: 'private project name' },
  { needle: j('ed', 'tech'), why: 'private project name' },
  { needle: j('Bibli', 'otec'), why: 'private project name' },
  { needle: j('cli', 'nica'), why: 'private project name / patient data' },
  { needle: j('Lance', 'DB'), why: 'private stack detail — use "production database"' },
  { needle: j('My', 'SQL'), why: 'private stack detail — use "production database"' },
  { needle: j('_METODO', '_CELULAR'), why: 'absolute path of the original private source' },
];

// --- Forbidden patterns ----------------------------------------------------------
// Privacy shapes only. The credential shapes that used to live here (private key
// blocks, provider API keys, forge tokens) moved to tools/gates/secrets.mjs, which
// this file now calls instead of keeping a second copy: two lists of the same thing
// drift, and the one that drifts is always the one nobody runs.
// One exception, as narrow as it can be: the public security ROLE address (not a person),
// approved by the author on 2026-10-02, allowed in SECURITY.md only. Any other address,
// or this one in any other file, is still an offence.
const ROLE_ADDRESS = j('security', '@', 'tmulab.org');
/** @type {{ re: RegExp, why: string, allow?: { file: string, match: string } }[]} */
const PATTERNS = [
  { re: new RegExp(j('\\b', 'n', 'll', '\\b'), 'gi'), why: 'private project code name' },
  {
    re: new RegExp(j('[A-Za-z0-9._%+-]+', '@', '[A-Za-z0-9.-]+', '\\.', '[A-Za-z]{2,}'), 'g'),
    why: 'e-mail address (the repository must contain none but the approved role address)',
    allow: { file: 'SECURITY.md', match: ROLE_ADDRESS },
  },
];

/** @type {(rel: string, text: string) => string[]} */
function patternOffenders(rel, text) {
  /** @type {string[]} */
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const { re, why, allow } of PATTERNS) {
      for (const m of line.matchAll(re)) {
        const allowed = allow && rel === allow.file && m[0].toLowerCase() === allow.match;
        if (!allowed) out.push(`${rel}:${i + 1}: ${why}`);
      }
    }
  });
  return out;
}

const files = allFiles().filter(isTextFile);

test('leaks · the repository is scanned at all', () => {
  assert.ok(files.length > 40, `expected a populated repository, found ${files.length} files in ${ROOT}`);
  assert.ok(files.includes('AGENTS.md'), 'AGENTS.md must be part of the scan');
  assert.ok(files.includes('tests/leaks.test.mjs'), 'this test file must scan itself too');
});

test('leaks · no forbidden literal appears in any file', () => {
  const offenders = [];
  for (const rel of files) {
    const text = read(rel);
    const haystack = text.toLowerCase();
    for (const { needle, sensitive, why } of LITERALS) {
      const found = sensitive ? text.includes(needle) : haystack.includes(needle.toLowerCase());
      if (found) offenders.push(`${rel}: forbidden literal [${why}]`);
    }
  }
  assert.deepEqual(offenders, [], report('forbidden literals', offenders));
});

test('leaks · no forbidden pattern appears in any file', () => {
  /** @type {string[]} */
  const offenders = files.flatMap((rel) => patternOffenders(rel, read(rel)));
  assert.deepEqual(offenders, [], report('forbidden patterns', offenders));
});

test('leaks · the role-address exception is exactly one address in exactly one file', () => {
  const other = j('jane', '@', 'tmulab.org');
  assert.deepEqual(patternOffenders('SECURITY.md', `write to ${ROLE_ADDRESS}`), []);
  assert.equal(patternOffenders('README.md', `write to ${ROLE_ADDRESS}`).length, 1);
  assert.equal(patternOffenders('SECURITY.md', `write to ${other}`).length, 1);
  assert.equal(patternOffenders('SECURITY.md', `${ROLE_ADDRESS} or ${other}`).length, 1);
});

test('leaks · no credential shape appears anywhere (delegated to the secrets gate)', () => {
  const tuples = files.map((path) => ({ path, text: read(path) }));
  const findings = checkSecrets(tuples, readPolicy('secrets-allowlist.json', []));
  assert.deepEqual(findings, [], report('secret findings', findings.map((f) => `${f.rule} ${f.detail ?? f.path}`)));
});

test('leaks · no absolute filesystem path is baked into any source or doc', () => {
  // Drive-letter paths of any user, not just this machine's.
  const drive = new RegExp(j('\\b', '[A-Za-z]', ':', '[\\\\/]', '[A-Za-z0-9_.-]'));
  /** @type {string[]} */
  const offenders = [];
  for (const rel of files) {
    read(rel)
      .split('\n')
      .forEach((line, i) => {
        if (drive.test(line)) offenders.push(`${rel}:${i + 1}`);
      });
  }
  assert.deepEqual(offenders, [], report('absolute paths', offenders));
});
