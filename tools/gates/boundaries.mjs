// boundaries.mjs — import DIRECTION for the "Everything Is a Plugin" layout.
//
// The layout only means something if the arrows point one way, and an arrow that is only
// written in a document gets reversed by the first convenient import. This module is the
// MATCHER: given files and rules, which imports break which arrow. It holds no rule of its
// own, so a layering decision is never hidden inside a branch.
import { ADAPTIVE_PURE_IMPORTS, HOST_GATE_IMPORTS, OBSERVER_PURE_IMPORTS } from './allowlists.mjs';
import { RULES } from './rules.mjs';
import { importSpecifiers } from './deps.mjs';

// The RULES live in ./rules.mjs and the import EXCEPTIONS in ./allowlists.mjs — a rule, its
// exceptions and the matcher that applies them are three things to review, not one. All three
// are re-exported here because this module is the address every caller already knows.
export { ADAPTIVE_PURE_IMPORTS, HOST_GATE_IMPORTS, OBSERVER_PURE_IMPORTS, RULES };

/** @typedef {import('./types.mjs').FileTuple} FileTuple @typedef {import('./types.mjs').Finding} Finding */
/** @typedef {import('./rules.mjs').Rule} Rule */
/** @typedef {{ file: string, specifier: string, target: string, rule: string, why: string }} Violation */

/** `eip/kernel/a.mjs` + `../sdk/b.mjs` -> `eip/sdk/b.mjs`. No disk access. @param {string}
 * fileRel @param {string} specifier @returns {string} */
export function resolveSpecifier(fileRel, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  const segments = fileRel.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  return segments.join('/');
}

/** @type {(path: string, depth: number) => string} */
const prefixOf = (path, depth) => path.split('/').slice(0, depth).join('/') + '/';

/** @type {(rule: Rule, file: string, target: string) => boolean} */
function allows(rule, file, target) {
  if (target.startsWith('node:')) return true;
  if (rule.allowPrefixes?.some((p) => target.startsWith(p))) return true;
  if (rule.allowExact?.includes(target)) return true;
  if (rule.allowSelfDepth && target.startsWith(prefixOf(file, rule.allowSelfDepth))) return true;
  return false;
}

/** @type {(rule: Rule, target: string) => boolean} */
function denies(rule, target) {
  if (rule.denyPrefixes?.some((p) => target.startsWith(p))) return true;
  return Boolean(rule.denyExact?.includes(target));
}

/** @type {(rule: Rule) => boolean} */
const hasAllowList = (rule) => Boolean(rule.allowPrefixes || rule.allowExact || rule.allowSelfDepth);

/**
 * PURE. `files` is `[{ path, text }]`. Returns `{ file, specifier, rule, why }`. One import may
 * violate more than one rule (a kernel file importing node:http breaks both the allow list and
 * the transport rule); both are reported, because each is a separate claim a reader may care about.
 * @param {ReadonlyArray<FileTuple>} files @param {ReadonlyArray<Rule>} [rules]
 * @returns {Violation[]}
 */
export function checkBoundaries(files, rules = RULES) {
  /** @type {Violation[]} */
  const findings = [];
  for (const { path, text } of files) {
    if (!/\.(mjs|js)$/.test(path)) continue;
    const governing = rules.filter((r) => r.from.test(path));
    if (governing.length === 0) continue;
    for (const specifier of importSpecifiers(text)) {
      const target = resolveSpecifier(path, specifier);
      for (const rule of governing) {
        const bad = hasAllowList(rule) ? !allows(rule, path, target) : denies(rule, target);
        if (bad) findings.push({ file: path, specifier, target, rule: rule.id, why: rule.why });
      }
    }
  }
  return findings;
}

/** Adapter to the shape check-all.mjs prints.
 * @param {ReadonlyArray<Violation>} violations @returns {Finding[]} */
export function toFindings(violations) {
  return violations.map((v) => ({
    rule: `boundaries:${v.rule}`,
    path: v.file,
    detail: `imports "${v.specifier}" (-> ${v.target}): ${v.why}`,
  }));
}
