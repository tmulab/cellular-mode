// Tests for the size and secrets gates (the dependency, boundary and Trilateral
// gates have their own files - 200 lines each is the rule here too).
//
// Every case is an in-memory `[{ path, text }]` fixture. That is the whole reason the
// gates are pure functions over tuples: a gate tested against the real repository can
// only assert "it is green today", which says nothing about whether it would catch a
// violation tomorrow. Here each gate is shown RED on a seeded violation and GREEN on
// clean input - and for the size gate, red on the exact file the old 210-line
// tolerance used to wave through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LIMIT, checkSize, countLines, inScope, limitFor, validateExceptions } from '../tools/gates/size.mjs';
import { checkSecrets, isAllowed, validateAllowlist } from '../tools/gates/secrets.mjs';
import { readPolicy, readTuples } from '../tools/gates/scan.mjs';

/** @typedef {import('../tools/gates/types.mjs').Finding} Finding */

/** @type {(...parts: string[]) => string} */
const j = (...parts) => parts.join('');
/** @type {(n: number, body?: string) => string} */
const lines = (n, body = 'x') => Array.from({ length: n }, () => body).join('\n');
/** @type {(findings: ReadonlyArray<Finding>) => string[]} */
const rules = (findings) => findings.map((f) => f.rule);

// ---------------------------------------------------------------- size ----------
test('size · green when every in-scope file is within the limit', () => {
  const files = [{ path: 'tools/a.mjs', text: lines(200) }, { path: 'docs/b.md', text: lines(1) }];
  assert.deepEqual(checkSize(files, []), []);
});

test('size · RED at 201 lines - the old 210-line tolerance is gone', () => {
  const findings = checkSize([{ path: 'tools/a.mjs', text: lines(201) }], []);
  assert.deepEqual(rules(findings), ['size:over-limit']);
  assert.match(String(findings[0]?.detail), /201 lines > limit 200/);
  // The precise regression: 205 lines used to pass. It must not.
  assert.equal(checkSize([{ path: 'tools/a.mjs', text: lines(205) }], []).length, 1);
});

test('size · a trailing newline is not a line', () => {
  assert.equal(countLines('a\nb\n'), 2);
  assert.equal(countLines('a\nb'), 2);
  assert.equal(countLines(''), 0);
});

test('size · scope: extensions in, LICENSE and vault records out', () => {
  assert.ok(inScope('tools/gates/size.mjs'));
  assert.ok(inScope('docs/00-constitution.md'));
  assert.ok(inScope('eip/sdk/index.ts'));
  assert.equal(inScope('LICENSE'), false, 'extensionless upstream text is out by type');
  assert.equal(inScope('NOTICE'), false);
  assert.equal(inScope('vault/state/log.md'), false, 'append-only record');
  assert.equal(inScope('examples/text-stats/vault/state/INDEX.md'), false, 'generated record');
  assert.equal(inScope('node_modules/x/index.mjs'), false);
});

test('size · an exception raises the limit only for its own path', () => {
  const policy = [{ path: 'docs/long.md', limit: 320, rationale: 'a table', approvedBy: 'someone' }];
  assert.equal(limitFor('docs/long.md', policy), 320);
  assert.equal(limitFor('docs/other.md', policy), DEFAULT_LIMIT);
  assert.deepEqual(checkSize([{ path: 'docs/long.md', text: lines(300) }], policy), []);
  assert.deepEqual(rules(checkSize([{ path: 'docs/other.md', text: lines(300) }], policy)), ['size:over-limit']);
});

test('size · an exception beyond its own approved limit is still a finding', () => {
  const policy = [{ path: 'docs/long.md', limit: 250, rationale: 'a table', approvedBy: 'someone' }];
  assert.deepEqual(rules(checkSize([{ path: 'docs/long.md', text: lines(260) }], policy)), ['size:over-approved-limit']);
});

test('size · RED on an incomplete exception - tolerance can never be silent', () => {
  assert.deepEqual(rules(validateExceptions([{ path: 'a.md', limit: 300 }])), [
    'size:policy-incomplete',
    'size:policy-incomplete',
  ]);
  assert.deepEqual(rules(validateExceptions([{ path: 'a.md', limit: 300, rationale: 'why', approvedBy: '' }])), [
    'size:policy-incomplete',
  ]);
  assert.deepEqual(rules(validateExceptions('not an array')), ['size:policy-shape']);
  assert.deepEqual(validateExceptions([]), []);
});

