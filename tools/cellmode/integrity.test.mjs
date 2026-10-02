// integrity.test.mjs — the guard, the append-only invariant and escaping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshRoot, run, readState, overwrite, paths } from './helpers.mjs';

/** @param {string} root @param {string} [name] @returns {string} */
function pausedProject(root, name = 'Index Parser') {
  run(root, ['init']);
  run(root, ['open', name, '--area', 'tools']);
  run(root, ['pause', '--facts', 'wrote index-table.mjs', '--next', 'run `node --test`']);
  return name;
}

test('check passes on a consistent state and reports the counts', () => {
  const root = freshRoot();
  pausedProject(root);
  run(root, ['plan', 'Key Audit', '--area', 'tools']);
  const out = run(root, ['check']);
  assert.match(out.stdout, /Integrity check passed · 0 active · 1 paused · 1 planned · 0 done · 1 log entries/);
});

test('check detects a shrunk log: ⏸ in INDEX with no log entry', () => {
  const root = freshRoot();
  run(root, ['init']);
  overwrite(root, 'index', `${readState(root, 'index')}| Ghost | tools | ⏸ | 2026-10-01 | run the tests |\n`);
  const out = run(root, ['check'], { expect: 2 });
  assert.match(out.stderr, /\[log-shrunk\] log shrunk: "Ghost" is ⏸ in INDEX\.md but has no entry in log\.md/);
  // The guard also blocks the lifecycle commands, not only `check`.
  run(root, ['open', 'Anything', '--area', 'a'], { expect: 2 });
});

test('check detects two 🔵 rows', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Alpha', '--area', 'a']);
  overwrite(root, 'index', `${readState(root, 'index')}| Beta | b | 🔵 | 2026-10-02 | — |\n`);
  const out = run(root, ['check'], { expect: 2 });
  assert.match(out.stderr, /\[two-active\] more than one active cell \(🔵\): Alpha, Beta/);
  run(root, ['pause', '--facts', 'f', '--next', 'n'], { expect: 2 });
});

test('check detects a CURRENT-CELL that does not match the active cell', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Alpha', '--area', 'a']);
  overwrite(root, 'current', '# Current cell\n\nNo active cell · 0 paused — see INDEX.md\n');
  const idle = run(root, ['check'], { expect: 2 });
  assert.match(idle.stderr, /\[current-cell-mismatch\] CURRENT-CELL\.md shows no active cell but "Alpha" is 🔵/);
  overwrite(root, 'current', readFileSync(paths(root).cellFile('alpha'), 'utf8').replace('# Cell: Alpha', '# Cell: Beta'));
  const wrong = run(root, ['check'], { expect: 2 });
  assert.match(wrong.stderr, /points to "Beta" but "Alpha" is 🔵 in INDEX\.md/);
});

test('check detects an INDEX status that disagrees with the last log status', () => {
  const root = freshRoot();
  pausedProject(root, 'Alpha');
  overwrite(root, 'index', readState(root, 'index').replace('| ⏸ |', '| ✔ |'));
  const out = run(root, ['check'], { expect: 2 });
  assert.match(out.stderr, /\[status-mismatch\] INDEX\.md says ✔ for "Alpha" but the last log entry says ⏸/);
  assert.match(out.stderr, /the log is truth, fix the projections/);
});

test('the log is append-only: each step keeps the previous bytes as a prefix', () => {
  const root = freshRoot();
  run(root, ['init']);
  /** @type {Buffer[]} */
  const snapshots = [];
  const snap = () => snapshots.push(readFileSync(paths(root).log));
  snap();
  const steps = [
    ['open', 'Alpha', '--area', 'a'],
    ['plan', 'Gamma', '--area', 'g'],
    ['park', 'an idea'],
    ['pause', '--facts', 'wrote a.mjs', '--next', 'run the tests'],
    ['resume', 'alpha'],
    ['pause', '--facts', 'wrote b.mjs', '--next', 'read the first error'],
    ['open', 'Gamma'],
    ['complete', '--facts', 'done', '--confirm'],
    ['resume', 'Alpha'],
    ['pause', '--facts', 'wrote c.mjs', '--next', 'ship it', '--note', 'good session'],
  ];
  steps.forEach((args, i) => {
    run(root, args, { now: `2026-10-0${(i % 9) + 1} 09:00` });
    snap();
  });
  for (let i = 1; i < snapshots.length; i += 1) {
    const previous = snapshots[i - 1];
    const current = snapshots[i];
    assert.ok(previous && current, `missing snapshot at step ${i}`);
    assert.ok(current.length >= previous.length, `log shrank at step ${i}`);
    assert.ok(current.subarray(0, previous.length).equals(previous), `log rewritten at step ${i}`);
  }
  const last = snapshots[snapshots.length - 1];
  const first = snapshots[0];
  assert.ok(last && first);
  assert.ok(last.length > first.length);
  run(root, ['check']);
});

test('an escaped pipe in a next step survives the INDEX round-trip', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Alpha', '--area', 'tools']);
  const next = 'run `node --test | head -5` and read the first error';
  run(root, ['pause', '--facts', 'wrote a | b handling', '--next', next]);
  assert.match(readState(root, 'index'), /run `node --test \\\| head -5` and read the first error/);
  assert.match(readState(root, 'log'), new RegExp('\\*\\*Next step:\\*\\* run `node --test \\| head -5`'));
  run(root, ['check']);
  // Re-rendering the table (resume rewrites it) must not double-escape.
  const resumed = run(root, ['resume', 'Alpha']);
  assert.ok(resumed.stdout.includes(`NEXT STEP: ${next}`), resumed.stdout);
  run(root, ['pause', '--facts', 'again', '--next', next]);
  assert.match(readState(root, 'index'), /run `node --test \\\| head -5` and read the first error/);
  assert.equal(readState(root, 'index').includes('\\\\|'), false, 'the pipe was double-escaped');
  run(root, ['check']);
});
