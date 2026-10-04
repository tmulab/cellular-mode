#!/usr/bin/env node
// authorization.mjs — "is THIS state allowed to be called done?", asked by the hooks.
//
// Article 8 would be a style guide if the only thing enforcing it were an instruction to a
// model. So the same question is asked by git: `.githooks/pre-commit` (the staged tree),
// `.githooks/commit-msg` (the trailer that links the commit to the verified state) and
// `.githooks/pre-push` (every commit that is not yet on the remote). This module is the one
// place that answers it, so the hooks, the CLI and the release gate cannot disagree.
//
// FAIL CLOSED everywhere: no record, an unreadable record, a record for another state, a
// record with no byte-equivalence result, or git refusing to answer — all NOT authorized.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitRows, commitsToPush, rangeIsReadable, subjectOf, treeOf } from './commit-range.mjs';
import { repoState, stagedTreeId } from './fingerprint.mjs';
import {
  FINAL_EVIDENCE_PATH, findAuthorization, findTreeAuthorization, parseRecords, trailerFor,
} from './final-evidence.mjs';

/** @typedef {import('./final-evidence.mjs').FinalRecord} FinalRecord */
/** @typedef {{ ok: boolean, evidence: FinalRecord | null, reason: string }} Answer */

/** The sentence every refusal ends with. One command, named once. */
export const REMEDY = 'run `npm run verify:final` on this exact state';

/** Every record on disk, newest last. A missing file is simply "no evidence yet".
 * @param {string} [root] @returns {FinalRecord[]} */
export function readRecords(root = process.cwd()) {
  try {
    return parseRecords(readFileSync(join(root, FINAL_EVIDENCE_PATH), 'utf8'));
  } catch {
    return [];
  }
}

/** Is the CURRENT controlled state authorized? This is what a human asks before calling a
 * cell done: the answer covers the ✔ record too, because the vault file is part of the
 * fingerprint — writing it after a green suite is precisely what revokes the answer.
 * @param {string} [root] @returns {Answer} */
export function authorized(root = process.cwd()) {
  let fingerprint;
  try {
    fingerprint = repoState(root).fingerprint;
  } catch (error) {
    return { ok: false, evidence: null, reason: `state unknown: ${message(error)}` };
  }
  const record = findAuthorization(readRecords(root), fingerprint);
  if (record === null) {
    const where = `the current state (sha256:${fingerprint.slice(0, 12)}…)`;
    return { ok: false, evidence: null, reason: `no passing evidence for ${where} — ${REMEDY}` };
  }
  return { ok: true, evidence: record, reason: `authorized by the record of ${record.at}` };
}

/** Is a given git tree authorized? The hooks can only see trees, never working files.
 * @param {string} root @param {string} tree @returns {Answer} */
export function treeAuthorized(root, tree) {
  const records = readRecords(root);
  const record = findTreeAuthorization(records, tree);
  if (record === null) {
    // COMPATIBILITY, stated out loud: a record written before the byte-equivalence check
    // existed is still readable, and still authorizes nothing. Saying so beats "no evidence".
    const older = records.some((r) => r.ok && r.tree === tree && r.equivalent !== true);
    return {
      ok: false,
      evidence: null,
      reason: older
        ? `the passing evidence for tree ${tree} has no byte-equivalence result — ${REMEDY}`
        : `no passing evidence for tree ${tree} — ${REMEDY}`,
    };
  }
  return { ok: true, evidence: record, reason: `authorized by the record of ${record.at}` };
}

