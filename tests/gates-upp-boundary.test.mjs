// The UPP layer's import direction, as a gate.
//
// `eip/upp/` holds PURE protocol modules: manifest validation, version negotiation,
// message envelopes, the error mapping and the compat layer. Three claims about it are
// only worth something if a gate checks them, so each one is a rule here and a fixture
// below. Fixtures, not the real directory: a rule stated on in-memory tuples says what
// the rule IS, and the repository is checked separately as a smoke test.
//
//   1. upp may import the SDK and itself, and nothing else.
//   2. upp is transport-free — no node:http, no sockets, no host.
//   3. only the host composition may import upp. Every layer below it is denied, so a
//      protocol module can never become load-bearing for the kernel or a plugin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, checkBoundaries } from '../tools/gates/boundaries.mjs';
import { readTuples } from '../tools/gates/scan.mjs';
import { ROOT, exists } from './helpers.mjs';

/** @type {(path: string, ...specifiers: string[]) => import('../tools/gates/types.mjs').FileTuple} */
const file = (path, ...specifiers) => ({
  path, text: specifiers.map((s) => `import x from '${s}';`).join('\n') + '\n',
});
/** @type {(findings: ReadonlyArray<{ rule: string }>) => string[]} */
const ids = (findings) => findings.map((f) => f.rule);

const UPP_RULES = ['upp-imports-sdk-only', 'upp-is-transport-free', 'upp-is-imported-by-the-host-only'];

test('upp boundary · the three rules exist, each with a stated reason', () => {
  for (const id of UPP_RULES) {
    const rule = RULES.find((r) => r.id === id);
    assert.ok(rule !== undefined, `rule "${id}" is missing`);
    assert.ok((rule?.why ?? '').length > 40, `rule "${id}" must say why it exists`);
  }
});

test('upp boundary · GREEN on the layout the cell is building', () => {
  const files = [
    file('eip/upp/manifest.mjs', '../sdk/index.mjs', './version.mjs', 'node:assert'),
    file('eip/upp/messages.mjs', '../sdk/index.mjs', './schemas.mjs'),
    file('eip/upp/compat.mjs', '../sdk/index.mjs', './manifest.mjs'),
    file('eip/host/upp-composition.mjs', '../upp/index.mjs', '../kernel/index.mjs', 'node:http'),
  ];
  assert.deepEqual(checkBoundaries(files), []);
});

test('upp boundary · RED when upp reaches past the SDK', () => {
  const files = [
    file('eip/upp/manifest.mjs', '../kernel/index.mjs'),
    file('eip/upp/messages.mjs', '../plugins/text-stats/index.mjs'),
    file('eip/upp/compat.mjs', '../../tools/cellmode/check.mjs'),
    file('eip/upp/mode.mjs', '../../tools/adaptive/modes.mjs'),
  ];
  const findings = checkBoundaries(files);
  assert.deepEqual(ids(findings), [
    'upp-imports-sdk-only', 'upp-imports-sdk-only', 'upp-imports-sdk-only', 'upp-imports-sdk-only',
  ]);
});

test('upp boundary · RED when upp reaches for a transport or the host', () => {
  /** @type {Array<[string, string[]]>} */
  const cases = [
    ['node:http', ['upp-is-transport-free']],
    ['node:net', ['upp-is-transport-free']],
    ['node:tls', ['upp-is-transport-free']],
    ['node:dgram', ['upp-is-transport-free']],
    ['node:https', ['upp-is-transport-free']],
    ['node:http2', ['upp-is-transport-free']],
    // The host is denied twice over: it is neither the SDK nor a transport-free target.
    ['../host/index.mjs', ['upp-imports-sdk-only', 'upp-is-transport-free']],
  ];
  for (const [specifier, expected] of cases) {
    const findings = checkBoundaries([file('eip/upp/transport.mjs', specifier)]);
    assert.deepEqual(ids(findings), expected, `importing ${specifier}`);
  }
});

test('upp boundary · node:fs is refused too — a pure module reads nothing', () => {
  assert.deepEqual(
    ids(checkBoundaries([file('eip/upp/manifest.mjs', 'node:fs')])),
    ['upp-is-transport-free'],
    'a protocol module that reads disk is no longer a pure rule over data',
  );
});

test('upp boundary · RED when a layer below the host imports upp', () => {
  /** @type {string[]} */
  const importers = [
    'eip/sdk/index.mjs', 'eip/kernel/execute.mjs', 'eip/orchestration/index.mjs',
    'eip/plugins/text-stats/index.mjs', 'eip/plugins/observer-state/index.mjs',
    'eip/plugins/adaptive-preferences/index.mjs', 'tools/cellmode/check.mjs',
    'tools/adaptive/modes.mjs', 'skills/cell/x.mjs', 'adapters/claude-code/x.mjs',
  ];
  for (const path of importers) {
    // One specifier per depth: `../` as many times as the file is deep, so every
    // fixture really resolves to `eip/upp/index.mjs` and not to a path that happens
    // to be denied for an unrelated reason.
    const up = '../'.repeat(path.split('/').length - 1);
    const findings = checkBoundaries([file(path, `${up}eip/upp/index.mjs`)]);
    assert.ok(
      ids(findings).includes('upp-is-imported-by-the-host-only'),
      `${path} must be denied by the named rule, not merely by an allow list`,
    );
  }
});

test('upp boundary · the host composition is the ONE allowed importer', () => {
  assert.deepEqual(checkBoundaries([file('eip/host/index.mjs', '../upp/index.mjs')]), []);
});

// -------------------------------------------------------------- smoke test ------
test('upp boundary · the real repository respects every rule', () => {
  if (!exists('eip')) return; // absence is not a finding - the gate must not block its own cell
  const findings = checkBoundaries(readTuples(ROOT)).filter((f) => UPP_RULES.includes(f.rule));
  assert.deepEqual(findings, [], 'live import-direction violations in the UPP layer');
});
