// Tests for the two import-direction rules that keep the Cellular Prompt Builder OPTIONAL —
// decision PB3 of `prompt-builder/CONTRACTS.md`: gates are STRENGTHENED, never weakened.
//
// A separate file for the reason `gates-adaptive-boundary.test.mjs` is one: the Builder's
// arrow is its own subject, and `gates-boundaries.test.mjs` is already at the 200-line rule.
//
// The rules are the architecture's promise that an optional module cannot become load
// bearing. Deleting `tools/prompt-builder/` must leave the method, the CLI, the gates, the
// Observer and the runtime intact, and the only mechanical way to guarantee that is to refuse
// the import before anybody needs it. Fixtures are in-memory tuples — each rule is shown RED
// on a synthetic violating import and GREEN on the real tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, checkBoundaries } from '../tools/gates/boundaries.mjs';
import { importSpecifiers } from '../tools/gates/deps.mjs';
import { ROOT, readTuples } from '../tools/gates/scan.mjs';
import { report } from './helpers.mjs';

const ISOLATED = 'prompt-builder-is-optional-and-isolated';
const INWARD = 'prompt-builder-depends-on-the-method-only';
const TRANSPORT = 'prompt-builder-is-transport-free';
const BUILDER = 'tools/prompt-builder/';

/** The capabilities the Builder is never granted: every socket module, and the one that starts
 * a program. `node:child_process` is on the list because it is NOT used — a capability that is
 * absent today and ungated is a capability the next cell acquires by accident. */
const DENIED_BUILTINS = Object.freeze(['node:http', 'node:https', 'node:http2', 'node:net',
  'node:tls', 'node:dgram', 'node:child_process']);

/** @type {(path: string, ...specifiers: string[]) => import('../tools/gates/types.mjs').FileTuple} */
const file = (path, ...specifiers) => ({ path, text: specifiers.map((s) => `import x from '${s}';`).join('\n') + '\n' });
/** @type {(findings: ReadonlyArray<{ rule: string }>) => string[]} */
const ids = (findings) => findings.map((f) => f.rule);

test('builder boundary · both rules exist, with an id and a reason', () => {
  const isolated = RULES.find((r) => r.id === ISOLATED);
  assert.ok(isolated, 'the outward deny rule must be part of RULES');
  assert.deepEqual(isolated?.denyPrefixes, [BUILDER]);
  assert.equal(isolated?.allowPrefixes, undefined, 'a DENY rule never carries an allow list');
  assert.ok((isolated?.why ?? '').length > 40);
  const inward = RULES.find((r) => r.id === INWARD);
  assert.ok(inward, 'the inward deny rule must be part of RULES');
  assert.deepEqual(inward?.denyPrefixes, ['eip/', 'tools/adaptive/', 'tools/gates/']);
  assert.ok((inward?.why ?? '').length > 40);
  // The Builder's own directory is excepted by the `from` pattern, never by an allowlist:
  // no name was added anywhere, so there is nothing to go stale.
  assert.equal(isolated?.from.test('tools/prompt-builder/store.mjs'), false);
  assert.equal(isolated?.from.test('tools/prompt-builder/fixtures/contracts.mjs'), false);
  assert.equal(isolated?.from.test('tools/cellmode/commands.mjs'), true);
});

test('builder boundary · RED when the method, the gates, a test or the runtime imports it', () => {
  const files = [
    file('tools/cellmode/commands.mjs', '../prompt-builder/store.mjs'),
    file('tools/cellmode/cli.mjs', '../prompt-builder/main.mjs'),
    file('tools/gates/check-all.mjs', '../prompt-builder/validate.mjs'),
    file('tools/adaptive/context.mjs', '../prompt-builder/questions.mjs'),
    file('skills/cell/x.mjs', '../../tools/prompt-builder/prompt.mjs'),
    file('docs/x.mjs', '../tools/prompt-builder/prompt.mjs'),
    file('eip/sdk/index.mjs', '../../tools/prompt-builder/types.mjs'),
    file('eip/kernel/a.mjs', '../../tools/prompt-builder/types.mjs'),
    file('eip/host/compose.mjs', '../../tools/prompt-builder/store.mjs'),
    file('eip/plugins/observer-state/a.mjs', '../../../tools/prompt-builder/store.mjs'),
    file('apps/observer/host-adapter.mjs', '../../tools/prompt-builder/store.mjs'),
    file('tests/x.test.mjs', '../tools/prompt-builder/store.mjs'),
  ];
  const findings = checkBoundaries(files).filter((f) => f.rule === ISOLATED);
  assert.deepEqual(findings.map((f) => f.file), files.map((f) => f.path));
  assert.equal(findings.every((f) => f.target.startsWith(BUILDER)), true);
});

