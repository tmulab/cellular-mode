// Read-only inspection: what a repository proves, and how little of its text is ever echoed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ECHO_LIMIT, inspectProject } from './inspect.mjs';
import { findPersonalPaths, findSensitive } from './sensitive.mjs';
import { existingRepo, injectionRepo, missingOptional, pausedProject } from './fixtures/index.mjs';

/** @param {ReadonlyArray<import('./types.mjs').Finding>} findings @param {string} field */
const valuesFor = (findings, field) => findings.filter((f) => f.field === field).map((f) => f.entry.value);

test('inspect · every finding is VERIFIED and carries a relative evidence path', () => {
  for (const fixture of [existingRepo, missingOptional, pausedProject, injectionRepo]) {
    const { findings } = inspectProject(fixture.files);
    assert.ok(findings.length > 0, `${fixture.id}: nothing found`);
    for (const { field, entry } of findings) {
      assert.equal(entry.status, 'VERIFIED', `${fixture.id} · ${field}`);
      const basis = String(entry.basis ?? '');
      assert.notEqual(basis, '', `${fixture.id} · ${field}: no basis`);
      assert.equal(basis.startsWith('/'), false, `${fixture.id} · ${field}: basis is absolute`);
      assert.deepEqual(findPersonalPaths(basis), [], `${fixture.id} · ${field}: machine path in basis`);
      assert.deepEqual(findSensitive(entry.value), [], `${fixture.id} · ${field}: credential shape in value`);
    }
  }
});

test('inspect · a Node repository yields its name, its manifest, its languages and its tests', () => {
  const { findings, summary } = inspectProject(existingRepo.files);
  assert.deepEqual(findings.filter((f) => f.field === 'identity.name').map((f) => f.entry), [
    { value: 'invoice-tidy', status: 'VERIFIED', basis: 'package.json' },
  ]);
  const technologies = valuesFor(findings, 'technologies.approved');
  assert.ok(technologies.includes('Node.js (package.json)'));
  assert.ok(technologies.includes('JavaScript (4 file(s))'), technologies.join(' | '));
  assert.ok(technologies.includes('TypeScript (1 file(s))'));
  assert.deepEqual(valuesFor(findings, 'requirements.nonfunctional'), ['Existing automated tests in tests']);
  assert.deepEqual(valuesFor(findings, 'integrations'), ['Existing agent instructions: AGENTS.md']);
  assert.deepEqual(summary, {
    hasCellularState: false,
    manifests: ['package.json'],
    languages: ['JavaScript (4 file(s))', 'Shell (1 file(s))', 'TypeScript (1 file(s))'],
    instructionFiles: ['AGENTS.md'],
  });
});

test('inspect · an existing vault is reported in the summary, never as a contract field', () => {
  const { findings, summary } = inspectProject(pausedProject.files);
  assert.equal(summary.hasCellularState, true);
  assert.equal(findings.some((f) => f.entry.value.includes('vault/state')), false);
  assert.equal(inspectProject(existingRepo.files).summary.hasCellularState, false);
});

test('inspect · a project with no optional module of the method still inspects', () => {
  const { findings, summary } = inspectProject(missingOptional.files);
  assert.deepEqual(summary.manifests, ['pyproject.toml']);
  assert.deepEqual(summary.instructionFiles, []);
  assert.ok(valuesFor(findings, 'technologies.approved').includes('Python (pyproject.toml)'));
  assert.deepEqual(valuesFor(findings, 'requirements.nonfunctional'), ['Existing automated tests in spec']);
  // Only package.json's `name` is parsed: reading a name out of a TOML file would mean
  // parsing arbitrary repository text, which this module refuses to do.
  assert.deepEqual(valuesFor(findings, 'identity.name'), []);
  assert.deepEqual(summary.languages, ['Python (4 file(s))']);
});

test('inspect · repository text is data: nothing longer than the echo limit is ever recorded', () => {
  const { findings, summary } = inspectProject(injectionRepo.files);
  const names = valuesFor(findings, 'identity.name');
  assert.equal(names.length, 1);
  const name = String(names[0]);
  assert.ok(name.length <= ECHO_LIMIT, `echoed ${name.length} characters`);
  assert.ok(name.endsWith('…'), 'a cut echo must say that it was cut');
  assert.equal(name.includes('\n'), false);
  assert.ok(valuesFor(findings, 'technologies.approved').includes('Go (go.mod)'));
  assert.deepEqual(summary.manifests, ['package.json', 'go.mod']);
});

test('inspect · node_modules and generated directories prove nothing', () => {
  const { findings, summary } = inspectProject([
    { path: 'node_modules/left-pad/package.json', text: '{"name":"left-pad"}' },
    { path: 'node_modules/left-pad/index.js' },
    { path: 'dist/bundle.js' },
    { path: 'build/out.js' },
    { path: 'main.py' },
  ]);
  assert.deepEqual(summary.manifests, []);
  assert.deepEqual(valuesFor(findings, 'identity.name'), []);
  assert.deepEqual(summary.languages, ['Python (1 file(s))']);
});

test('inspect · an empty repository yields nothing at all, and says so', () => {
  assert.deepEqual(inspectProject([]), {
    findings: [],
    summary: { hasCellularState: false, manifests: [], languages: [], instructionFiles: [] },
  });
});

test('inspect · a package.json that is not JSON, or has no name, yields no name', () => {
  for (const text of ['not json at all', '[]', '{"version":"1.0.0"}', '{"name":42}']) {
    const { findings } = inspectProject([{ path: 'package.json', text }]);
    assert.deepEqual(valuesFor(findings, 'identity.name'), [], text);
    assert.ok(valuesFor(findings, 'technologies.approved').includes('Node.js (package.json)'));
  }
});