/** @param {unknown} error @returns {string} */
function message(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @typedef {{ commit: string, subject: string, tree: string, ok: boolean }} AuditRow */

/** Every commit in a range, with whether its tree has passing evidence. This is how a
 * `--no-verify` bypass becomes DETECTABLE after the fact: client-side hooks can be skipped,
 * but the absent evidence cannot be invented. The range itself is read by ./commit-range.mjs.
 * @param {string} root @param {ReadonlyArray<string>} revs @returns {AuditRow[]} */
export function auditRange(root, revs) {
  if (!rangeIsReadable(root, revs)) throw new Error(`git cannot read the range ${revs.join(' ')}`);
  const records = readRecords(root);
  return commitRows(root, revs).map((row) => ({
    ...row, ok: row.tree !== '' && findTreeAuthorization(records, row.tree) !== null,
  }));
}

/** @type {(line: string) => void} */
const write = (line) => {
  process.stdout.write(`${line}\n`);
};

/** @param {string} root @returns {number} */
function cmdCommit(root) {
  let tree;
  try {
    tree = stagedTreeId(root);
  } catch (error) {
    write(`❌ commit refused: ${message(error)}`);
    return 1;
  }
  const answer = treeAuthorized(root, tree);
  if (answer.ok) {
    write(`✅ staged tree ${tree.slice(0, 12)} is verified (${answer.evidence?.at})`);
    return 0;
  }
  write('❌ commit refused — Article 8: the staged state has not been verified AS IT STANDS.');
  write(`   ${answer.reason}`);
  write('   Stage everything you changed, then `npm run verify:final`, then commit.');
  return 1;
}

/** @param {string} root @returns {number} */
function cmdTrailer(root) {
  let answer;
  try {
    answer = treeAuthorized(root, stagedTreeId(root));
  } catch (error) {
    process.stderr.write(`no verified state to stamp: ${message(error)}\n`);
    return 1;
  }
  if (!answer.ok || answer.evidence === null) {
    process.stderr.write(`no verified state to stamp: ${answer.reason}\n`);
    return 1;
  }
  write(trailerFor(answer.evidence));
  return 0;
}

/** @param {string} root @param {string} remote @returns {number} */
function cmdPush(root, remote) {
  let stdinText = '';
  try {
    stdinText = readFileSync(0, 'utf8');
  } catch {
    stdinText = '';
  }
  const commits = commitsToPush(root, stdinText, remote);
  if (commits.length === 0) {
    write('✅ push: nothing to verify (no new commit)');
    return 0;
  }
  const records = readRecords(root);
  const unverified = commits.filter((commit) => {
    const tree = treeOf(root, commit);
    return tree === '' || findTreeAuthorization(records, tree) === null;
  });
  if (unverified.length === 0) {
    write(`✅ push: ${commits.length} commit(s), each with passing final-verification evidence`);
    return 0;
  }
  write(`❌ push refused — ${unverified.length} of ${commits.length} commit(s) carry unverified state:`);
  for (const commit of unverified) write(`   ${commit.slice(0, 12)} ${subjectOf(root, commit)}`);
  write(`   A commit may not be described as verified when its content was never checked — ${REMEDY}.`);
  return 1;
}

/** @param {string} root @param {string[]} revs @returns {number} */
function cmdAudit(root, revs) {
  if (revs.length === 0) {
    write('usage: node tools/gates/authorization.mjs audit <rev-range>');
    return 2;
  }
  const rows = auditRange(root, revs);
  for (const row of rows) write(`${row.ok ? '✅' : '❌'} ${row.commit.slice(0, 12)} ${row.subject}`);
  const bad = rows.filter((row) => !row.ok);
  write(bad.length === 0
    ? `✅ audit: ${rows.length} commit(s), every tree verified`
    : `❌ audit: ${bad.length} of ${rows.length} commit(s) have no evidence (unverified, possibly --no-verify)`);
  return bad.length === 0 ? 0 : 1;
}

/** @param {string[]} [argv] @returns {number} */
function main(argv = process.argv.slice(2)) {
  const root = process.cwd();
  const [command = 'status', ...rest] = argv;
  if (command === 'commit') return cmdCommit(root);
  if (command === 'trailer') return cmdTrailer(root);
  if (command === 'push') return cmdPush(root, rest[0] ?? '');
  if (command === 'audit') return cmdAudit(root, rest);
  if (command !== 'status') {
    write(`unknown command "${command}" — expected status, commit, trailer, push or audit`);
    return 2;
  }
  const answer = authorized(root);
  write(answer.ok ? `✅ AUTHORIZED — ${answer.reason}` : `❌ NOT AUTHORIZED — ${answer.reason}`);
  write('A ✔ cell record is only authorized while this line says AUTHORIZED: the vault file is');
  write('part of the fingerprint, so writing it after the suite revokes the authorization.');
  return answer.ok ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith('authorization.mjs')) {
  process.exitCode = main();
}
