// The transport layer's import direction, as a gate.
//
// `eip/upp-host/` is where the protocol stops being pure: it spawns a program, opens a
// socket and reads the operator's authorisation file. Two claims about it are only worth
// something if a gate checks them, so each is a rule in `tools/gates/boundaries.mjs` and a
// fixture here. Fixtures, not the real directory: a rule stated on in-memory tuples says
// what the rule IS, and the repository is checked separately as a smoke test.
//
//   1. upp-host may import eip/upp, eip/sdk, its own directory and the kernel PUBLIC ENTRY.
//   2. only the host composition may import upp-host — every layer below it is denied, so a
//      transport can never become load-bearing for the kernel, a plugin or the pure protocol.
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

const HOST_RULES = ['upp-host-imports-protocol-kernel-entry-and-sdk', 'upp-host-is-imported-by-the-host-only'];

test('upp-host boundary · both rules exist, each with a stated reason', () => {
  for (const id of HOST_RULES) {
    const rule = RULES.find((r) => r.id === id);
    assert.ok(rule !== undefined, `rule "${id}" is missing`);
    assert.ok((rule?.why ?? '').length > 40, `rule "${id}" must say why it exists`);
  }
});

test('upp-host boundary · GREEN on the layout this cell built', () => {
  const files = [
    file('eip/upp-host/channel.mjs', '../upp/index.mjs', './lines.mjs', 'node:child_process'),
    file('eip/upp-host/adapter.mjs', '../sdk/index.mjs', './types.mjs'),
    file('eip/upp-host/config.mjs', '../upp/sections.mjs'),
    file('eip/upp-host/end-to-end.test.mjs', '../kernel/index.mjs', './adapter.mjs'),
    file('eip/upp-host/fixtures/harness.mjs', '../canonical.mjs', 'node:fs/promises'),
    file('eip/host/upp-composition.mjs', '../upp-host/index.mjs', '../kernel/index.mjs', 'node:http'),
  ];
  assert.deepEqual(checkBoundaries(files), []);
});

test('upp-host boundary · RED when a transport reaches past its four allowances', () => {
  const files = [
    file('eip/upp-host/channel.mjs', '../kernel/execute.mjs'),
    file('eip/upp-host/adapter.mjs', '../host/index.mjs'),
    file('eip/upp-host/operator.mjs', '../plugins/text-stats/index.mjs'),
    file('eip/upp-host/config.mjs', '../../tools/cellmode/check.mjs'),
    file('eip/upp-host/mode.mjs', '../../tools/adaptive/modes.mjs'),
  ];
  assert.deepEqual(ids(checkBoundaries(files)), [
    'upp-host-imports-protocol-kernel-entry-and-sdk', 'upp-host-imports-protocol-kernel-entry-and-sdk',
    'upp-host-imports-protocol-kernel-entry-and-sdk', 'upp-host-imports-protocol-kernel-entry-and-sdk',
    'upp-host-imports-protocol-kernel-entry-and-sdk',
  ]);
});

test('upp-host boundary · RED when anything below composition imports a transport', () => {
  /** @type {Array<[string, string]>} */
  const cases = [
    ['eip/sdk/define.mjs', '../upp-host/index.mjs'],
    ['eip/kernel/execute.mjs', '../upp-host/process-transport.mjs'],
    ['eip/upp/messages.mjs', '../upp-host/channel.mjs'],
    ['eip/orchestration/gateway.mjs', '../upp-host/index.mjs'],
    ['eip/plugins/text-stats/index.mjs', '../../upp-host/index.mjs'],
    ['tools/cellmode/check.mjs', '../../eip/upp-host/index.mjs'],
    ['tools/gates/size.mjs', '../../eip/upp-host/index.mjs'],
    ['skills/cell/helper.mjs', '../../eip/upp-host/index.mjs'],
  ];
  for (const [path, specifier] of cases) {
    const findings = checkBoundaries([file(path, specifier)]);
    assert.ok(ids(findings).includes('upp-host-is-imported-by-the-host-only'),
      `${path} importing ${specifier} must be refused, got ${JSON.stringify(ids(findings))}`);
  }
});

test('upp-host boundary · the pure protocol layer still may not be reached around', () => {
  // `eip/upp-host` is allowed `eip/upp`; `eip/upp` is NOT allowed `eip/upp-host`. The two
  // prefixes share seven characters, which is exactly the kind of near-miss a prefix rule
  // gets wrong, so it is asserted rather than assumed.
  assert.deepEqual(ids(checkBoundaries([file('eip/upp/framing.mjs', '../upp-host/lines.mjs')])),
    ['upp-imports-sdk-only', 'upp-host-is-imported-by-the-host-only']);
  assert.deepEqual(checkBoundaries([file('eip/upp-host/lines.mjs', '../upp/index.mjs')]), []);
});

test('upp-host boundary · the real repository is green under both rules', () => {
  if (!exists('eip/upp-host')) return; // the gate must not fail on an absent directory
  const findings = checkBoundaries(readTuples(ROOT))
    .filter((f) => HOST_RULES.includes(f.rule));
  assert.deepEqual(findings, []);
});
