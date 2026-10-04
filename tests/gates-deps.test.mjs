// Tests for the dependency-integrity gate and for scan.mjs, the single disk layer.
//
// Fixtures are in-memory tuples; the two cases that genuinely need a filesystem use a
// temporary directory and remove it again. Each rule is shown RED on a seeded
// violation and GREEN on clean input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkDeps, checkImports, checkManifest, importSpecifiers, readAllowed, stripComments } from '../tools/gates/deps.mjs';
import { ROOT, listFiles, readPolicy, readTuples } from '../tools/gates/scan.mjs';

/** @type {(rel: string) => string} */
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** @typedef {import('../tools/gates/types.mjs').Finding} Finding */
/** @type {(findings: ReadonlyArray<Finding>) => string[]} */
const rules = (findings) => findings.map((f) => f.rule);

// ----------------------------------------------------------------- deps ---------
test('deps · green on the real manifest: zero dependencies, zero bare specifiers', () => {
  const findings = checkDeps({
    pkg: { name: 'x', scripts: { test: 'node --test' } },
    files: [{ path: 'a.mjs', text: 'import { x } from "./b.mjs";\nimport fs from "node:fs";\n' }],
    policy: { allowed: [] },
  });
  assert.deepEqual(findings, []);
});

test('deps · RED on a declared dependency that no policy entry justifies', () => {
  const findings = checkManifest({ dependencies: { 'left-pad': '^1.0.0' }, devDependencies: { vitest: '^1' } }, new Set());
  assert.deepEqual(rules(findings), ['deps:undeclared-dependency', 'deps:undeclared-dependency']);
  assert.match(String(findings[0]?.detail), /dependencies\.left-pad/);
  assert.match(String(findings[1]?.detail), /devDependencies\.vitest/);
});

test('deps · RED on a bare import specifier, including an unprefixed built-in', () => {
  const files = [
    { path: 'a.mjs', text: 'import express from "express";\n' },
    { path: 'b.mjs', text: 'import { join } from "path";\n' },
    { path: 'c.mjs', text: 'import x from "@scope/pkg/sub.js";\n' },
  ];
  const findings = checkImports(files, new Set());
  assert.deepEqual(findings.map((f) => f.path), ['a.mjs', 'b.mjs', 'c.mjs']);
  assert.deepEqual(rules(findings), ['deps:bare-specifier', 'deps:bare-specifier', 'deps:bare-specifier']);
});

test('deps · an allowed name permits both the manifest entry and the import', () => {
  const policy = { allowed: [{ name: 'express', rationale: 'HTTP server', approvedBy: 'someone' }] };
  const { names, findings } = readAllowed(policy);
  assert.deepEqual(findings, []);
  assert.deepEqual(checkManifest({ dependencies: { express: '^4' } }, names), []);
  assert.deepEqual(checkImports([{ path: 'a.mjs', text: 'import e from "express/lib/x.js";\n' }], names), []);
});

test('deps · RED on an allowed-dependency entry with no rationale', () => {
  const { names, findings } = readAllowed({ allowed: [{ name: 'express' }] });
  assert.deepEqual(rules(findings), ['deps:policy-incomplete', 'deps:policy-incomplete']);
  assert.ok(names.has('express'), 'the name is still read, so the finding is about the missing reason');
  assert.deepEqual(rules(readAllowed(42).findings), ['deps:policy-shape']);
});

test('deps · specifiers are found in every import form, and never inside a comment', () => {
  const text = [
    'import a from "./a.mjs";',
    'import "./side.mjs";',
    'export { b } from "./b.mjs";',
    'const c = await import("./c.mjs");',
    'import {',
    '  d,',
    '} from "./d.mjs";',
    '// import ignored from "left-pad";',
    '/* import("also-ignored") */',
  ].join('\n');
  assert.deepEqual(importSpecifiers(text).sort(), ['./a.mjs', './b.mjs', './c.mjs', './d.mjs', './side.mjs']);
  assert.equal(stripComments('const a = 1; // import x from "y"').includes('left-pad'), false);
});

test('deps · the two devDependencies are pinned exactly, and a lockfile pins them', () => {
  const present = listFiles().filter((rel) => /^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(rel));
  assert.deepEqual(present, ['package-lock.json'], 'something is installed, so it must be pinned');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined, 'zero RUNTIME dependencies is the claim');
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@types/node', 'typescript']);
  for (const [name, range] of Object.entries(pkg.devDependencies)) {
    assert.match(String(range), /^\d+\.\d+\.\d+$/, `${name} must be pinned exactly, not a range`);
  }
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual(
    Object.keys(lock.packages).filter((k) => k !== '').sort(),
    ['node_modules/@types/node', 'node_modules/typescript', 'node_modules/undici-types'],
    'the installed tree is the two approved names plus the one transitive dependency',
  );
});

