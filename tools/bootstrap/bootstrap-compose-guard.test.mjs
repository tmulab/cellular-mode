// The two guards around the Bootstrap↔Builder process boundary, split from
// `bootstrap-compose.test.mjs` for the 200-line rule: that file is about WHAT the Builder decides,
// these are about what Bootstrap refuses to do regardless, and what it is allowed to print.
//
// Neither needs the Builder installed — an approval and a `--confirm` are checked before any
// subprocess, and a summary is sanitized whatever produced it — so both run unchanged in the
// checkout `rehearse:builder-removal` creates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './main.mjs';
import { installFirstCell, summaryOf } from './compose-builder.mjs';
import { cleanup, listFiles, makeProject } from './fixtures/temp.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ENV = Object.freeze({ CELLMODE_NOW: '2026-10-06 12:00', PATH: process.env.PATH ?? '' });

/** @param {string[]} args @returns {{ code: number, all: string }} */
function run(args) {
  let all = '';
  const write = (/** @type {string} */ text) => { all += text; return true; };
  const io = { stdout: { write }, stderr: { write }, env: { ...ENV } };
  return { code: main(['node', 'cli.mjs', ...args], io), all };
}

test('compose · the first cell is never created without its approval, or without --confirm', () => {
  const { root, target } = makeProject('nocell');
  try {
    assert.equal(run(['new', target, '--profile', 'minimal', '--confirm']).code, 0);
    const base = { targetRoot: target, sourceRoot: ROOT, env: { ...ENV } };
    const withheld = installFirstCell({ ...base, approvals: new Set(), confirm: true });
    assert.equal(withheld.status, 'proposed');
    assert.match(withheld.detail, /approval "first-cell" was not given/);
    const unconfirmed = installFirstCell({ ...base, approvals: new Set(['first-cell']) });
    assert.equal(unconfirmed.status, 'proposed');
    assert.match(unconfirmed.detail, /--confirm was not given/);
    assert.deepEqual(listFiles(join(target, 'vault', 'state', 'cells')), ['README.md']);
  } finally {
    cleanup(root);
  }
});

test('compose · a subprocess summary is one sanitized line with no root in it', () => {
  const line = summaryOf({ ok: false, status: 2, stdout: 'out\nmore', truncated: false,
    stderr: `\n  bad thing at ${ROOT}x\nnext` }, [ROOT]);
  assert.match(line, /^bad thing at \.[\\/]?x$/, `the root survived: ${line}`);
  assert.equal(summaryOf({ ok: false, status: 9, stdout: '', stderr: '', truncated: false }, []), 'exit 9');
  assert.doesNotMatch(summaryOf({ ok: false, status: 2, stdout: 'a\nb', stderr: '', truncated: false }, []), /\n/);
});
