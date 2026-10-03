// Tests for the import-direction gate. The pure pieces of Trilateral Verification
// moved to gates-trilateral.test.mjs when this file reached the 200-line rule: two
// subjects, two files, and neither one squeezed to fit.
//
// The whole suite runs on in-memory fixtures, and that is not a convenience: `eip/`
// is being built while this gate is being written, so a test that read the real
// directory would assert on whatever happens to exist this minute. Fixtures state
// the rule; the repository is checked separately, at the end, as a smoke test that
// tolerates the directory being absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OBSERVER_PURE_IMPORTS, RULES, checkBoundaries, resolveSpecifier, toFindings,
} from '../tools/gates/boundaries.mjs';
import { readTuples } from '../tools/gates/scan.mjs';

/** @type {(path: string, ...specifiers: string[]) => import('../tools/gates/types.mjs').FileTuple} */
const file = (path, ...specifiers) => ({ path, text: specifiers.map((s) => `import x from '${s}';`).join('\n') + '\n' });
/** @type {(findings: ReadonlyArray<{ rule: string }>) => string[]} */
const ids = (findings) => findings.map((f) => f.rule);

// ------------------------------------------------------------ resolution --------
test('boundaries · a relative specifier resolves to a repository path, with no disk access', () => {
  assert.equal(resolveSpecifier('eip/kernel/a.mjs', '../sdk/b.mjs'), 'eip/sdk/b.mjs');
  assert.equal(resolveSpecifier('eip/kernel/a.mjs', './b.mjs'), 'eip/kernel/b.mjs');
  assert.equal(resolveSpecifier('eip/plugins/p/a.mjs', '../../../examples/text-stats/src/x.mjs'), 'examples/text-stats/src/x.mjs');
  assert.equal(resolveSpecifier('eip/sdk/a.mjs', 'node:fs'), 'node:fs', 'built-ins pass through unchanged');
});

// ----------------------------------------------------------------- green --------
test('boundaries · GREEN on a layout that respects every arrow', () => {
  const files = [
    file('eip/sdk/index.mjs', './schema.mjs', 'node:assert'),
    file('eip/kernel/index.mjs', '../sdk/index.mjs', './registry.mjs', 'node:events'),
    file('eip/plugins/text.stats/index.mjs', '../../sdk/index.mjs', './impl.mjs', '../../../examples/text-stats/src/text-stats.mjs'),
    file('eip/orchestration/gateway.mjs', '../kernel/index.mjs', '../sdk/index.mjs', './audit.mjs'),
    file('eip/host/server.mjs', '../kernel/index.mjs', '../plugins/text.stats/index.mjs', 'node:http'),
    file('tools/cellmode/main.mjs', './state.mjs', 'node:fs'),
  ];
  assert.deepEqual(checkBoundaries(files), []);
});

// ------------------------------------------------------------------ red ---------
test('boundaries · RED when the SDK imports the kernel', () => {
  const findings = checkBoundaries([file('eip/sdk/index.mjs', '../kernel/index.mjs')]);
  assert.deepEqual(ids(findings), ['sdk-depends-on-nothing']);
  assert.deepEqual(findings[0], {
    file: 'eip/sdk/index.mjs',
    specifier: '../kernel/index.mjs',
    target: 'eip/kernel/index.mjs',
    rule: 'sdk-depends-on-nothing',
    why: findings[0]?.why,
  });
});

test('boundaries · RED when the kernel reaches for a plugin, the host or orchestration', () => {
  const files = [
    file('eip/kernel/a.mjs', '../plugins/text.stats/index.mjs'),
    file('eip/kernel/b.mjs', '../orchestration/gateway.mjs'),
  ];
  assert.deepEqual(ids(checkBoundaries(files)), ['kernel-imports-sdk-only', 'kernel-imports-sdk-only']);
});

test('boundaries · RED when a plugin imports kernel internals, the host, or a sibling plugin', () => {
  const files = [
    file('eip/plugins/text.stats/a.mjs', '../../kernel/registry.mjs'),
    file('eip/plugins/text.stats/b.mjs', '../../host/server.mjs'),
    file('eip/plugins/text.stats/c.mjs', '../text.report/index.mjs'),
  ];
  const findings = checkBoundaries(files);
  assert.deepEqual(ids(findings), Array(3).fill('plugin-imports-sdk-and-own-dir'));
  assert.deepEqual(findings.map((f) => f.target), [
    'eip/kernel/registry.mjs',
    'eip/host/server.mjs',
    'eip/plugins/text.report/index.mjs',
  ]);
});

// --------------------------------------------------- the observer exception -----
// The allowance is NARROW and that is the whole point of testing it: the list is
// named modules, so a test that only proved "observer may import tools/cellmode"
// would stay green if the rule were widened to a prefix.
test('boundaries · an observer-* plugin may import the NAMED pure modules', () => {
  const files = [
    file('eip/plugins/observer-state/read.mjs', '../../sdk/index.mjs', './views.mjs',
      '../../../tools/cellmode/index-table.mjs', '../../../tools/cellmode/log.mjs',
      '../../../tools/cellmode/cell-file.mjs', '../../../tools/cellmode/check.mjs',
      '../../../tools/cellmode/deps.mjs', '../../../tools/cellmode/slug.mjs', 'node:crypto'),
    file('eip/plugins/observer-audit/rules.mjs', '../../../tools/gates/size.mjs',
      '../../../tools/gates/secrets.mjs', '../../../tools/gates/boundaries.mjs',
      '../../../tools/gates/release.mjs'),
  ];
  assert.deepEqual(checkBoundaries(files), []);
});

