// AD29 — the fast half. Cellular Adaptive is OPTIONAL, so nothing that must survive its
// deletion may STATICALLY import it: a static `import` is resolved when the importing module
// loads, so one of them turns "the module is absent" into "the host does not start".
//
// The slow half is `tools/gates/removal-rehearsal.mjs`, which deletes the module in a copy of
// the repository and runs the whole suite there. This test is the one that runs in `npm test`:
// it reads the import statements of the files that must keep working and names any that reach
// into the optional module. A dynamic `import()` is allowed, and only in the composition
// module, because that one is executed behind the `--adaptive` flag and returns `null` when
// the module is not installed.
//
// Scope is listed, not inferred, and the test asserts it MATCHED — a scope that silently stops
// matching files is a test that silently stops being a test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { posix } from 'node:path';
import { allFiles, read, report } from './helpers.mjs';

/** The files that must keep working with EITHER optional module deleted. `eip/host/adaptive-*`
 * is the module's own host half and is excluded: it is deleted along with it. The `tests/`
 * row was added in stage 5, cell 7: the repository-wide suites live there, they SURVIVE the
 * deletion, and one of them (`upp-compat`) had acquired a static import of the optional
 * plugin that only the slow rehearsal could see. A guard that cannot see the files the
 * rehearsal runs is not the fast half of anything. `verification-contract.` joined the exclusion
 * in stage 7 cell 7 for the same reason as the adaptive names: it round-trips the BS3 contract
 * across its GENERATOR (Bootstrap) and its READER (the gates), so `removal-paths.mjs` counts it as
 * part of the BOOTSTRAP set and `rehearse:bootstrap-removal` deletes it. Excluding a file the
 * rehearsal deletes is not a hole; excluding a surviving one would be. */
const SCOPE = Object.freeze([
  /^eip\/host\/(?!adaptive-)[^/]+\.mjs$/,
  /^apps\/observer\/(?!vendor\/).+\.mjs$/,
  /^tools\/cellmode\/.+\.mjs$/,
  /^eip\/plugins\/observer-[^/]+\/.+\.mjs$/,
  /^tests\/(?!adaptive-integration\.|gates-adaptive-boundary\.|verification-contract\.)[^/]+\.mjs$/,
]);

/** Repo-relative prefixes that ARE an optional module. A resolved specifier starting with one
 * of these is a dependency on something that may not be in the checkout.
 *
 * THREE modules are optional, not one. `tools/prompt-builder/` (Stage 6) and `tools/bootstrap/`
 * (Stage 7) joined for exactly the reason the adaptive entries are here: their slow halves are
 * `rehearse:builder-removal` and `rehearse:bootstrap-removal`, and the fast half has to see a
 * static import before a rehearsal spends minutes finding it. Their own files are NOT in SCOPE,
 * so a module importing itself is not a finding; `prompt-builder-is-optional-and-isolated` and
 * `bootstrap-is-optional-and-isolated` state the same arrows as gate data. */
const OPTIONAL = Object.freeze([
  'tools/adaptive/',
  'eip/plugins/adaptive-',
  'eip/host/adaptive-read-port',
  'tools/prompt-builder/',
  'tools/bootstrap/',
]);

/** The module allowed to name an optional specifier at all, and only in a dynamic
 * `import()`: it is the composition, it runs behind the flag, and it answers `null`. */
const COMPOSITION = 'eip/host/observer-composition.mjs';

/** The two files allowed a DYNAMIC optional specifier, each for the same reason: they check
 * whether the module is in the checkout and carry on without it. The compat suite is the
 * second one — it maps every plugin manifest present, and "present" is a fact it reads rather
 * than assumes. A third entry here should be argued for, not added. */
const DYNAMIC_ALLOWED = Object.freeze([COMPOSITION, 'tests/upp-compat.test.mjs']);

/** The smallest scope this test is still meaningful at. Mutating `SCOPE` to narrow the search
 * turns the whole file green for the wrong reason; these two numbers refuse that. */
const MIN_FILES = 20;
const MIN_IMPORTS = 40;

/** @param {string} rel @returns {boolean} */
const inScope = (rel) => SCOPE.some((re) => re.test(rel));

/** Every STATIC import/export specifier of a module, with its line number.
 *
 * Not a parser: ESM import and export declarations are top-level, and this project writes no
 * indented ones, so a statement is a line whose FIRST token is `import` or `export`. That also
 * excludes every `//` comment and every JSDoc line (` * ...`), where a specifier appears inside
 * `typeof import('…')` and means nothing. A dynamic `import('…')` is never matched: it is an
 * expression, so its line starts with `await`, `const`, `return` or `[`.
 * @param {string} text @returns {Array<{ spec: string, line: number }>} */
