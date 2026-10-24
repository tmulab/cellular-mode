// report.test.mjs — the generated map: the PURE model and the PURE renderer (determinism,
// XML escaping, the finish-line matching rule, what is waiting on the human), then the real
// CLI writing the file. The `map-stale` finding is in report-check.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeOperation } from './operation-file.mjs';
import {
  reportModel, itemMatches, itemState, waitingOnHuman, sourceFingerprint, truncate,
} from './report-model.mjs';
import { renderMap, escapeXml, embeddedFingerprint } from './report-svg.mjs';
import { freshRoot, run, paths } from './helpers.mjs';

/** @param {Partial<import('./types.mjs').IndexRow>} [patch] */
const row = (patch = {}) => ({
  name: 'Alpha', slug: 'alpha', area: 'core', status: '🔵', lastVisit: '2026-10-02',
  nextStep: 'run the tests', ...patch,
});

const OPERATION = makeOperation({
  name: 'Go Live',
  finishLine: ['R7 generated map', 'Alpha', 'Beta', 'Gamma', 'nothing matches this'],
  pack: 'spend ceiling: 2k tokens · max-active-cells: 2',
  opened: '2026-10-02',
});

const ROWS = [
  row({ name: 'R7 generated map', slug: 'r7-generated-map', status: '🔵' }),
  row({ name: 'Alpha', slug: 'alpha', status: '✔' }),
  row({ name: 'Beta', slug: 'beta', status: '⏸', nextStep: 'ask the human to choose' }),
  row({ name: 'Gamma', slug: 'gamma', status: '📋' }),
];

test('the same vault answers the same bytes, twice, with no clock in the output', () => {
  const input = {
    project: 'cellular-mode', rows: ROWS, operation: OPERATION, logText: '# Cell log\n',
    indexText: '| Alpha |', operationTexts: [{ slug: 'go-live', text: '# Operation: Go Live' }],
    parkingLotText: '- [2026-10-02] ask the human (context: cell Alpha)',
  };
  const first = renderMap(reportModel(input));
  const second = renderMap(reportModel(input));
  assert.equal(first, second);
  assert.doesNotMatch(first, new RegExp(String(new Date().getFullYear() + 1)),
    'no clock, so no year the vault did not carry');
});

test('every vault string is XML-escaped', () => {
  const svg = renderMap(reportModel({
    project: 'a<b&c"d\'e',
    rows: [row({ name: 'Cell <script> & "quoted"', slug: 'odd' })],
    parkingLotText: '- the human said <no> & "maybe"',
  }));
  assert.match(svg, /Cell &lt;script&gt; &amp; &quot;quoted&quot;/);
  assert.match(svg, /a&lt;b&amp;c&quot;d&#39;e/);
  assert.match(svg, /&lt;no&gt; &amp; &quot;maybe&quot;/);
  assert.doesNotMatch(svg, /<script>/, 'nothing from the vault reopens a tag');
  for (const text of svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)) {
    assert.doesNotMatch(String(text[1]), /[<>]/, `raw angle bracket in: ${text[0]}`);
  }
  assert.equal(escapeXml(undefined), '');
});

test('a finish-line item takes the state of the cell that matches it', () => {
  const model = reportModel({ rows: ROWS, operation: OPERATION });
  assert.deepEqual(model.operation?.finishLine, [
    { text: 'R7 generated map', state: '🔵' },
    { text: 'Alpha', state: '✔' },
    { text: 'Beta', state: '⏸' },
    { text: 'Gamma', state: '📋' },
    { text: 'nothing matches this', state: '📋' },
  ]);
});

test('the matching rule: equal slugs, or a run of at least two whole tokens', () => {
  assert.ok(itemMatches('R7 generated map', 'r7-generated-map'));
  assert.ok(itemMatches('generated map', 'r7-generated-map'));
  assert.ok(itemMatches('map', 'map'));
  assert.ok(!itemMatches('map', 'r7-generated-map'), 'one bare token is too loose');
  assert.ok(!itemMatches('maps', 'map'), 'never a substring inside a token');
  assert.ok(!itemMatches('', 'map') && !itemMatches('map', ''));
  const entries = [{ name: 'A', slug: 'alpha', area: 'a', status: '✔', fact: '—', nextStep: '—' },
    { name: 'A2', slug: 'alpha', area: 'a', status: '🔵', fact: '—', nextStep: '—' }];
  assert.equal(itemState('alpha', entries), '✔', '✔ wins over 🔵');
  assert.equal(itemState('alpha', []), '📋');
});