test('boundaries · RED when an observer plugin reaches a module that is not on the list', () => {
  // Each of these is a different reason to refuse: disk access, path building, the
  // CLI, a clock, a disk-reading gate shell, a process-spawning shell.
  const notPure = [
    'tools/cellmode/state.mjs', 'tools/cellmode/paths.mjs', 'tools/cellmode/clock.mjs',
    'tools/cellmode/main.mjs', 'tools/cellmode/cli.mjs', 'tools/cellmode/commands.mjs',
    'tools/gates/scan.mjs', 'tools/gates/check-all.mjs', 'tools/gates/trilateral.mjs',
    'tools/key-audit/key-audit.mjs',
  ];
  const files = notPure.map((target, i) => file(`eip/plugins/observer-state/m${i}.mjs`, `../../../${target}`));
  const findings = checkBoundaries(files);
  assert.deepEqual(findings.map((f) => f.target), notPure);
  assert.deepEqual(ids(findings), Array(notPure.length).fill('observer-plugin-imports-only-named-pure-modules'));
  // Kernel, host and a sibling plugin stay refused for an observer plugin too.
  assert.deepEqual(ids(checkBoundaries([
    file('eip/plugins/observer-state/a.mjs', '../../kernel/registry.mjs'),
    file('eip/plugins/observer-state/b.mjs', '../../host/index.mjs'),
    file('eip/plugins/observer-audit/c.mjs', '../observer-state/index.mjs'),
  ])), Array(3).fill('observer-plugin-imports-only-named-pure-modules'));
});

test('boundaries · the exception is the observer\'s alone: another plugin is still refused', () => {
  for (const target of OBSERVER_PURE_IMPORTS) {
    const findings = checkBoundaries([file('eip/plugins/text-stats/x.mjs', `../../../${target}`)]);
    assert.deepEqual(ids(findings), ['plugin-imports-sdk-and-own-dir'], `${target} must stay refused`);
  }
  assert.ok(OBSERVER_PURE_IMPORTS.length >= 9);
  assert.equal(OBSERVER_PURE_IMPORTS.includes('tools/cellmode/state.mjs'), false);
  assert.equal(OBSERVER_PURE_IMPORTS.includes('tools/gates/scan.mjs'), false);
  assert.equal(Object.isFrozen(OBSERVER_PURE_IMPORTS), true);
});

test('boundaries · orchestration may use the kernel public entry but not its internals', () => {
  assert.deepEqual(checkBoundaries([file('eip/orchestration/g.mjs', '../kernel/index.mjs')]), []);
  assert.deepEqual(ids(checkBoundaries([file('eip/orchestration/g.mjs', '../kernel/execute.mjs')])), [
    'orchestration-uses-kernel-public-entry',
  ]);
});

test('boundaries · RED when the kernel or the SDK touches a transport', () => {
  const files = [file('eip/kernel/a.mjs', 'node:http'), file('eip/sdk/b.mjs', 'node:net')];
  const findings = checkBoundaries(files);
  // `node:` built-ins pass every ALLOW rule by design, so only the DENY rule fires
  // here - one finding per file, naming the transport rule rather than the layer.
  assert.deepEqual(ids(findings), Array(2).fill('kernel-and-sdk-are-transport-free'));
  assert.deepEqual(findings.map((f) => f.specifier), ['node:http', 'node:net']);
});

test('boundaries · RED when Cellular Mode imports the runtime', () => {
  const files = [
    file('tools/cellmode/main.mjs', '../../eip/kernel/index.mjs'),
    file('adapters/claude-code/x.mjs', '../../eip/sdk/index.mjs'),
  ];
  assert.deepEqual(ids(checkBoundaries(files)), Array(2).fill('cellular-mode-is-runtime-independent'));
});

test('boundaries · an absent eip/ directory is silence, not a failure', () => {
  assert.deepEqual(checkBoundaries([]), []);
  assert.deepEqual(checkBoundaries([file('README.md', 'anything'), file('tools/key-audit/cli.mjs', './key-audit.mjs')]), []);
});

test('boundaries · every rule carries an id and a reason a human can act on', () => {
  for (const rule of RULES) {
    assert.match(rule.id, /^[a-z][a-z0-9-]+$/);
    assert.ok(rule.why.length > 40, `${rule.id} needs a reason, not a label`);
    assert.ok(rule.from instanceof RegExp);
  }
  const findings = toFindings(checkBoundaries([file('eip/sdk/a.mjs', '../kernel/index.mjs')]));
  assert.equal(findings[0]?.rule, 'boundaries:sdk-depends-on-nothing');
  assert.match(String(findings[0]?.detail), /imports "\.\.\/kernel\/index\.mjs"/);
});

test('boundaries · the real repository respects its own arrows', () => {
  const code = readTuples(undefined, (rel) => /\.(mjs|js)$/.test(rel));
  const findings = toFindings(checkBoundaries(code));
  assert.deepEqual(findings, [], findings.map((f) => `${f.rule} ${f.path}: ${f.detail}`).join('\n'));
});
