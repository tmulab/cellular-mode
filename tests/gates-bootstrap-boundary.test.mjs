// Tests for the FOUR rules that keep Cellular Bootstrap OPTIONAL and narrowly privileged —
// decision BS1 of `bootstrap/CONTRACTS.md`: gates are STRENGTHENED, never weakened.
//
// A separate file for the reason `gates-builder-boundary.test.mjs` is one: Bootstrap's arrows are
// their own subject and `gates-boundaries.test.mjs` is already at the 200-line rule.
//
// Deleting `tools/bootstrap/` must leave the method, the CLI, the gates, the Builder, the Observer
// and the runtime intact (`npm run rehearse:bootstrap-removal` proves it the slow way), and the
// only mechanical way to guarantee it is to refuse the import before anybody needs it. The fourth
// rule is different in kind: Bootstrap DOES start programs, so the capability is confined to one
// file by name instead of denied outright. Fixtures are in-memory tuples — each rule is shown RED
// on a synthetic violation and GREEN on the real tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, checkBoundaries } from '../tools/gates/boundaries.mjs';
import { importSpecifiers } from '../tools/gates/deps.mjs';
import { ROOT, readTuples } from '../tools/gates/scan.mjs';
import { report } from './helpers.mjs';

const ISOLATED = 'bootstrap-is-optional-and-isolated';
const INWARD = 'bootstrap-depends-on-the-method-only';
const TRANSPORT = 'bootstrap-is-transport-free';
const PROCESS = 'bootstrap-starts-a-process-in-exec-only';
const BOOTSTRAP = 'tools/bootstrap/';

/** Every socket module, denied in EVERY file of the module. `node:child_process` is NOT here: it is
 * the subject of its own rule, because Bootstrap holds that capability in exactly one file. */
const DENIED_BUILTINS = Object.freeze(['node:http', 'node:https', 'node:http2', 'node:net',
  'node:tls', 'node:dgram']);

/** The one file allowed to start a program, written as it appears in a path. */
const EXEC = 'tools/bootstrap/exec.mjs';

/** The one repository-level test excepted from the outward rule, because the rehearsal DELETES it
 * with the module (`tools/gates/removal-paths.mjs`, BOOTSTRAP_PATHS). */
const OWNED_TEST = 'tests/verification-contract.test.mjs';

/** @type {(path: string, ...specifiers: string[]) => import('../tools/gates/types.mjs').FileTuple} */
const file = (path, ...specifiers) => ({ path, text: specifiers.map((s) => `import x from '${s}';`).join('\n') + '\n' });
/** @type {(findings: ReadonlyArray<{ rule: string }>) => string[]} */
const ids = (findings) => findings.map((f) => f.rule);

test('bootstrap boundary · all four rules exist, with an id, a reason and one list each', () => {
  for (const id of [ISOLATED, INWARD, TRANSPORT, PROCESS]) {
    const rule = RULES.find((r) => r.id === id);
    assert.ok(rule, `${id} must be part of RULES`);
    assert.ok((rule?.why ?? '').length > 40, `${id} must say why`);
    assert.equal(rule?.allowPrefixes, undefined, `${id} is a DENY rule and carries no allow list`);
    assert.equal(rule?.allowExact, undefined, `${id} is a DENY rule and carries no allow list`);
  }
  const isolated = RULES.find((r) => r.id === ISOLATED);
  assert.deepEqual(isolated?.denyPrefixes, [BOOTSTRAP]);
  assert.deepEqual(RULES.find((r) => r.id === INWARD)?.denyPrefixes,
    ['eip/', 'tools/adaptive/', 'tools/gates/', 'tools/prompt-builder/']);
  assert.deepEqual(RULES.find((r) => r.id === TRANSPORT)?.denyExact, [...DENIED_BUILTINS]);
  assert.deepEqual(RULES.find((r) => r.id === PROCESS)?.denyExact, ['node:child_process']);
  // Bootstrap's own directory is excepted by the `from` pattern, never by an allowlist, so its
  // modules, tests and fixtures need no name anywhere and nothing can go stale.
  assert.equal(isolated?.from.test('tools/bootstrap/writer.mjs'), false);
  assert.equal(isolated?.from.test('tools/bootstrap/fixtures/temp.mjs'), false);
  assert.equal(isolated?.from.test('tools/bootstrap/bootstrap-install.test.mjs'), false);
  assert.equal(isolated?.from.test(OWNED_TEST), false, 'the one owned test the rehearsal deletes');
  assert.equal(isolated?.from.test('tools/cellmode/commands.mjs'), true);
  assert.equal(isolated?.from.test('tests/gates-verification-suite.test.mjs'), true);
});

