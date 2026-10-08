// THE REGRESSION THE ADOPTION TRIAL ASKED FOR, END TO END, USING ONLY THE CLI.
//
// In the trial (findings A-11 / B-07 / B-08) the route from a fresh install to an accepted commit
// went through THREE hand edits of `vault/verification.json`, one of them to a key shape
// (`approval: { by: "human", at: <ISO> }`) that was documented nowhere. H6 says that route is a
// command. So this test is the proof, and its rule is: NO JSON IS EVER WRITTEN BY HAND here.
//
//   bootstrap new <target> --profile minimal --confirm --approve hooks   (article-8 + the hooks)
//   verification add node-tests -- node --test --confirm                 → PROPOSED
//   verification run node-tests --confirm                                → VERIFIED
//   verification mandatory node-tests --confirm                          → it can block a commit
//   node tools/gates/verify-final.mjs                                    → PASSES
//   git commit                                                           → ACCEPTED
//
// Then the two edges: `mandatory` on a PROPOSED check approves it without ever writing VERIFIED,
// and `revoke` puts final verification back to failing closed. Every process goes through
// `exec.run` (argv, no shell); the test SKIPS with a stated reason when git is unavailable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './main.mjs';
import { run } from './exec.mjs';
import { VERIFICATION_FILE } from './plan-constants.mjs';
import { cleanup, makeTarget } from './fixtures/temp.mjs';
import { identityFlags, initGit } from './fixtures/projects.mjs';

const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-07 12:00', PATH: process.env.PATH ?? '' });
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
const node = (dir, args) => run([process.execPath, ...args], { cwd: dir, timeoutMs: 600000 });
/** @param {string} dir @param {string} id @returns {Record<string, unknown>} */
const checkOf = (dir, id) => /** @type {Array<Record<string, unknown>>} */ (
  JSON.parse(readFileSync(join(dir, ...VERIFICATION_FILE.split('/')), 'utf8')).checks)
  .find((entry) => entry.id === id) ?? {};

test('verification · a new project goes from fail-closed to an accepted commit with the CLI alone',
  { skip, timeout: 900000 }, () => {
    const target = makeTarget('article8-cli');
    try {
      assert.equal(initGit(target, { commit: false }).ok, true, 'the target must be a real repository');
      // A repository with no commit yet has no HEAD; one seed commit makes the hooks meaningful.
      assert.equal(git(target, ['commit', '--allow-empty', '--quiet', '-m', 'seed']).ok, true);
      const installed = cli(['new', target, '--profile', 'minimal', '--confirm', '--approve', 'hooks,gitignore-block']);
      assert.equal(installed.code, 0, installed.all);
      assert.equal(git(target, ['config', '--get', 'core.hooksPath']).stdout.trim(), '.githooks');

      // (1) Fail closed, as installed: Bootstrap ran nothing in a `new` project, so it claims nothing.
      assert.deepEqual(JSON.parse(readFileSync(join(target, ...VERIFICATION_FILE.split('/')), 'utf8')).checks, []);
      const closed = node(target, ['tools/gates/verify-final.mjs']);
      assert.notEqual(closed.status, 0, 'an empty contract must authorize nothing');
      assert.match(`${closed.stdout}${closed.stderr}`, /no mandatory verification check/);

      // (2) add → run → mandatory. Three commands, no JSON, no second opinion about the schema.
      const added = cli(['verification', target, 'add', 'node-tests', '--', 'node', '--test', '--confirm']);
      assert.equal(added.code, 0, added.all);
      assert.equal(checkOf(target, 'node-tests').status, 'PROPOSED');
      const ran = cli(['verification', target, 'run', 'node-tests', '--confirm']);
      assert.equal(ran.code, 0, ran.all);
      assert.equal(checkOf(target, 'node-tests').status, 'VERIFIED', ran.all);
      const mandatory = cli(['verification', target, 'mandatory', 'node-tests', '--confirm']);
      assert.equal(mandatory.code, 0, mandatory.all);
      assert.equal(checkOf(target, 'node-tests').mandatory, true);

      // (3) The gate, and then the commit the hook used to refuse.
      assert.equal(git(target, ['add', '-A']).ok, true);
      const refused = git(target, ['commit', '-m', 'adopt cellular mode']);
      assert.notEqual(refused.status, 0, 'the staged tree is not verified yet');
      assert.match(`${refused.stdout}${refused.stderr}`, /node tools\/gates\/verify-final\.mjs/,
        'and the hook names a command this project actually has (A-03 / B-06)');
      assert.equal(`${refused.stdout}${refused.stderr}`.includes('npm run verify:final`, then commit'), false,
        'never the npm script alone: Bootstrap does not write one');

      const verified = node(target, ['tools/gates/verify-final.mjs']);
      assert.equal(verified.status, 0, `${verified.stdout}${verified.stderr}`);
      assert.match(verified.stdout, /suite from vault\/verification\.json — 2 mandatory check\(s\)/);
      assert.match(verified.stdout, /final verification PASSED/);
      const accepted = git(target, ['commit', '-m', 'adopt cellular mode']);
      assert.equal(accepted.status, 0, `${accepted.stdout}${accepted.stderr}`);
      assert.match(git(target, ['log', '-1', '--pretty=%B']).stdout, /Verified-State: sha256:[0-9a-f]{64} tree:[0-9a-f]{40}/);

      // (4) mandatory on a PROPOSED check: approval recorded, label untouched, gate still runs it.
      cli(['verification', target, 'add', 'proposed-only', '--', 'node', '--version', '--confirm']);
      const approved = cli(['verification', target, 'mandatory', 'proposed-only', '--confirm']);
      assert.equal(approved.code, 0, approved.all);
      assert.equal(checkOf(target, 'proposed-only').status, 'PROPOSED', 'an approval is not evidence');
      assert.deepEqual(checkOf(target, 'proposed-only').approval, { by: 'human', at: '2026-10-07T12:00:00.000Z' });
      assert.match(node(target, ['tools/gates/verify-final.mjs']).stdout, /3 mandatory check\(s\)/);

      // (5) revoke both, and final verification is fail-closed again.
      for (const id of ['node-tests', 'proposed-only']) {
        assert.equal(cli(['verification', target, 'revoke', id, '--confirm']).code, 0);
      }
      const reclosed = node(target, ['tools/gates/verify-final.mjs']);
      assert.notEqual(reclosed.status, 0, 'revoke must return the gate to fail-closed');
      assert.match(`${reclosed.stdout}${reclosed.stderr}`, /no mandatory verification check/);
      assert.equal(checkOf(target, 'node-tests').status, 'VERIFIED',
        'and what was established stays established: revoke withdraws consent, not evidence');
    } finally {
      cleanup(target);
    }
  });
