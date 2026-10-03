// Tests for the import-direction rule that keeps Cellular Adaptive optional — AD8 of
// `tools/adaptive/ACCEPTANCE.md`. A separate file for the same reason gates-trilateral
// split off gates-boundaries: `gates-boundaries.test.mjs` had reached the 200-line rule,
// and the adaptive arrow is its own subject.
//
// The rule is the architecture's promise that an EXPERIMENTAL module cannot become load
// bearing. Deleting `tools/adaptive/` must leave the method, the CLI, the gates and the
// runtime intact, and the only mechanical way to guarantee that is to refuse the import
// before anybody needs it. Fixtures only: these paths are deliberately files that do not
// exist, because the rule has to be stated before the later cells write the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADAPTIVE_PURE_IMPORTS, RULES, checkBoundaries } from '../tools/gates/boundaries.mjs';

/** @type {(path: string, ...specifiers: string[]) => import('../tools/gates/types.mjs').FileTuple} */
const file = (path, ...specifiers) => ({ path, text: specifiers.map((s) => `import x from '${s}';`).join('\n') + '\n' });
/** @type {(findings: ReadonlyArray<{ rule: string }>) => string[]} */
const ids = (findings) => findings.map((f) => f.rule);

test('adaptive boundary · the rule exists, with an id and a reason', () => {
  const rule = RULES.find((r) => r.id === 'adaptive-is-optional-and-isolated');
  assert.ok(rule, 'the deny rule must be part of RULES');
  assert.deepEqual(rule?.denyPrefixes, ['tools/adaptive/']);
  assert.ok((rule?.why ?? '').length > 40);
});

test('adaptive boundary · RED when the method, the SDK, the kernel or a plugin imports it', () => {
  const files = [
    file('tools/cellmode/commands.mjs', '../adaptive/modes.mjs'),
    file('skills/cell/x.mjs', '../../tools/adaptive/modes.mjs'),
    file('eip/sdk/index.mjs', '../../tools/adaptive/schema.mjs'),
    file('eip/kernel/a.mjs', '../../tools/adaptive/schema.mjs'),
    file('eip/plugins/text.stats/a.mjs', '../../../tools/adaptive/modes.mjs'),
    file('eip/plugins/observer-state/a.mjs', '../../../tools/adaptive/modes.mjs'),
  ];
  const findings = checkBoundaries(files);
  const isolated = findings.filter((f) => f.rule === 'adaptive-is-optional-and-isolated');
  assert.deepEqual(isolated.map((f) => f.file), files.map((f) => f.path));
  assert.equal(findings.every((f) => f.target.startsWith('tools/adaptive/')), true);
});

test('adaptive boundary · the host still reads adaptive through a port, never by importing it', () => {
  assert.deepEqual(ids(checkBoundaries([file('eip/host/compose.mjs', '../../tools/adaptive/modes.mjs')])),
    ['host-composes-everything'], 'the host reads adaptive through a port, never by importing it');
});

test('adaptive boundary · AD30 the adaptive-* allowlist is NAMED, never a prefix', () => {
  const rule = RULES.find((r) => r.id === 'adaptive-plugin-imports-only-named-pure-modules');
  assert.ok(rule, 'cell 5 grants the exception in exactly one place');
  assert.deepEqual(rule?.allowPrefixes, ['eip/sdk/'], 'tools/adaptive/ is never a prefix');
  assert.deepEqual(rule?.allowExact, [...ADAPTIVE_PURE_IMPORTS]);
  assert.deepEqual([...ADAPTIVE_PURE_IMPORTS], [
    'tools/adaptive/modes.mjs',
    'tools/adaptive/schema.mjs',
    'tools/adaptive/types.mjs',
    'tools/adaptive/validity.mjs',
  ], 'four pure modules, each checked by hand');
  assert.equal(rule?.allowSelfDepth, 3);
  assert.ok((rule?.why ?? '').length > 40);
});

test('adaptive boundary · AD30 the four pure modules are GREEN for an adaptive-* plugin', () => {
  const plugin = file('eip/plugins/adaptive-preferences/index.mjs',
    ...ADAPTIVE_PURE_IMPORTS.map((target) => `../../../${target}`),
    '../../sdk/index.mjs', './schemas.mjs', 'node:crypto');
  assert.deepEqual(checkBoundaries([plugin]), [], 'the allowlist must actually permit what it names');
});

test('adaptive boundary · AD30 the DISK and CLI modules stay forbidden for an adaptive-* plugin', () => {
  for (const forbidden of ['io.mjs', 'main.mjs', 'cli.mjs', 'hook.mjs', 'context.mjs', 'commands.mjs', 'transitions.mjs', 'errors.mjs']) {
    const plugin = file('eip/plugins/adaptive-preferences/index.mjs', `../../../tools/adaptive/${forbidden}`);
    assert.deepEqual(ids(checkBoundaries([plugin])), ['adaptive-plugin-imports-only-named-pure-modules'],
      `tools/adaptive/${forbidden} must stay out of reach of a plugin`);
  }
  // And the plugin may not reach the kernel, the host or a sibling plugin either.
  for (const reach of ['../../kernel/index.mjs', '../../host/index.mjs', '../observer-state/index.mjs']) {
    assert.deepEqual(ids(checkBoundaries([file('eip/plugins/adaptive-preferences/index.mjs', reach)])),
      ['adaptive-plugin-imports-only-named-pure-modules'], `${reach} must stay refused`);
  }
});

test('adaptive boundary · AD30 an observer-* plugin is STILL refused tools/adaptive, pure or not', () => {
  for (const target of ADAPTIVE_PURE_IMPORTS) {
    const plugin = file('eip/plugins/observer-state/index.mjs', `../../../${target}`);
    assert.deepEqual(ids(checkBoundaries([plugin])).sort(), [
      'adaptive-is-optional-and-isolated',
      'observer-plugin-imports-only-named-pure-modules',
    ], `${target} must stay refused to the Observer: deleting adaptive leaves it whole`);
  }
});

test('adaptive boundary · the adaptive module may not import the runtime either', () => {
  assert.deepEqual(ids(checkBoundaries([file('tools/adaptive/modes.mjs', '../../eip/sdk/index.mjs')])),
    ['cellular-mode-is-runtime-independent']);
  assert.deepEqual(checkBoundaries([file('tools/adaptive/schema.mjs', './modes.mjs', '../gates/top-level.mjs')]), []);
});

test('adaptive boundary · the rule does not forbid what it was not asked to forbid', () => {
  assert.deepEqual(checkBoundaries([
    file('tools/adaptive/context.mjs', './modes.mjs', './schema.mjs', 'node:fs'),
    file('apps/observer/web/app.mjs', './view.mjs'),
    file('tools/gates/check-all.mjs', './boundaries.mjs'),
  ]), []);
});
