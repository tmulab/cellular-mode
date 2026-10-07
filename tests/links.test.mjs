// Hygiene: every relative Markdown link in the repository resolves to something that
// exists. A broken pointer in a method whose whole premise is "load this next" is a
// method failure, not a typo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';
import {
  BOOTSTRAP_PATHS, BOOTSTRAP_PENDING, BUILDER_PATHS, BUILDER_PENDING,
} from '../tools/gates/removal-paths.mjs';
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

/** Paths that belong to the OPTIONAL Cellular Adaptive module. A pointer into it is a real
 * link while the module is installed, and a documented absence when a checkout deleted it —
 * which `tools/gates/removal-rehearsal.mjs` does on purpose. Exempt ONLY when the module is
 * absent, so a typo inside one of these paths is still a broken link in this repository. */
const ADAPTIVE_LINK_PATHS = Object.freeze([
  /^tools\/adaptive\//,
  /^skills\/mode\//,
  /^adaptive\//,
  /^adapters\/claude-code\/settings\.adaptive\.json$/,
  /^(?:adapters\/claude-code\/)?\.claude\/skills\/(?:tired|ready|focus|explore|modo[a-z]+)\//,
]);

/** @type {(prefixes: ReadonlyArray<string>) => (rel: string) => boolean} a path, or anything under it */
const underAny = (prefixes) => (rel) => prefixes.some((p) => rel === p || rel.startsWith(`${p}/`));

/**
 * The OPTIONAL modules, each with the file that says it is installed, what it covers, and the
 * entries whose liveness is checked. TWO modules now: the Builder joined in stage 6, because
 * `npm run rehearse:builder-removal` deletes it in a copy and the links in the surviving
 * documentation then point at a documented absence, exactly as the adaptive ones do.
 *
 * The Builder's coverage is DERIVED from the rehearsal's own list (`tools/gates/removal-paths.mjs`)
 * rather than restated here: two definitions of "what the Builder is" would be one definition
 * and one thing to forget. `BUILDER_PENDING` is exempt-when-absent but NOT checked for liveness
 * — it is the documented hole that file explains, kept in one place.
 */
const OPTIONAL_MODULES = Object.freeze([
  {
    name: 'Cellular Adaptive',
    marker: 'tools/adaptive',
    covers: (/** @type {string} */ rel) => ADAPTIVE_LINK_PATHS.some((re) => re.test(rel)),
    live: ADAPTIVE_LINK_PATHS.map((re) => ({ label: String(re), test: (/** @type {string} */ rel) => re.test(rel) })),
    sample: 'tools/adaptive/README.md',
  },
  {
    name: 'Cellular Prompt Builder',
    marker: 'tools/prompt-builder',
    covers: underAny([...BUILDER_PATHS, ...BUILDER_PENDING]),
    live: BUILDER_PATHS.map((path) => ({ label: path, test: underAny([path]) })),
    sample: 'tools/prompt-builder/store.mjs',
  },
  {
    name: 'Cellular Bootstrap',
    marker: 'tools/bootstrap',
    covers: underAny([...BOOTSTRAP_PATHS, ...BOOTSTRAP_PENDING]),
    live: BOOTSTRAP_PATHS.map((path) => ({ label: path, test: underAny([path]) })),
    sample: 'bootstrap/CONTRACTS.md',
  },
]);

/** @type {(module: { marker: string }) => boolean} */
const isInstalled = (module) => existsSync(join(ROOT, ...module.marker.split('/')));
const allInstalled = OPTIONAL_MODULES.every(isInstalled);

/** @param {string} resolved @returns {boolean} */
function isAbsentOptional(resolved) {
  const rel = relative(ROOT, resolved).split(sep).join('/');
  return OPTIONAL_MODULES.some((module) => !isInstalled(module) && module.covers(rel));
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
  let exempt = 0;
  for (const rel of markdown) {
    for (const line of linkLines(read(rel))) {
      for (const match of line.matchAll(LINK)) {
        const raw = match[1];
        if (raw === undefined || !isRelative(raw)) continue;
        const target = decodeURIComponent(raw.split('#')[0] ?? '');
        if (target === '') continue; // pure anchor
        checked += 1;
        const resolved = normalize(join(ROOT, dirname(rel), target));
        if (existsSync(resolved)) continue;
        if (isAbsentOptional(resolved)) {
          exempt += 1;
          continue;
        }
        offenders.push(`${rel} -> ${raw}`);
      }
    }
  }
  assert.ok(checked >= 15, `expected relative links to check, got ${checked}`);
  // Never vacuous where it matters: with the module installed, NOTHING is exempt - every
  // link was resolved for real. The exemption can only be reached by a checkout without it.
  if (allInstalled) assert.equal(exempt, 0, 'the exemption must be unreachable here');
  assert.deepEqual(offenders, [], report('broken relative links', offenders));
});

test('links · each optional-module exemption is live, and off while that module is installed', () => {
  const files = allFiles();
  for (const module of OPTIONAL_MODULES) {
    if (!isInstalled(module)) {
      // The other direction of the same claim: with the module gone, no file matches its paths.
      for (const { label, test: matches } of module.live) {
        assert.deepEqual(files.filter(matches), [], `${label} must match nothing now`);
      }
      assert.equal(isAbsentOptional(join(ROOT, ...module.sample.split('/'))), true,
        `${module.name} is absent, so a pointer into it is a documented absence`);
      continue;
    }
    // Installed: every entry is checked against real paths, so none can go stale unnoticed.
    for (const { label, test: matches } of module.live) {
      assert.ok(files.some(matches), `no file matches ${label}: the ${module.name} list is stale`);
    }
    assert.equal(isAbsentOptional(join(ROOT, ...`${module.marker}/gone.md`.split('/'))), false,
      `while ${module.name} is installed nothing of it is exempt`);
  }
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
