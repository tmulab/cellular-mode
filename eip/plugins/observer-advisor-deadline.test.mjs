// The advisor's deadline, proved in a CHILD PROCESS — because the defect it guards against is
// invisible in-process.
//
// `call-model.mjs` used to call `timer.unref()` on its deadline timer. An unref'd timer does not
// keep the event loop alive, so when the ONLY pending work was the model call itself — exactly the
// case of an adapter that never answers — Node ran out of refs, decided there was nothing left to
// do, and tore the loop down before the deadline could fire. The promise never settled. Under
// `node --test` on Node 22 that surfaced as "Promise resolution is still pending but the event loop
// has already resolved": V20 and V21 of observer-advisor-limits.test.mjs were CANCELLED, not run.
// Node 24's runner happened to keep the loop alive long enough to hide it, which is why CI found it
// and this machine did not.
//
// A test living inside `node --test` cannot prove the fix: the runner itself keeps handles alive.
// So each case below spawns `process.execPath` on a tiny script whose ONLY pending work is the
// call, and reads the child's exit code. Before the fix the child exits 13 (unsettled top-level
// await) and prints no verdict; after it, the child prints the refusal and exits 0. That property
// holds on every Node version.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callModel } from './observer-advisor/call-model.mjs';

const CALL_MODEL = new URL('./observer-advisor/call-model.mjs', import.meta.url).href;

/** The adapter source each child uses, as text: a child is a separate process and cannot be
 * handed a closure. `answer` is the body of `complete`.
 * @param {string} body @returns {string} */
const adapterSource = (body) => `const adapter = { id: 'never', describe: () => ({}), complete: ${body} };`;

/**
 * Runs a child whose only pending work is one `callModel`, and reports what it did.
 * @param {string} source the script body, with `callModel` already imported
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
function child(source) {
  const dir = mkdtempSync(join(tmpdir(), 'advisor-deadline-'));
  try {
    const file = join(dir, 'case.mjs');
    writeFileSync(file, `import { callModel } from ${JSON.stringify(CALL_MODEL)};\n${source}\n`, 'utf8');
    const out = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 20000 });
    return { status: out.status, stdout: out.stdout ?? '', stderr: out.stderr ?? '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The call every case makes, with the deadline short enough to keep the suite fast.
 * @param {string} [extra] @returns {string} */
const CALL = (extra = '') => `const call = callModel({
  adapter, system: 's', context: 'c', question: 'q', maxOutputChars: 100, timeoutMs: 50${extra},
});
try {
  const text = await call;
  process.stdout.write('ANSWERED ' + String(text) + '\\n');
} catch (error) {
  process.stdout.write('REFUSED ' + (error instanceof Error ? error.message : String(error)) + '\\n');
}
const timers = process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout');
process.stdout.write('TIMERS ' + timers.length + '\\n');`;

test('deadline · an adapter that never answers is REFUSED even when nothing else holds the loop', () => {
  const run = child(`${adapterSource('() => new Promise(() => {})')}\n${CALL()}`);
  assert.equal(run.status, 0,
    `the child must settle and exit 0 (13 means the top-level await never settled)\n${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /REFUSED .*did not answer within 50 ms/,
    `the deadline must fire and name itself\n${run.stdout}${run.stderr}`);
});

test('deadline · a successful call leaves no timer behind', () => {
  const run = child(`${adapterSource("async () => ({ text: 'ok' })")}\n${CALL()}`);
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /ANSWERED ok/);
  assert.match(run.stdout, /TIMERS 0/, 'a settled call must have cleared its deadline timer');
});

test('deadline · a failing call leaves no timer behind', () => {
  const run = child(`${adapterSource("async () => { throw new Error('adapter broke'); }")}\n${CALL()}`);
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /REFUSED adapter broke/);
  assert.match(run.stdout, /TIMERS 0/, 'a rejected call must have cleared its deadline timer');
});

test('deadline · an external abort settles the call and leaves no timer behind', () => {
  const run = child(`${adapterSource('() => new Promise(() => {})')}
const controller = new AbortController();
setTimeout(() => controller.abort(), 10);
${CALL(', signal: controller.signal')}`);
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /REFUSED /, 'the caller\'s own abort must settle the call, not hang it');
  assert.match(run.stdout, /TIMERS 0/, 'an aborted call must have cleared its deadline timer');
});

test('deadline · the timeout message is the documented one, and the adapter sees the abort', async () => {
  /** @type {AbortSignal | undefined} */
  let seen;
  const adapter = /** @type {import('./observer-advisor/types.mjs').ModelAdapter} */ (
    /** @type {unknown} */ ({
      id: 'never',
      describe: () => ({ id: 'never', kind: 'fixture', network: false, description: 'never answers' }),
      /** @param {{ signal?: AbortSignal }} input */
      complete: ({ signal }) => { seen = signal; return new Promise(() => {}); },
    }));
  await assert.rejects(
    callModel({ adapter, system: 's', context: 'c', question: 'q', maxOutputChars: 100, timeoutMs: 20 }),
    /the model adapter "never" did not answer within 20 ms/,
  );
  assert.equal(seen?.aborted, true, 'the adapter is told the deadline passed, through its signal');
});

test('deadline · a signal already aborted before the call refuses without reaching the adapter', async () => {
  let asked = 0;
  const adapter = /** @type {import('./observer-advisor/types.mjs').ModelAdapter} */ (
    /** @type {unknown} */ ({
      id: 'never',
      describe: () => ({ id: 'never', kind: 'fixture', network: false, description: 'never answers' }),
      complete: () => { asked += 1; return new Promise(() => {}); },
    }));
  await assert.rejects(callModel({
    adapter, system: 's', context: 'c', question: 'q', maxOutputChars: 100, timeoutMs: 50,
    signal: AbortSignal.abort(),
  }));
  assert.equal(asked, 1, 'the race is entered, but the abort has already won it');
});
