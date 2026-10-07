// The Prompt Builder is OPTIONAL and reached as a SUBPROCESS, never imported. Absence is simulated
// the real way — a `sourceRoot` with no `tools/prompt-builder/cli.mjs` in it,
// which is what `rehearse:builder-removal` produces — so a contract in the target is REFERENCED with
// validity UNKNOWN and the first cell becomes a generic discovery cell. The unhappy paths are driven
// through the injected `run` seam, by EXIT CODE only (the only thing `compose-builder.mjs` may read);
// one test runs the REAL CLI, with `profileHere` choosing the richest installable profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './main.mjs';
import {
  BUILDER_CLI, builderCli, contractApproved, contractStatus, installFirstCell, summaryOf,
} from './compose-builder.mjs';
import { profileHere } from './fixtures/availability.mjs';
import { cleanup, listFiles, makeProject } from './fixtures/temp.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });
const EXAMPLE_CONTRACT = join(ROOT, 'examples', 'prompt-builder', 'project-contract.json');

/** A runner answering one exit code, starting no process. @param {number} status
 * @param {string} [stderr] @returns {import('./compose-builder.mjs').Runner} */
const exits = (status, stderr = '') => () => ({ ok: status === 0, status, stdout: '', stderr, truncated: false });

/** @param {string[]} args @returns {{ code: number, all: string }} */
function run(args) {
  let all = '';
  const write = (/** @type {string} */ text) => { all += text; return true; };
  const io = { stdout: { write }, stderr: { write }, env: { ...ENV } };
  return { code: main(['node', 'cli.mjs', ...args], io), all };
}

/** Whether the OPTIONAL Builder is in THIS checkout. `rehearse:builder-removal` makes one where it
 * is not, and that is the world this file exists to describe — so nothing here needs the Builder to
 * be present, except the one test that runs its real CLI. */
const BUILDER_HERE = existsSync(join(ROOT, 'tools', 'prompt-builder', 'cli.mjs'))
  && existsSync(EXAMPLE_CONTRACT);

/** A contract in the target: the repository's own APPROVED one (the Builder's committed example) where
 * that exists, otherwise a placeholder carrying the SAME approval block — `approved` is the one fact
 * Bootstrap reads locally, so it must read the same in both worlds, and nothing else of the content is
 * read without a Builder to validate it. @param {string} target @returns {void} */
const putContract = (target) => {
  mkdirSync(join(target, 'vault'), { recursive: true });
  if (BUILDER_HERE) copyFileSync(EXAMPLE_CONTRACT, join(target, 'vault', 'project-contract.json'));
  else writeFileSync(join(target, 'vault', 'project-contract.json'), `${JSON.stringify({
    schema: 'cellular-mode/project-contract', version: 1,
    approval: { approved: true, at: '2026-10-04T10:00:00.000Z' } }, null, 2)}\n`);
};

/** A source checkout whose only relevant property is that the Builder's CLI PATH exists in it. Every
 * test that injects `run` needs one: the verdict comes from the injected exit code and the file is
 * never executed. Standing on the repository instead would make those exit-code branches untestable
 * exactly where they matter most: the checkout `rehearse:builder-removal` creates.
 * @param {string} root @returns {string} */
const stubSource = (root) => {
  const source = join(root, 'stub-source');
  mkdirSync(join(source, ...BUILDER_CLI.slice(0, -1)), { recursive: true });
  writeFileSync(join(source, ...BUILDER_CLI), '// never executed: every caller injects `run`.\n');
  return source;
};

