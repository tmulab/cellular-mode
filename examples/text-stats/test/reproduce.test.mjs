// The committed vault must stay the output of the recorded command sequence.
// If someone hand-edits examples/text-stats/vault/state/, this test goes red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'reproduce.mjs');

test('the example vault is reproducible from the cellmode command sequence', () => {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(result.status, 0,
    `reproduce.mjs exited ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /vault reproduced:/);
});

test('an unknown flag is a usage error', () => {
  const result = spawnSync(process.execPath, [SCRIPT, '--nope'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: node reproduce\.mjs/);
});
