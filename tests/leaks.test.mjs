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
const PATTERNS = [
  { re: new RegExp(j('\\b', 'n', 'll', '\\b'), 'i'), why: 'private project code name' },
  {
    re: new RegExp(j('[A-Za-z0-9._%+-]+', '@', '[A-Za-z0-9.-]+', '\\.', '[A-Za-z]{2,}')),
    why: 'e-mail address (the repository must contain none)',
  },
];

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
  const offenders = [];
  for (const rel of files) {
    const lines = read(rel).split('\n');
    for (const { re, why } of PATTERNS) {
      lines.forEach((line, i) => {
        if (re.test(line)) offenders.push(`${rel}:${i + 1}: ${why}`);
      });
    }
  }
  assert.deepEqual(offenders, [], report('forbidden patterns', offenders));
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
