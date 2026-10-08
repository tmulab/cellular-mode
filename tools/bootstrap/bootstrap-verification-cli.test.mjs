// `bootstrap verification` — the command that replaced hand-editing `vault/verification.json`
// (H6, trial findings A-11 / B-07 / B-08). What is asserted here is the CONSENT shape and the
// honesty of the labels, because those are the two things a convenience command destroys first:
// a tool that approves on one flag, or that writes VERIFIED because a human typed a command, is
// worse than the hand edit it replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './main.mjs';
import { parseVerificationArgs } from './verification-cli.mjs';
import { VERIFICATION_FILE } from './plan-constants.mjs';
import { REPLACEABLE, replaceEvolving } from './writer.mjs';
import { cleanup, makeTarget } from './fixtures/temp.mjs';

const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-07 12:00', PATH: process.env.PATH ?? '' });

/** @param {string[]} args @returns {{ code: number, all: string }} */
function cli(args) {
  let all = '';
  const write = (/** @type {string} */ text) => { all += text; return true; };
  return { code: main(['node', 'cli.mjs', ...args], { stdout: { write }, stderr: { write }, env: { ...ENV } }), all };
}

/** A target holding nothing but an empty, valid contract — what a fresh `new` leaves behind.
 * @returns {string} */
function targetWithContract() {
  const dir = makeTarget('verification');
  mkdirSync(join(dir, 'vault'), { recursive: true });
  writeFileSync(join(dir, 'vault', 'verification.json'), `${JSON.stringify({
    schema: 'cellular-mode/verification', version: 1, project: 'demo', checks: [],
  }, null, 2)}\n`);
  return dir;
}

/** @param {string} dir @returns {Record<string, unknown>} */
const contract = (dir) => JSON.parse(readFileSync(join(dir, ...VERIFICATION_FILE.split('/')), 'utf8'));
/** @param {string} dir @param {string} id @returns {Record<string, unknown>} */
const checkOf = (dir, id) => /** @type {Array<Record<string, unknown>>} */ (contract(dir).checks)
  .find((entry) => entry.id === id) ?? {};

test('verification · `--` hands the argv through verbatim, and the flags are found anywhere', () => {
  const after = parseVerificationArgs(['dir', 'add', 'node-tests', '--', 'node', '--test', '--confirm']);
  assert.deepEqual(after.argv, ['node', '--test'], '--confirm is a flag of THIS cli, not an argument');
  assert.equal(after.confirm, true);
  assert.deepEqual([after.target, after.sub, after.rest], ['dir', 'add', ['node-tests']]);
  const before = parseVerificationArgs(['dir', 'add', 'node-tests', '--confirm', '--', 'node', '--test']);
  assert.deepEqual(before, after, 'either order means the same thing');
  assert.deepEqual(parseVerificationArgs(['dir', 'list', '--json']).argv, null, 'no `--`, no argv');
});

test('verification · every mutating subcommand needs --confirm and shows the exact change', () => {
  const dir = targetWithContract();
  try {
    const previewed = cli(['verification', dir, 'add', 'node-tests', '--', 'node', '--test']);
    assert.equal(previewed.code, 5, previewed.all);
    assert.match(previewed.all, /Would add to vault\/verification\.json/);
    assert.match(previewed.all, /node-tests \[PROPOSED\] {2}argv: node --test/);
    assert.deepEqual(contract(dir).checks, [], 'and it wrote nothing at all');

    assert.equal(cli(['verification', dir, 'add', 'node-tests', '--', 'node', '--test', '--confirm']).code, 0);
    assert.equal(checkOf(dir, 'node-tests').status, 'PROPOSED', 'a human typing a command has not run it');
    assert.equal(checkOf(dir, 'node-tests').mandatory, false);
    assert.equal(checkOf(dir, 'node-tests').approval, null);
    assert.match(String(checkOf(dir, 'node-tests').basis), /^added by the human on 2026-10-07T12:00/);

    for (const sub of ['run', 'approve', 'mandatory', 'revoke']) {
      const held = cli(['verification', dir, sub, 'node-tests']);
      assert.equal(held.code, 5, `${sub}: ${held.all}`);
      assert.match(held.all, /Nothing was written\. Re-run with --confirm/);
      assert.equal(checkOf(dir, 'node-tests').status, 'PROPOSED', `${sub} must not have written`);
      assert.equal(checkOf(dir, 'node-tests').approval, null, `${sub} must not have approved`);
    }
  } finally {
    cleanup(dir);
  }
});

test('verification · mandatory on a PROPOSED check approves it and leaves the label alone', () => {
  const dir = targetWithContract();
  try {
    cli(['verification', dir, 'add', 'node-tests', '--', 'node', '--version', '--confirm']);
    const made = cli(['verification', dir, 'mandatory', 'node-tests', '--confirm']);
    assert.equal(made.code, 0, made.all);
    assert.match(made.all, /Its label is unchanged: PROPOSED/);
    assert.equal(checkOf(dir, 'node-tests').mandatory, true);
    assert.equal(checkOf(dir, 'node-tests').status, 'PROPOSED', 'approval is never evidence');
    assert.deepEqual(checkOf(dir, 'node-tests').approval, { by: 'human', at: '2026-10-07T12:00:00.000Z' });

    const listed = cli(['verification', dir, 'list']);
    assert.match(listed.all, /1 mandatory check\(s\)/);
    const revoked = cli(['verification', dir, 'revoke', 'node-tests', '--confirm']);
    assert.equal(revoked.code, 0, revoked.all);
    assert.match(revoked.all, /verify-final will fail closed: no mandatory check/);
    assert.equal(checkOf(dir, 'node-tests').mandatory, false);
    assert.equal(checkOf(dir, 'node-tests').approval, null);
    assert.equal(checkOf(dir, 'node-tests').status, 'PROPOSED', 'and the label still does not move');
  } finally {
    cleanup(dir);
  }
});

