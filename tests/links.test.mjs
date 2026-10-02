// Hygiene: every relative Markdown link in the repository resolves to something that
// exists. A broken pointer in a method whose whole premise is "load this next" is a
// method failure, not a typo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { ROOT, allFiles, read, report } from './helpers.mjs';

const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** @param {string} target @returns {boolean} */
function isRelative(target) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false; // http:, https:, mailto:, data:
  if (target.startsWith('#')) return false; // same-document anchor
  if (target.startsWith('<')) return false; // autolink leftovers
  return true;
}

/**
 * Markdown-aware line feed: code is not link syntax. Fenced blocks are dropped
 * entirely and inline `code spans` are blanked, so an illustrative snippet such as
 * `[Feed parser](cells/feed-parser.md)` is documentation, not a dangling pointer.
 */
/** @param {string} text @returns {string[]} */
export function linkLines(text) {
  /** @type {string[]} */
  const out = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    out.push(inFence ? '' : line.replace(/`[^`]*`/g, ' '));
  }
  return out;
}

const markdown = allFiles().filter((rel) => rel.endsWith('.md'));

test('links · markdown files are discovered', () => {
  assert.ok(markdown.length >= 25, `expected markdown files, found ${markdown.length}`);
  assert.ok(markdown.includes('README.md'));
});

test('links · every relative markdown link resolves', () => {
  /** @type {string[]} */
  const offenders = [];
  let checked = 0;
  for (const rel of markdown) {
    for (const line of linkLines(read(rel))) {
      for (const match of line.matchAll(LINK)) {
        const raw = match[1];
        if (raw === undefined || !isRelative(raw)) continue;
        const target = decodeURIComponent(raw.split('#')[0] ?? '');
        if (target === '') continue; // pure anchor
        checked += 1;
        const resolved = normalize(join(ROOT, dirname(rel), target));
        if (!existsSync(resolved)) offenders.push(`${rel} -> ${raw}`);
      }
    }
  }
  assert.ok(checked >= 15, `expected relative links to check, got ${checked}`);
  assert.deepEqual(offenders, [], report('broken relative links', offenders));
});

test('links · the checker really detects a broken link', () => {
  const resolved = normalize(join(ROOT, 'docs', 'does-not-exist.md'));
  assert.equal(existsSync(resolved), false);
  assert.deepEqual([...'[x](a/b.md)'.matchAll(LINK)].map((m) => m[1]), ['a/b.md']);
  assert.equal(isRelative('https://tmulab.org'), false);
  assert.equal(isRelative('docs/01-philosophy.md'), true);
  assert.deepEqual(linkLines('a `[x](y.md)` b'), ['a   b']);
  assert.equal(linkLines('```\n[x](y.md)\n```').join('\n').includes('y.md'), false);
});