test('bootstrap boundary · RED when the method, the gates, a test or the runtime imports it', () => {
  const files = [
    file('tools/cellmode/commands.mjs', '../bootstrap/writer.mjs'),
    file('tools/cellmode/cli.mjs', '../bootstrap/main.mjs'),
    file('tools/gates/check-all.mjs', '../bootstrap/catalog.mjs'),
    file('tools/gates/verification-suite.mjs', '../bootstrap/verification.mjs'),
    file('tools/adaptive/context.mjs', '../bootstrap/detect.mjs'),
    file('tools/prompt-builder/store.mjs', '../bootstrap/plan.mjs'),
    file('skills/cell/x.mjs', '../../tools/bootstrap/plan.mjs'),
    file('docs/x.mjs', '../tools/bootstrap/plan.mjs'),
    file('eip/sdk/index.mjs', '../../tools/bootstrap/exec.mjs'),
    file('eip/host/compose.mjs', '../../tools/bootstrap/exec.mjs'),
    file('eip/plugins/observer-state/a.mjs', '../../../tools/bootstrap/status.mjs'),
    file('apps/observer/host-adapter.mjs', '../../tools/bootstrap/status.mjs'),
    file('tests/gates-verification-suite.test.mjs', '../tools/bootstrap/commands.mjs'),
  ];
  const findings = checkBoundaries(files).filter((f) => f.rule === ISOLATED);
  assert.deepEqual(findings.map((f) => f.file), files.map((f) => f.path));
  assert.equal(findings.every((f) => f.target.startsWith(BOOTSTRAP)), true);
});

test('bootstrap boundary · RED on BS1: tools/cellmode never imports Bootstrap, by any route', () => {
  for (const specifier of ['../bootstrap/main.mjs', '../bootstrap/fixtures/temp.mjs',
    './../bootstrap/cli.mjs', '../../tools/bootstrap/writer.mjs']) {
    assert.deepEqual(ids(checkBoundaries([file('tools/cellmode/transitions.mjs', specifier)])), [ISOLATED],
      `${specifier} must stay refused to the CLI: cellmode init is untouched by Bootstrap`);
  }
});

test('bootstrap boundary · RED when Bootstrap reaches the runtime, adaptive, the gates or the Builder', () => {
  for (const specifier of ['../../eip/sdk/index.mjs', '../../eip/kernel/index.mjs', '../../eip/host/index.mjs',
    '../../eip/upp/manifest.mjs', '../adaptive/modes.mjs', '../adaptive/io.mjs',
    '../gates/scan.mjs', '../gates/verification-contract.mjs', '../gates/verify-final.mjs']) {
    assert.deepEqual(ids(checkBoundaries([file('tools/bootstrap/plan.mjs', specifier)])), [INWARD],
      `${specifier} must stay out of reach of Bootstrap`);
  }
  // BS4 restated: the Builder is reached as a SUBPROCESS, so even the composition module that
  // talks to it may not import it. Two rules fire on that specifier at once — PB3's outward deny
  // and Bootstrap's inward one — which is exactly why the Builder's gate needed no exception.
  for (const specifier of ['../prompt-builder/store.mjs', '../prompt-builder/main.mjs',
    '../prompt-builder/cli.mjs']) {
    const found = ids(checkBoundaries([file('tools/bootstrap/compose-builder.mjs', specifier)]));
    assert.ok(found.includes(INWARD), `${specifier} must be refused to Bootstrap: ${found.join(', ')}`);
    assert.ok(found.includes('prompt-builder-is-optional-and-isolated'),
      'and PB3 must still fire on it, unrelaxed');
  }
});

