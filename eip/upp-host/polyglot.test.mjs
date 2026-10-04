// U28/U29: the same corpus, against every implementation whose toolchain is on this machine.
//
// The rule this file exists to enforce is the one that is easiest to break by accident: an
// ABSENT toolchain is `skip`, not `pass`. `node --test` counts a skipped test separately, the
// reason is printed, and no assertion runs — so a language that was never executed cannot
// appear in a green count. An implementation that IS present must pass every case; there is no
// partial credit and no "known failure" list.
//
// The C++ row is `UNEXECUTED` by construction: `prepare()` refuses, so there is nothing to run
// and the reason says why. That is the honest shape for source nobody here has compiled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPLEMENTATIONS, ROOT } from './conformance-impl.mjs';
import { probe } from './toolchains.mjs';
import { loadCases, runImplementation, summarize } from './conformance-run.mjs';

const CASES = loadCases();

test('polyglot · the implementation table is complete and each row says what it is', () => {
  assert.deepEqual(IMPLEMENTATIONS.map((impl) => impl.name),
    ['in-process', 'node', 'python', 'java', 'rust', 'cpp']);
  for (const impl of IMPLEMENTATIONS) {
    assert.ok(impl.language.length > 8, `${impl.name} must name its language`);
    assert.ok(['process', 'in-process', 'source-only'].includes(impl.kind), impl.name);
  }
});

test('polyglot · a prepare() refusal always carries a status and a reason', () => {
  for (const impl of IMPLEMENTATIONS) {
    const prepared = impl.prepare();
    if (prepared.ok) {
      assert.ok(prepared.command.length > 0 || impl.kind === 'in-process', impl.name);
      continue;
    }
    assert.ok(['SKIPPED', 'UNEXECUTED'].includes(prepared.status), impl.name);
    assert.ok(prepared.reason.length > 20, `${impl.name}: a refusal must explain itself`);
  }
});

test('polyglot · C++ is UNEXECUTED, and the runner will not say anything else', async () => {
  const report = await runImplementation('cpp', { cases: CASES });
  assert.equal(report.status, 'UNEXECUTED');
  assert.equal(report.results.length, 0, 'nothing was replayed, so nothing is claimed');
  assert.match(report.reason ?? '', /no C\+\+ compiler/);
  assert.equal(summarize([report])[0]?.includes('PASS'), false);
});

test('polyglot · an absent executable is a REASON, never an exception', () => {
  const missing = probe(['a-program-nobody-has-installed-9f3c', '--version']);
  assert.equal(missing.ok, false);
  assert.ok(!missing.ok && missing.reason.length > 10, 'the reason goes straight into the record');
  assert.equal(probe([]).ok, false);
});

test('polyglot · a refused prepare is SKIPPED with zero cases, and never reads as PASS', async () => {
  // The guard against the one failure mode that would make this whole suite worthless: a row
  // whose toolchain is absent must contribute NOTHING. Driven through a synthetic row, because
  // on a machine that has every toolchain the real rows can never reach this branch.
  const absent = {
    name: 'absent',
    language: 'a language nobody installed here',
    kind: /** @type {'process'} */ ('process'),
    dir: ROOT,
    prepare: () => /** @type {import('./conformance-impl.mjs').Prepared} */ ({
      ok: false, status: /** @type {'SKIPPED'} */ ('SKIPPED'), reason: 'the toolchain is not on this machine',
    }),
  };
  const report = await runImplementation(absent, { cases: CASES });
  assert.equal(report.status, 'SKIPPED');
  assert.equal(report.results.length, 0, 'nothing was replayed, so nothing may be counted');
  assert.equal(report.version, undefined);
  const line = summarize([report])[0] ?? '';
  assert.equal(line.includes('PASS'), false);
  assert.match(line, /not on this machine/);
});

for (const impl of IMPLEMENTATIONS.filter((candidate) => candidate.kind !== 'source-only')) {
  test(`polyglot · ${impl.name} answers all ${CASES.length} conformance cases`,
    { timeout: 600_000 }, async (t) => {
      const prepared = impl.prepare();
      if (!prepared.ok) {
        // SKIPPED is not PASS. The reason is printed and no assertion below runs.
        t.skip(`${prepared.status}: ${prepared.reason}`);
        return;
      }
      const report = await runImplementation(impl, { cases: CASES });
      const failures = report.results.filter((result) => !result.ok)
        .map((result) => `${result.name}: ${result.breaches.join(' | ')}`);
      assert.deepEqual(failures, [], `${impl.name} (${prepared.version})`);
      assert.equal(report.results.length, CASES.length);
      assert.equal(report.status, 'PASS');
    });
}

test('polyglot · at least two languages were actually executed', { timeout: 600_000 }, async () => {
  // The claim "polyglot" is worth nothing if only JavaScript ran. This is the guard against the
  // whole suite going green on a machine with no Python, no JDK and no rustc: it does not
  // demand a particular language, it demands that the word means something.
  const executed = IMPLEMENTATIONS.filter((impl) => impl.prepare().ok)
    .map((impl) => impl.name);
  assert.ok(executed.includes('in-process') && executed.includes('node'), 'JavaScript must run');
  const other = executed.filter((name) => name !== 'in-process' && name !== 'node');
  assert.ok(other.length >= 1,
    `polyglot needs a non-JavaScript implementation; only ${executed.join(', ')} were available`);
});