test('size · the shipped policy file is well formed', () => {
  assert.deepEqual(validateExceptions(readPolicy('size-exceptions.json', [])), []);
});

// -------------------------------------------------------------- secrets ---------
/** @type {Array<[string, string]>} */
const SEEDED = [
  ['private-key-block', `-----${j('BEGIN', ' RSA ', 'PRIVATE KEY')}-----`],
  ['aws-access-key-id', j('AKI', 'A', 'ABCDEFGHIJKLMNOP')],
  ['aws-secret-key', j('aws', '_secret_', 'access_key', ' = ', 'wJalrXUtnFEMIK7MDENGbPxRfiCY')],
  ['github-token', j('g', 'hp', '_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123')],
  ['github-pat', j('github', '_pat_', 'ABCDEFGHIJKLMNOPQRSTUV0123456789')],
  ['model-api-key', j('s', 'k', '-', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')],
  ['slack-token', j('x', 'o', 'x', 'b', '-', '1234567890-ABCDEF')],
  ['generic-credential-assignment', j('const ', 'pass', 'word', ' = ', "'", 'hunter2hunter2', "'")],
];

/** One seeded credential-shaped snippet, by index. @type {(at: number) => string} */
const seeded = (at) => {
  const entry = SEEDED[at];
  assert.ok(entry, `no seeded snippet at ${at}`);
  return entry[1];
};

for (const [rule, snippet] of SEEDED) {
  test(`secrets · RED on a seeded ${rule}`, () => {
    const findings = checkSecrets([{ path: 'src/config.mjs', text: `const a = 1;\n${snippet}\n` }], []);
    assert.deepEqual(rules(findings), [`secrets:${rule}`], `expected ${rule}, got ${rules(findings).join()}`);
    assert.equal(findings[0]?.line, 2, 'the finding must carry an address, not a hint');
  });
}

test('secrets · green on clean text', () => {
  const clean = 'import { readFileSync } from "node:fs";\nexport const limit = 200;\n';
  assert.deepEqual(checkSecrets([{ path: 'src/a.mjs', text: clean }], []), []);
});

test('secrets · the gate does not flag its own rule book', () => {
  const own = readTuples(undefined, (rel) => rel === 'tools/gates/secrets.mjs');
  assert.equal(own.length, 1);
  assert.deepEqual(checkSecrets(own, []), [], 'detectors are fragment-assembled, so no literal match exists');
});

test('secrets · an allowlist entry silences only its own path and rule', () => {
  const text = `${seeded(5)}\n`;
  const entry = { path: 'fixtures/sample.mjs', rule: 'model-api-key', rationale: 'documented sample', approvedBy: 'someone' };
  assert.deepEqual(checkSecrets([{ path: 'fixtures/sample.mjs', text }], [entry]), []);
  assert.equal(checkSecrets([{ path: 'src/real.mjs', text }], [entry]).length, 1, 'other paths stay covered');
  assert.equal(isAllowed('fixtures/sample.mjs', 'github-token', [entry]), false, 'other rules stay covered');
  assert.ok(isAllowed('fixtures/sample.mjs', 'model-api-key', [{ ...entry, rule: '*' }]));
  assert.ok(isAllowed('fixtures/deep/x.mjs', 'model-api-key', [{ ...entry, path: 'fixtures/', rule: '*' }]));
});

test('secrets · RED on an allowlist entry without a rationale, and it is not honoured', () => {
  const entry = { path: 'src/a.mjs', rule: '*', approvedBy: 'someone' };
  assert.deepEqual(rules(validateAllowlist([entry])), ['secrets:policy-incomplete']);
  assert.equal(isAllowed('src/a.mjs', 'model-api-key', [entry]), false);
  const findings = checkSecrets([{ path: 'src/a.mjs', text: `${seeded(5)}\n` }], [entry]);
  assert.deepEqual(rules(findings), ['secrets:policy-incomplete', 'secrets:model-api-key']);
});

test('secrets · the shipped allowlist is well formed', () => {
  assert.deepEqual(validateAllowlist(readPolicy('secrets-allowlist.json', [])), []);
});