test('builder boundary · RED on PB1: tools/cellmode never imports the Builder, by any route', () => {
  for (const specifier of ['../prompt-builder/main.mjs', '../prompt-builder/fixtures/index.mjs',
    './../prompt-builder/cli.mjs', '../../tools/prompt-builder/store.mjs']) {
    assert.deepEqual(ids(checkBoundaries([file('tools/cellmode/transitions.mjs', specifier)])), [ISOLATED],
      `${specifier} must stay refused to the CLI: the arrow points one way`);
  }
});

test('builder boundary · RED when the Builder reaches the runtime, adaptive or the gates', () => {
  for (const specifier of ['../../eip/sdk/index.mjs', '../../eip/kernel/index.mjs', '../../eip/host/index.mjs',
    '../../eip/upp/manifest.mjs', '../adaptive/modes.mjs', '../adaptive/io.mjs',
    '../gates/scan.mjs', '../gates/boundaries.mjs']) {
    assert.deepEqual(ids(checkBoundaries([file('tools/prompt-builder/store.mjs', specifier)])), [INWARD],
      `${specifier} must stay out of reach of the Builder`);
  }
});

test('builder boundary · GREEN on what the Builder is actually allowed to import', () => {
  assert.deepEqual(checkBoundaries([file('tools/prompt-builder/store.mjs',
    'node:fs', 'node:path', 'node:crypto', './errors.mjs', './draft.mjs',
    '../cellmode/index-table.mjs', '../cellmode/paths.mjs')]), [],
  'node built-ins and the pure modules of tools/cellmode are the Builder\'s whole surface');
  // And the rule does not forbid what it was not asked to forbid.
  assert.deepEqual(checkBoundaries([
    file('tools/cellmode/commands.mjs', './state.mjs', './fields.mjs'),
    file('tools/gates/check-all.mjs', './boundaries.mjs'),
  ]), []);
});

test('builder boundary · RED on any network or process capability, built-in by built-in', () => {
  const transport = RULES.find((r) => r.id === TRANSPORT);
  assert.ok(transport, 'the capability rule must be part of RULES');
  assert.deepEqual(transport?.denyExact, [...DENIED_BUILTINS]);
  assert.ok((transport?.why ?? '').length > 40);
  for (const builtin of DENIED_BUILTINS) {
    assert.deepEqual(ids(checkBoundaries([file('tools/prompt-builder/store.mjs', builtin)])), [TRANSPORT],
      `${builtin} must stay out of reach of the Builder`);
  }
  // The built-ins it DOES hold stay allowed, so the rule is narrow rather than merely strict.
  assert.deepEqual(checkBoundaries([file('tools/prompt-builder/store.mjs',
    'node:fs', 'node:os', 'node:path', 'node:crypto', 'node:url')]), []);
});

test('builder boundary · GREEN on the real tree, and the scan really saw the Builder', () => {
  const modules = readTuples(ROOT, (rel) => /\.(mjs|js)$/.test(rel));
  const builderFiles = modules.filter((f) => f.path.startsWith(BUILDER));
  assert.ok(builderFiles.length >= 20,
    `the scan found ${builderFiles.length} Builder modules, so it is reading the real directory`);
  const findings = checkBoundaries(modules)
    .filter((f) => f.rule === ISOLATED || f.rule === INWARD || f.rule === TRANSPORT);
  assert.deepEqual(findings, [],
    report('real imports across the Builder boundary', findings.map((f) => `${f.file}: ${f.specifier} (${f.rule})`)));
  // The same claim read the other way: no module of the Builder names a forbidden prefix at
  // all, comment or not, so a future dynamic import has nowhere to hide either.
  const reaching = builderFiles
    .filter((f) => importSpecifiers(f.text)
      .some((s) => /(^|\/)(eip|adaptive|gates)\//.test(s) || DENIED_BUILTINS.includes(s)))
    .map((f) => f.path);
  assert.deepEqual(reaching, [], report('Builder modules reaching outside the method', reaching));
});