test('verification · only a run that PASSES writes VERIFIED; a failing one changes nothing', () => {
  const dir = targetWithContract();
  try {
    cli(['verification', dir, 'add', 'fails', '--', process.execPath, '-e', 'process.exit(3)', '--confirm']);
    const failed = cli(['verification', dir, 'run', 'fails', '--confirm']);
    assert.equal(failed.code, 2, failed.all);
    assert.match(failed.all, /status failed · exit 3/);
    assert.match(failed.all, /The contract is UNCHANGED: "fails" stays PROPOSED/);
    assert.equal(checkOf(dir, 'fails').status, 'PROPOSED');

    cli(['verification', dir, 'add', 'passes', '--', process.execPath, '-e', 'process.exit(0)', '--confirm']);
    const passed = cli(['verification', dir, 'run', 'passes', '--confirm']);
    assert.equal(passed.code, 0, passed.all);
    assert.equal(checkOf(dir, 'passes').status, 'VERIFIED');
    assert.match(String(checkOf(dir, 'passes').basis), /^ran and passed 2026-10-07T12:00:00\.000Z \(argv: /);
    assert.equal(checkOf(dir, 'passes').mandatory, false, 'passing is not consent to block commits');
  } finally {
    cleanup(dir);
  }
});

test('verification · list explains every non-mandatory check, and --json carries the same data', () => {
  const dir = targetWithContract();
  try {
    const empty = cli(['verification', dir, 'list']);
    assert.equal(empty.code, 0, empty.all);
    assert.match(empty.all, /verify-final will fail closed: no mandatory check/);
    assert.match(empty.all, /It holds no check at all/);
    cli(['verification', dir, 'add', 'node-tests', '--', 'node', '--version', '--confirm']);
    const listed = cli(['verification', dir, 'list']);
    assert.match(listed.all, /NOT MANDATORY: PROPOSED: nobody ran it here and nobody approved it/);
    assert.match(listed.all, /next: {5}node tools\/bootstrap\/cli\.mjs verification <target> run node-tests --confirm/);
    assert.equal(listed.all.includes(dir), false, 'and no machine path is ever printed');
    const asJson = JSON.parse(cli(['verification', dir, 'list', '--json']).all);
    assert.equal(asJson.failsClosed, true);
    assert.equal(asJson.mandatoryCount, 0);
    assert.deepEqual(asJson.checks[0].argv, ['node', '--version']);
    assert.equal(asJson.checks[0].ready, false);
    assert.match(String(asJson.checks[0].why), /nobody ran it here/);
    assert.match(String(asJson.checks[0].next), /run node-tests --confirm/);
  } finally {
    cleanup(dir);
  }
});

test('verification · refusals: a shell wrapper, an unknown id, an unknown subcommand, a bad file', () => {
  const dir = targetWithContract();
  try {
    for (const argv of [['sh', '-c', 'ls'], ['cmd', '/c', 'dir'], ['npm run test']]) {
      const refused = cli(['verification', dir, 'add', 'bad', '--', ...argv, '--confirm']);
      assert.equal(refused.code, 1, `${argv.join(' ')}: ${refused.all}`);
      assert.match(refused.all, /refused that command: argv/);
      assert.deepEqual(contract(dir).checks, [], 'nothing was written');
    }
    const unknown = cli(['verification', dir, 'run', 'nope', '--confirm']);
    assert.equal(unknown.code, 1, unknown.all);
    assert.match(unknown.all, /no check "nope" in the contract/);
    assert.equal(cli(['verification', dir, 'frobnicate']).code, 1);
    assert.equal(cli(['verification', dir]).code, 1);
    assert.match(cli(['verification', dir, 'add', 'x']).all, /add needs the command after a `--`/);

    writeFileSync(join(dir, 'vault', 'verification.json'), '{ "schema": "mine" }\n');
    const bad = cli(['verification', dir, 'list']);
    assert.equal(bad.code, 2, bad.all);
    assert.match(bad.all, /is not a cellular-mode\/verification v1/);
    assert.equal(readFileSync(join(dir, 'vault', 'verification.json'), 'utf8').includes('mine'), true,
      'an unreadable contract is REFUSED, never repaired');
  } finally {
    cleanup(dir);
  }
});

test('verification · the evolving writer opens for one path and refuses every other', () => {
  const dir = targetWithContract();
  try {
    assert.deepEqual([...REPLACEABLE], [VERIFICATION_FILE], 'the list is the boundary');
    for (const rel of ['AGENTS.md', 'vault/install-manifest.json', 'vault/state/log.md',
      '../escape.json', 'vault/verification.json.bak']) {
      assert.throws(() => replaceEvolving(dir, rel, 'x'), /refused/, rel);
    }
    const record = replaceEvolving(dir, VERIFICATION_FILE, '{"schema":"cellular-mode/verification","version":1,"checks":[]}\n');
    assert.equal(record.path, VERIFICATION_FILE);
    assert.match(record.sha256After, /^[0-9a-f]{64}$/);
  } finally {
    cleanup(dir);
  }
});
