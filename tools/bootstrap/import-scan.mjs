// import-scan.mjs — which modules a module names, read from its text. PURE.
//
// Not a parser, and it does not have to be: ESM import and export declarations are top-level,
// this project writes no indented ones, so a declaration is a line whose FIRST token is
// `import` or `export`. That rule is what keeps prose out of the answer — a comment containing
// the words "from 'the project'" is not an import, and a looser regex would say it was.
//
// A SECOND kind of reference matters as much as a static import and is easy to forget: the
// `import('./x.mjs')` inside a JSDoc type annotation. It is not executed, but `tsc --checkJs`
// resolves it, so a copied file whose type reference points outside the copied set does not
// typecheck in the target. Both kinds are reported, labelled, because the closure check needs
// both and the optional-module check needs to tell them apart.
//
// This module is a sibling of `tests/optional-module-imports.test.mjs`, which reads the same
// shapes for the opposite purpose: that one finds imports that must NOT exist, this one finds
// imports that must be SATISFIED.

/** @typedef {{ spec: string, line: number, kind: 'static' | 'reference' }} Specifier */

/** @param {string} text @returns {number} */
const openBraces = (text) => (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length;

/** An `export` that DECLARES something rather than re-exporting from a module. It has to be
 * recognised by name: `export const E = obj({ from: ID }, ['from', 'to']);` contains the two
 * tokens `from` and a quote, and a specifier regex reading that line answers `", "`. The bug is
 * real, it was found by this module's own closure check, and the fix is to never read a
 * declaration as a declaration of dependency. */
const EXPORT_DECLARATION = /^export\s+(?:default\s+|async\s+)?(?:const|let|var|function|class|\{?\s*\/\*)/;

/**
 * PURE. Every STATIC import/export specifier, with its 1-based line number. A declaration may
 * span lines, but only while a brace clause is open, so the window grows over a multi-line
 * `import { … } from '…'` and stops at the end of an `export const`.
 * @param {string} text @returns {ReadonlyArray<Specifier>}
 */
export function staticSpecifiers(text) {
  const lines = text.split('\n');
  /** @type {Specifier[]} */
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const first = String(lines[i]);
    if (!/^(?:import|export)[\s{*'"]/.test(first)) continue;
    if (EXPORT_DECLARATION.test(first)) continue;
    let window = '';
    for (let j = i; j < Math.min(lines.length, i + 8); j += 1) {
      window += `${j === i ? '' : '\n'}${String(lines[j])}`;
      const match = /\bfrom\s*['"]([^'"]+)['"]/.exec(window)
        ?? /^(?:import|export)\s*['"]([^'"]+)['"]/.exec(window);
      if (match !== null && match[1] !== undefined) {
        out.push({ spec: match[1], line: i + 1, kind: 'static' });
        break;
      }
      if (openBraces(window) <= 0) break;
    }
  }
  return Object.freeze(out);
}

/**
 * PURE. Every `import('…')` with a literal specifier — a dynamic import in code OR a JSDoc
 * type reference. A `//` comment line is skipped; a JSDoc line is NOT, because that is where
 * the type references live and `tsc` resolves them.
 * @param {string} text @returns {ReadonlyArray<Specifier>}
 */
export function referenceSpecifiers(text) {
  const lines = text.split('\n');
  /** @type {Specifier[]} */
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i]);
    if (/^\s*\/\//.test(line)) continue;
    for (const match of line.matchAll(/(?:^|[^.\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = match[1];
      if (spec !== undefined) out.push({ spec, line: i + 1, kind: 'reference' });
    }
  }
  return Object.freeze(out);
}

/** PURE. Both kinds at once, in line order.
 * @param {string} text @returns {ReadonlyArray<Specifier>} */
export function allSpecifiers(text) {
  return Object.freeze([...staticSpecifiers(text), ...referenceSpecifiers(text)]
    .sort((a, b) => a.line - b.line));
}

/**
 * PURE. A specifier as a path relative to the same root as `from`, or `null` when it is not
 * one of ours (a `node:` builtin or a bare package name). `node:` and bare are different
 * findings — a bare specifier in a zero-dependency project is a defect — so the caller is
 * told which by `isBare`.
 * @param {string} from @param {string} spec @returns {string | null}
 */
export function resolveSpecifier(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = from.split('/').slice(0, -1);
  /** @type {string[]} */
  const out = [];
  for (const segment of [...base, ...spec.split('/')]) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return out.join('/');
}

/** PURE. True for a package specifier: not relative, not a `node:` builtin.
 * @param {string} spec @returns {boolean} */
export function isBare(spec) {
  return !spec.startsWith('.') && !spec.startsWith('node:');
}
