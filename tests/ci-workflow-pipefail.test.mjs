// A piped command (`node --test | tee log`) exits with the status of its LAST command. GitHub
// runs a step with an unspecified shell as `bash -e {0}` — no pipefail — so a failing suite
// piped into `tee` would pass. Declaring `shell: bash` makes GitHub use
// `bash --noprofile --norc -eo pipefail {0}`. This test keeps that line from being dropped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WORKFLOW = new URL('../.github/workflows/verify.yml', import.meta.url);

/** Steps as blocks of lines, each starting at a `- ` list item under `steps:`.
 * @param {string} text @returns {string[][]} */
function stepBlocks(text) {
  /** @type {string[][]} */
  const blocks = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s{6}- /.test(line)) blocks.push([line]);
    else if (blocks.length > 0 && /^\s{8,}\S/.test(line)) blocks[blocks.length - 1]?.push(line);
  }
  return blocks;
}

/** The shell text a step runs: the `run:` value, or the indented lines of a `run: |` block.
 * @param {string[]} block @returns {string} */
function commandOf(block) {
  const at = block.findIndex((line) => /^\s+run:/.test(line));
  if (at < 0) return '';
  const inline = block[at]?.replace(/^\s+run:\s*/, '') ?? '';
  if (inline !== '|' && inline !== '>') return inline;
  return block.slice(at + 1).filter((line) => /^\s{10,}\S/.test(line)).map((line) => line.trim()).join('\n');
}

/** @param {string} command */
const pipes = (command) => /(^|[^|])\|([^|]|$)/.test(command);

test('ci · every step that pipes a command declares shell: bash (pipefail)', () => {
  const blocks = stepBlocks(readFileSync(WORKFLOW, 'utf8'));
  const piped = blocks.filter((block) => pipes(commandOf(block)));
  assert.ok(piped.length >= 1, 'the test suite step pipes into tee: the guard must see it');
  for (const block of piped) {
    assert.ok(block.some((line) => /^\s+shell:\s*bash\s*$/.test(line)),
      `a piped step without shell: bash would mask a failure:\n${block.join('\n')}`);
  }
});

test('ci · the pipe detector tells a pipe from ||, from a block indicator and from plain text', () => {
  assert.equal(pipes('node --test 2>&1 | tee log'), true);
  assert.equal(pipes('a || b'), false);
  assert.equal(pipes('npm run gates'), false);
  assert.equal(commandOf(['      - name: x', '        run: |', '          echo a | cat']), 'echo a | cat');
});