test('deps · the allowlist names exactly the two devDependencies, and nothing else', () => {
  const policy = readPolicy('allowed-dependencies.json', { allowed: [] });
  const { names, findings } = readAllowed(policy);
  assert.deepEqual(findings, [], 'every entry needs a name, a rationale and an approver');
  assert.deepEqual([...names].sort(), ['@types/node', 'typescript']);
  // Still a wall for everything else: the gate is not merely longer, it is still closed.
  assert.deepEqual(rules(checkManifest({ dependencies: { express: '^4' } }, names)), ['deps:undeclared-dependency']);
  assert.deepEqual(rules(checkImports([{ path: 'a.mjs', text: 'import x from "left-pad";\n' }], names)), ['deps:bare-specifier']);
  // And the two approved names are not importable at RUNTIME anywhere: they are
  // devDependencies, so a source file importing one would be a real defect.
  const code = readTuples(undefined, (rel) => /\.(mjs|js)$/.test(rel) && !rel.startsWith('node_modules/'));
  const importers = code.filter((f) => importSpecifiers(f.text).some((s) => names.has(s)));
  assert.deepEqual(importers.map((f) => f.path), [], 'a type checker is never imported, only run');
});

test('deps · the real repository passes the gate it ships', () => {
  const manifest = readTuples(undefined, (r) => r === 'package.json')[0];
  assert.ok(manifest, 'package.json must be readable');
  const pkg = JSON.parse(manifest.text);
  const code = readTuples(undefined, (rel) => /\.(mjs|js)$/.test(rel));
  const findings = checkDeps({ pkg, files: code, policy: readPolicy('allowed-dependencies.json', { allowed: [] }) });
  assert.deepEqual(findings, [], findings.map((f) => `${f.rule} ${f.path}: ${f.detail}`).join('\n'));
  // The exact script set, so a shortcut cannot be smuggled in beside the gates: no
  // `prepare`, no `postinstall`, no `--no-verify` wrapper, nothing that runs on install.
  // `typecheck` runs BOTH configurations — the repository's and the browser one in
  // apps/observer — because a second config that nobody runs is a second config that rots.
  assert.deepEqual(pkg.scripts, {
    test: 'node --test',
    typecheck: 'tsc -p jsconfig.json && tsc -p apps/observer/jsconfig.json',
    gates: 'node tools/gates/check-all.mjs',
    trilateral: 'node tools/gates/trilateral.mjs',
    // Article 8 (final verification): the suite that may authorize a completion, the
    // question "is THIS state authorized?", and the two commands that install or remove
    // the git hooks which ask it. `hooks:install` writes ONE local git config key and
    // nothing else — a hook installer that also ran something would be a postinstall in
    // disguise, which the loop below refuses.
    'verify:final': 'node tools/gates/verify-final.mjs',
    authorized: 'node tools/gates/authorization.mjs status',
    'hooks:install': 'git config core.hooksPath .githooks',
    'hooks:uninstall': 'git config --unset core.hooksPath',
    // Out of `npm test` on purpose: it copies the repository and runs the whole suite there,
    // which is minutes. `tests/optional-module-imports.test.mjs` is the fast half of AD29.
    'rehearse:adaptive-removal': 'node tools/gates/removal-rehearsal.mjs',
    // The polyglot conformance replay. It is a script rather than a test-only entry point
    // because an operator adding an implementation in a sixth language needs to run it
    // directly, and because it is the command the interop record in
    // docs/upp/CONFORMANCE.md cites for every row.
    'upp:conformance': 'node eip/upp-host/conformance-cli.mjs',
  });
  for (const command of Object.values(pkg.scripts)) {
    assert.doesNotMatch(String(command), /--no-verify|npx |curl |\|\||;/, `suspicious script: ${command}`);
  }
});

// ------------------------------------------------- scan: the one disk layer -----
test('scan · a missing policy file is the healthy case; a corrupt one fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gates-scan-'));
  try {
    mkdirSync(join(dir, 'policy'));
    assert.deepEqual(readPolicy('absent.json', ['fallback'], dir), ['fallback']);
    writeFileSync(join(dir, 'policy', 'broken.json'), '{ not json');
    assert.throws(() => readPolicy('broken.json', [], dir), /not valid JSON/);
    const nested = join(dir, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'c.mjs'), 'export const x = 1;\n');
    assert.deepEqual(readTuples(dir, (r) => r.endsWith('.mjs')).map((f) => f.path), ['a/b/c.mjs']);
    assert.equal(dirname('a/b/c.mjs'), 'a/b');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