test('bootstrap boundary · GREEN on what Bootstrap is actually allowed to import', () => {
  assert.deepEqual(checkBoundaries([file('tools/bootstrap/writer.mjs',
    'node:fs', 'node:path', 'node:crypto', 'node:os', 'node:url', './errors.mjs', './writer-base.mjs',
    '../cellmode/paths.mjs', '../cellmode/commands.mjs', '../cellmode/skeleton.mjs')]), [],
  'node built-ins and the pure modules of tools/cellmode are Bootstrap\'s whole import surface');
  // And the rules do not forbid what they were not asked to forbid.
  assert.deepEqual(checkBoundaries([
    file(OWNED_TEST, '../tools/bootstrap/commands.mjs', '../tools/gates/verification-contract.mjs'),
    file('tools/gates/verification-suite.mjs', './verification-contract.mjs', 'node:child_process'),
  ]), []);
});

test('bootstrap boundary · RED on any network capability, built-in by built-in', () => {
  for (const builtin of DENIED_BUILTINS) {
    assert.deepEqual(ids(checkBoundaries([file('tools/bootstrap/detect.mjs', builtin)])), [TRANSPORT],
      `${builtin} must stay out of reach of Bootstrap: nothing it reads may leave the machine`);
    assert.deepEqual(ids(checkBoundaries([file(EXEC, builtin)])), [TRANSPORT],
      `${builtin} is denied in exec.mjs too: the process exception is not a network exception`);
  }
  // The built-ins it DOES hold stay allowed, so the rule is narrow rather than merely strict.
  assert.deepEqual(checkBoundaries([file('tools/bootstrap/detect.mjs',
    'node:fs', 'node:os', 'node:path', 'node:crypto', 'node:url')]), []);
});

test('bootstrap boundary · node:child_process is RED everywhere but exactly exec.mjs', () => {
  for (const path of ['tools/bootstrap/main.mjs', 'tools/bootstrap/apply.mjs',
    'tools/bootstrap/compose-builder.mjs', 'tools/bootstrap/baseline.mjs',
    'tools/bootstrap/fixtures/projects.mjs', 'tools/bootstrap/bootstrap-install.test.mjs',
    'tools/bootstrap/exec.test.mjs', 'tools/bootstrap/nested/exec.mjs']) {
    assert.deepEqual(ids(checkBoundaries([file(path, 'node:child_process')])), [PROCESS],
      `${path} must not be able to start a program: exec.mjs is the one place that may`);
  }
  assert.deepEqual(checkBoundaries([file(EXEC, 'node:child_process')]), [],
    'exec.mjs holds the capability, and holding it there is the point of the rule');
  const rule = RULES.find((r) => r.id === PROCESS);
  assert.equal(rule?.from.test(EXEC), false, 'the exception is in the pattern, not in an allowlist');
  assert.equal(rule?.from.test('tools/bootstrap/exec-extra.mjs'), true, 'and it is anchored, not a prefix');
});

test('bootstrap boundary · GREEN on the real tree, and the scan really saw Bootstrap', () => {
  const modules = readTuples(ROOT, (rel) => /\.(mjs|js)$/.test(rel));
  const bootstrapFiles = modules.filter((f) => f.path.startsWith(BOOTSTRAP));
  assert.ok(bootstrapFiles.length >= 40,
    `the scan found ${bootstrapFiles.length} Bootstrap modules, so it is reading the real directory`);
  assert.ok(modules.some((f) => f.path === EXEC), 'the scan must have seen the one process module');
  const findings = checkBoundaries(modules)
    .filter((f) => [ISOLATED, INWARD, TRANSPORT, PROCESS].includes(f.rule));
  assert.deepEqual(findings, [],
    report('real imports across the Bootstrap boundary', findings.map((f) => `${f.file}: ${f.specifier} (${f.rule})`)));
  // The same claim read the other way: no module of Bootstrap NAMES a forbidden prefix at all,
  // so a future dynamic import has nowhere to hide either — and exactly one file names the
  // process module, which is the arrangement the fourth rule describes.
  const reaching = bootstrapFiles
    .filter((f) => importSpecifiers(f.text)
      .some((s) => /(^|\/)(eip|adaptive|gates|prompt-builder)\//.test(s) || DENIED_BUILTINS.includes(s)))
    .map((f) => f.path);
  assert.deepEqual(reaching, [], report('Bootstrap modules reaching outside the method', reaching));
  const spawners = bootstrapFiles
    .filter((f) => importSpecifiers(f.text).includes('node:child_process')).map((f) => f.path);
  assert.deepEqual(spawners, [EXEC], 'exactly one file in Bootstrap may start a program');
});