test('waiting on the human: paused next steps, then the parked lines that name a human', () => {
  const parked = ['- [2026-10-02] the human must choose the protocol',
    '- [2026-10-02] humanity is not a request',
    '- [2026-10-02] waiting on Ada to publish', 'not a list line at all: human'].join('\n');
  const model = reportModel({ rows: ROWS, parkingLotText: parked });
  assert.deepEqual(model.waiting, [
    { source: 'cell', label: 'Beta', text: 'ask the human to choose' },
    { source: 'parking lot', label: 'parked', text: '[2026-10-02] the human must choose the protocol' },
  ]);
  const widened = waitingOnHuman({ parkingLotText: parked, humanWords: ['human', 'Ada'] });
  assert.equal(widened.length, 2, 'the word list is configurable, and ships no name');
  assert.equal(waitingOnHuman().length, 0);
});

test('the fingerprint covers log.md, INDEX.md and every operation file', () => {
  const base = { logText: 'a', indexText: 'b', operationTexts: [{ slug: 'go', text: 'c' }] };
  assert.match(sourceFingerprint(base), /^[0-9a-f]{64}$/);
  assert.equal(sourceFingerprint(base), sourceFingerprint({ ...base }));
  for (const changed of [{ logText: 'a2' }, { indexText: 'b2' },
    { operationTexts: [{ slug: 'go', text: 'c2' }] },
    { operationTexts: [{ slug: 'go2', text: 'c' }] }]) {
    assert.notEqual(sourceFingerprint({ ...base, ...changed }), sourceFingerprint(base));
  }
  assert.notEqual(sourceFingerprint({ logText: 'ab', indexText: '' }),
    sourceFingerprint({ logText: 'a', indexText: 'b' }), 'moving a line between files shows');
  assert.equal(truncate('x'.repeat(200)).length, 132);
});

test('the CLI writes the map, names it relative to the root and carries the fingerprint', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Alpha <&>', '--area', 'core']);
  run(root, ['pause', '--facts', 'wrote the parser', '--next', 'ask the human']);
  const written = run(root, ['report']);
  assert.match(written.stdout, /^Map written to vault\/state\/map\.svg · \d+ bytes · source sha256:[0-9a-f]{12}$/m);
  const absolute = [root, root.replaceAll('\\', '/')];
  for (const path of absolute) {
    assert.ok(!written.stdout.includes(path), 'never an absolute path in the output');
  }
  const svg = readFileSync(join(paths(root).state, 'map.svg'), 'utf8');
  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg /);
  assert.match(svg, /width="1400"/);
  assert.equal(embeddedFingerprint(svg).length, 64);
  assert.match(svg, /Alpha &lt;&amp;&gt;/);
  assert.match(svg, /No operation is 🔵 active\./);
  assert.match(svg, /\[cell\] Alpha &lt;&amp;&gt; — ask the human/);
  assert.match(svg, /Cells: 0 🔵 active · 1 ⏸ paused · 0 📋 planned · 0 ✔ done/);
  assert.match(svg, /Log entries: 1/);
  for (const path of absolute) {
    assert.ok(!svg.includes(path), 'the header carries the basename, never the path');
  }
  assert.equal(svg, readFileSync(join(paths(root).state, 'map.svg'), 'utf8'));
  run(root, ['report', '--out', 'docs/map.svg']);
  assert.ok(readFileSync(join(root, 'docs', 'map.svg'), 'utf8').startsWith('<?xml'));
  run(root, ['report', '--out'], { expect: 1 });
  run(root, ['report', 'extra'], { expect: 1 });
});

test('the map is byte-identical when the vault did not move, and changes when it did', () => {
  const root = freshRoot();
  run(root, ['init']);
  run(root, ['open', 'Alpha', '--area', 'core']);
  run(root, ['report', '--out', 'one.svg']);
  run(root, ['report', '--out', 'two.svg']);
  const one = readFileSync(join(root, 'one.svg'), 'utf8');
  assert.equal(one, readFileSync(join(root, 'two.svg'), 'utf8'));
  run(root, ['pause', '--facts', 'wrote it', '--next', 'test it']);
  run(root, ['report', '--out', 'three.svg']);
  assert.notEqual(one, readFileSync(join(root, 'three.svg'), 'utf8'));
});