export function staticSpecifiers(text) {
  const lines = text.split('\n');
  /** @type {Array<{ spec: string, line: number }>} */
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^(?:import|export)[\s{*'"]/.test(String(lines[i]))) continue;
    // A declaration may span lines, but only while a brace clause is open — so the window
    // grows over `import {\n a,\n} from '…'` and stops at the end of `export const x = 1;`,
    // never reading the next statement or the comment after it.
    let window = '';
    for (let j = i; j < Math.min(lines.length, i + 8); j += 1) {
      window += `${j === i ? '' : '\n'}${String(lines[j])}`;
      const match = /\bfrom\s*['"]([^'"]+)['"]/.exec(window)
        ?? /^(?:import|export)\s*['"]([^'"]+)['"]/.exec(window);
      if (match !== null && match[1] !== undefined) {
        out.push({ spec: match[1], line: i + 1 });
        break;
      }
      if (openBraces(window) <= 0) break;
    }
  }
  return out;
}

/** How many `{` of a text are still unclosed. Counting, not parsing: it decides only how far
 * an import declaration may reach, and over-reading is bounded to eight lines anyway.
 * @param {string} text @returns {number} */
function openBraces(text) {
  return (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length;
}

/** Every dynamic `import('…')` with a LITERAL specifier, with its line number.
 * @param {string} text @returns {Array<{ spec: string, line: number }>} */
export function dynamicSpecifiers(text) {
  const lines = text.split('\n');
  /** @type {Array<{ spec: string, line: number }>} */
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i]);
    if (/^\s*(?:\*|\/\/)/.test(line)) continue; // JSDoc and comments are not code
    const match = /(?:^|[^.\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(line);
    if (match !== null && match[1] !== undefined) out.push({ spec: match[1], line: i + 1 });
  }
  return out;
}

/** A specifier as a repo-relative path. A bare or `node:` specifier is not one of ours.
 * @param {string} from @param {string} spec @returns {string | null} */
export function resolveSpecifier(from, spec) {
  if (!spec.startsWith('.')) return null;
  return posix.normalize(posix.join(posix.dirname(from), spec));
}

/** @param {string} resolved @returns {boolean} */
const isOptional = (resolved) => OPTIONAL.some((prefix) => resolved.startsWith(prefix));

const scoped = allFiles().filter(inScope);

test('optional module · the scope matches real files and real imports', () => {
  assert.ok(scoped.length >= MIN_FILES,
    `the scope matched ${scoped.length} files, expected at least ${MIN_FILES}`);
  const total = scoped.reduce((n, rel) => n + staticSpecifiers(read(rel)).length, 0);
  assert.ok(total >= MIN_IMPORTS,
    `the reader found ${total} static specifiers, expected at least ${MIN_IMPORTS}`);
  // Positive control: the reader must see a multi-line import it is known to contain.
  const specs = staticSpecifiers(read('apps/observer/host-adapter.mjs')).map((s) => s.spec);
  assert.ok(specs.includes('../../eip/host/observer-composition.mjs'),
    `the reader missed a known multi-line import: ${specs.join(', ')}`);
  assert.ok(scoped.includes(COMPOSITION), `${COMPOSITION} must be in scope`);
});

test('optional module · nothing that must survive its deletion imports it statically', () => {
  /** @type {string[]} */
  const offenders = [];
  for (const rel of scoped) {
    for (const { spec, line } of staticSpecifiers(read(rel))) {
      const resolved = resolveSpecifier(rel, spec);
      if (resolved !== null && isOptional(resolved)) offenders.push(`${rel}:${line}: ${spec}`);
    }
  }
  assert.deepEqual(offenders, [], report('static imports of an OPTIONAL module', offenders));
});

test('optional module · only the composition names it, and only in a dynamic import()', () => {
  /** @type {string[]} */
  const offenders = [];
  for (const rel of scoped) {
    if (DYNAMIC_ALLOWED.includes(rel)) continue;
    for (const { spec, line } of dynamicSpecifiers(read(rel))) {
      const resolved = resolveSpecifier(rel, spec);
      if (resolved !== null && isOptional(resolved)) offenders.push(`${rel}:${line}: ${spec}`);
    }
  }
  assert.deepEqual(offenders, [], report('dynamic imports of the adaptive module outside the composition', offenders));
  // And the composition DOES load it dynamically, so the exception is used rather than stale.
  const dynamic = dynamicSpecifiers(read(COMPOSITION))
    .map(({ spec }) => resolveSpecifier(COMPOSITION, spec))
    .filter((resolved) => resolved !== null && isOptional(resolved));
  assert.ok(dynamic.length >= 2,
    `${COMPOSITION} must load the adaptive plugin AND its read port dynamically, found ${dynamic.length}`);
});

test('optional module · the detector tells a static import from a dynamic one', () => {
  const sample = [
    "import { a } from './a.mjs';",
    'import {',
    '  b,',
    "} from './b.mjs';",
    "export { c } from './c.mjs';",
    "import './side-effect.mjs';",
    "// import { d } from './d.mjs';",
    " * @type {typeof import('./e.mjs')}",
    "  const f = await import('./f.mjs');",
  ].join('\n');
  assert.deepEqual(staticSpecifiers(sample).map((s) => s.spec),
    ['./a.mjs', './b.mjs', './c.mjs', './side-effect.mjs']);
  assert.deepEqual(dynamicSpecifiers(sample).map((s) => s.spec), ['./f.mjs']);
  assert.equal(resolveSpecifier('eip/host/index.mjs', './adaptive-read-port.mjs'),
    'eip/host/adaptive-read-port.mjs');
  assert.equal(resolveSpecifier('eip/host/index.mjs', 'node:http'), null);
});