test('compose · the Builder is addressed as a path, never as an import specifier', () => {
  assert.deepEqual([...BUILDER_CLI], ['tools', 'prompt-builder', 'cli.mjs']);
  const cli = join(ROOT, 'tools', 'prompt-builder', 'cli.mjs');
  assert.equal(builderCli(ROOT), existsSync(cli) ? cli : null, 'the path is composed, never imported');
  assert.equal(builderCli(join(ROOT, 'docs')), null, 'a checkout without the module answers null');
  // No import of the optional module, static or dynamic — the claim the PB3 boundary rule makes for
  // the whole repository, restated here, where it is easiest to break.
  const text = readFileSync(join(ROOT, 'tools', 'bootstrap', 'compose-builder.mjs'), 'utf8');
  assert.doesNotMatch(text, /from\s*['"][^'"]*prompt-builder/, 'a static import appeared');
  assert.doesNotMatch(text, /import\s*\(\s*['"][^'"]*prompt-builder/, 'a dynamic import appeared');
});

test('compose · with no contract in the target, there is nothing to report', () => {
  const { root, target } = makeProject('nocontract');
  try {
    assert.deepEqual(contractStatus({ targetRoot: target, sourceRoot: ROOT }), { present: false });
  } finally {
    cleanup(root);
  }
});
test('compose · the Builder decides validity, and only by its exit code', () => {
  const { root, target } = makeProject('exitcodes');
  try {
    putContract(target);
    const base = { targetRoot: target, sourceRoot: stubSource(root), env: { ...ENV } };
    const ok = contractStatus({ ...base, run: exits(0) });
    assert.equal(ok.valid, true);
    assert.equal(ok.approved, true);
    const findings = contractStatus({ ...base, run: exits(2, 'the contract is not one the schema accepts') });
    assert.equal(findings.valid, false);
    assert.deepEqual(findings.errors, ['the contract is not one the schema accepts']);
    // Anything OTHER than 0 or 2 is not a verdict: it is UNKNOWN, and UNKNOWN is never true.
    for (const status of [1, 3, 5, 127]) {
      assert.equal(contractStatus({ ...base, run: exits(status, 'something else') }).valid, 'UNKNOWN',
        `exit ${status} must not be read as a verdict`);
    }
    // Unparsable is a finding, never an empty contract — and no subprocess is needed to say so.
    writeFileSync(join(target, 'vault', 'project-contract.json'), '{ not json');
    const broken = contractStatus({ ...base, run: exits(0) });
    assert.equal(broken.valid, false);
    assert.match(String(broken.errors?.[0]), /not valid JSON/);
  } finally {
    cleanup(root);
  }
});

test('compose · without the Builder, the contract is REFERENCED and its validity is UNKNOWN', () => {
  const { root, target } = makeProject('nobuilder');
  try {
    putContract(target);
    const status = contractStatus({ targetRoot: target, sourceRoot: join(ROOT, 'docs'), env: { ...ENV } });
    assert.equal(status.present, true);
    assert.equal(status.valid, 'UNKNOWN', 'an unavailable schema is unestablished, which is UNKNOWN and never true');
    assert.equal(status.reason, 'Prompt Builder not installed in the source');
    assert.equal(status.approved, true, 'the approval field is two keys; reading it needs no Builder');
    assert.equal(contractApproved({ approval: { approved: true, at: '2026-01-01T00:00:00.000Z' } }), true);
    assert.equal(contractApproved({ approval: { approved: true } }), false, 'an approval with no instant is not one');
    assert.equal(contractApproved({}), false);
    assert.equal(contractApproved(null), false);
  } finally {
    cleanup(root);
  }
});

test('compose · the real Builder CLI plans the first cell, as a subprocess, from an approved contract', () => {
  const { root, target } = makeProject('realcli');
  try {
    assert.equal(run(['new', target, '--profile', profileHere('standard'), '--confirm']).code, 0);
    putContract(target);
    const outcome = installFirstCell({
      targetRoot: target, sourceRoot: ROOT, approvals: new Set(['first-cell']),
      confirm: true, env: { ...ENV },
    });
    assert.equal(outcome.status, 'planned');
    assert.equal(outcome.via, BUILDER_HERE ? 'prompt-builder' : 'cellmode', outcome.detail);
    assert.match(outcome.detail, /not activated/);
    const cells = listFiles(join(target, 'vault', 'state', 'cells')).filter((rel) => rel !== 'README.md');
    assert.equal(cells.length, 1, cells.join(', '));
    assert.equal(cells.includes('project-discovery.md'), !BUILDER_HERE,
      'the Builder names the cell where it is installed; without it the fallback does');
    const index = readFileSync(join(target, 'vault', 'state', 'INDEX.md'), 'utf8');
    assert.match(index, /\| 📋 \|/);
    assert.doesNotMatch(index, /\| 🔵 \|/, 'planning is never activation, in any branch');
  } finally {
    cleanup(root);
  }
});

test('compose · every way the Builder can refuse falls back to a planned discovery cell', () => {
  const cases = [
    { tag: 'absent', source: () => join(ROOT, 'docs'), run: undefined, why: /Prompt Builder not installed/ },
    { tag: 'invalid', source: stubSource, run: exits(2, 'not approved'), why: /not one the Builder accepts/ },
    { tag: 'crash', source: stubSource, run: exits(127, 'no such program'), why: /not one the Builder accepts/ },
  ];
  for (const sample of cases) {
    const { root, target } = makeProject(`fallback-${sample.tag}`);
    try {
      assert.equal(run(['new', target, '--profile', 'minimal', '--confirm']).code, 0);
      putContract(target);
      const outcome = installFirstCell({
        targetRoot: target, sourceRoot: sample.source(root), approvals: new Set(['first-cell']),
        confirm: true, env: { ...ENV }, run: sample.run,
      });
      assert.equal(outcome.status, 'planned', `${sample.tag}: ${outcome.detail}`);
      assert.equal(outcome.via, 'cellmode');
      assert.equal(outcome.slug, 'project-discovery');
      assert.match(outcome.detail, sample.why);
      assert.match(outcome.detail, /not activated/);
      assert.ok(listFiles(join(target, 'vault', 'state', 'cells')).includes('project-discovery.md'));
    } finally {
      cleanup(root);
    }
  }
});

test('compose · a valid contract the accept step refuses still ends with a planned cell', () => {
  const { root, target } = makeProject('notapproved');
  try {
    assert.equal(run(['new', target, '--profile', 'minimal', '--confirm']).code, 0);
    putContract(target);
    // Exit 0 for the preview (valid), exit 2 for the accept (NOT_APPROVED) — the two-step reality.
    let call = 0;
    const outcome = installFirstCell({
      targetRoot: target, sourceRoot: stubSource(root), approvals: new Set(['first-cell']), confirm: true,
      env: { ...ENV },
      run: () => ({ ok: (call += 1) === 1, status: call === 1 ? 0 : 2, stdout: '', truncated: false,
        stderr: 'the project contract is not approved' }),
    });
    assert.equal(call, 2, 'validity and approval are two separate questions, asked in order');
    assert.equal(outcome.via, 'cellmode');
    assert.match(outcome.detail, /refused to plan its proposal \(exit 2\)/);
    assert.match(outcome.detail, /not approved/);
  } finally {
    cleanup(root);
  }
});
