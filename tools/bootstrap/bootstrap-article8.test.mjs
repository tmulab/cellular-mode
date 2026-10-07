// ARTICLE 8, END TO END, IN A TARGET — the one test that answers the question Cell 5 exists for:
// after `bootstrap existing --confirm --approve hooks`, does the installed method actually refuse
// an unverified commit in SOMEBODY ELSE'S repository, and accept it after `verify-final`?
//
// Nothing is stubbed. A real git repository, the real CLI, the real hooks, the real gates copied
// as files, and the real `vault/verification.json` the install generated — then edited the way a
// human would, because a contract that mandates nothing is exactly what Bootstrap leaves behind:
// it ran nothing, so it established nothing, and `verify-final` FAILS CLOSED until a human
// approves a check. That refusal is asserted first, before any check is added.
//
// Every process here goes through `exec.run` (argv, no shell), because `node:child_process` is
// confined to that one module. The test SKIPS, with a stated reason, when git is unavailable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './main.mjs';
import { run } from './exec.mjs';
import { cleanup } from './fixtures/temp.mjs';
import { identityFlags, initGit, makeFixture } from './fixtures/projects.mjs';

const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });
const GIT = run(['git', '--version']).ok;
const skip = GIT ? false : 'git is not available on this machine';
const MINUTE = 120000;

/** @param {string[]} args @returns {{ code: number, all: string }} */
function cli(args) {
  let all = '';
  const write = (/** @type {string} */ text) => { all += text; return true; };
  return { code: main(['node', 'cli.mjs', ...args], { stdout: { write }, stderr: { write }, env: { ...ENV } }), all };
}

/** @param {string} dir @param {ReadonlyArray<string>} args */
const git = (dir, args) => run(['git', ...identityFlags(), ...args], { cwd: dir, timeoutMs: MINUTE });
/** @param {string} dir @param {ReadonlyArray<string>} args */
const node = (dir, args) => run([process.execPath, ...args], { cwd: dir, timeoutMs: MINUTE });
/** @param {string} dir @param {string} rel @returns {string} */
const read = (dir, rel) => readFileSync(join(dir, ...rel.split('/')), 'utf8');

/** The contract a HUMAN writes after running their own check once: one mandatory, VERIFIED check
 * whose argv exits 0 and writes nothing. @returns {string} */
const humanContract = () => `${JSON.stringify({
  schema: 'cellular-mode/verification',
  version: 1,
  checks: [{
    id: 'unit', argv: [process.execPath, '-e', 'process.exit(0)'], status: 'VERIFIED',
    basis: 'ran by hand in this target on 2026-10-06', mandatory: true, approval: null,
  }],
}, null, 2)}\n`;

test('article 8 · an adopted project refuses an unverified commit and accepts a verified one',
  { skip, timeout: 600000 }, () => {
    const target = makeFixture('node');
    try {
      assert.equal(initGit(target).ok, true, 'the fixture must be a real repository');
      const installed = cli(['existing', target, '--profile', 'minimal', '--confirm',
        '--approve', 'hooks,ci-workflow,gitignore-block']);
      assert.equal(installed.code, 0, installed.all);

      // (1) The two integrations this cell performs, on disk rather than in a sentence.
      assert.equal(git(target, ['config', '--get', 'core.hooksPath']).stdout.trim(), '.githooks');
      assert.match(installed.all, /hooks \[applied\]/);
      assert.ok(existsSync(join(target, '.github', 'workflows', 'cellular-verify.yml')));
      assert.match(read(target, '.github/workflows/cellular-verify.yml'), /permissions:\n {2}contents: read/);
      const manifest = JSON.parse(read(target, 'vault/install-manifest.json'));
      const integrations = /** @type {Array<{ kind: string, status: string }>} */ (manifest.integrations);
      assert.equal(integrations.find((entry) => entry.kind === 'hooks')?.status, 'applied');
      assert.equal(integrations.find((entry) => entry.kind === 'ci')?.status, 'applied');

      // (2) The contract Bootstrap generated mandates NOTHING, so final verification fails closed.
      const generated = JSON.parse(read(target, 'vault/verification.json'));
      assert.ok(generated.checks.length > 0, 'the discovered commands are recorded');
      assert.equal(generated.checks.every((/** @type {{ mandatory: boolean }} */ c) => !c.mandatory), true);
      assert.equal(generated.checks.every((/** @type {{ status: string }} */ c) => c.status === 'INFERRED'), true,
        'nothing ran, so nothing is VERIFIED');
      const closed = node(target, ['tools/gates/verify-final.mjs']);
      assert.notEqual(closed.status, 0, 'a contract with no mandatory check must NOT authorize anything');
      assert.match(`${closed.stdout}${closed.stderr}`, /no mandatory verification check/);

      // (3) The human approves one check by writing it, as the install told them to.
      writeFileSync(join(target, 'vault', 'verification.json'), humanContract());
      assert.equal(git(target, ['add', '-A']).ok, true);
      const refused = git(target, ['commit', '-m', 'adopt cellular mode']);
      assert.notEqual(refused.status, 0, 'the pre-commit hook must refuse an unverified tree');
      assert.match(`${refused.stdout}${refused.stderr}`, /verif/i);

      // (4) Final verification, then the same commit.
      const verified = node(target, ['tools/gates/verify-final.mjs']);
      assert.equal(verified.status, 0, `${verified.stdout}${verified.stderr}`);
      assert.match(verified.stdout, /suite from vault\/verification\.json — 2 mandatory check\(s\)/);
      assert.match(verified.stdout, /final verification PASSED/);
      const accepted = git(target, ['commit', '-m', 'adopt cellular mode']);
      assert.equal(accepted.status, 0, `${accepted.stdout}${accepted.stderr}`);
      assert.match(git(target, ['log', '-1', '--pretty=%B']).stdout, /Verified-State: sha256:[0-9a-f]{64} tree:[0-9a-f]{40}/);

      // (5) And the rule itself: one later write revokes the authorization.
      writeFileSync(join(target, 'AFTERWARDS.md'), '# written after verification\n');
      assert.equal(git(target, ['add', '-A']).ok, true);
      assert.notEqual(git(target, ['commit', '-m', 'one more thing']).status, 0,
        'a modification after the verified state must invalidate the authorization');
    } finally {
      cleanup(target);
    }
  });
