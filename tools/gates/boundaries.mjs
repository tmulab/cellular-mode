// boundaries.mjs — import DIRECTION for the "Everything Is a Plugin" layout.
//
// The layout only means something if the arrows point one way, and an arrow that is
// only written in a document gets reversed by the first convenient import. The rules
// below are DATA: a reviewer can read the table without reading the algorithm, and a
// new rule is a new object, not a new branch.
//
// `eip/` may not exist yet. A gate that fails on an absent directory would block the
// cell that is building it, so absence is simply "no files matched, nothing to say".
// The rules are tested on in-memory fixtures, which is why they must be data.
import { HOST_GATE_IMPORTS, OBSERVER_PURE_IMPORTS } from './allowlists.mjs';
import { importSpecifiers } from './deps.mjs';

// The two import EXCEPTIONS are DATA and live in ./allowlists.mjs, each name checked by hand
// with its reason beside it. Re-exported here because the rules below are what a reader comes
// to this file for, and the lists are part of the same contract.
export { HOST_GATE_IMPORTS, OBSERVER_PURE_IMPORTS };

/** @typedef {import('./types.mjs').FileTuple} FileTuple */
/** @typedef {import('./types.mjs').Finding} Finding */
/**
 * One layering rule, as data. Either an ALLOW list or a DENY list, never both read:
 * `hasAllowList` decides which half applies.
 * @typedef {{ id: string, why: string, from: RegExp, allowPrefixes?: string[],
 *   allowExact?: string[], allowSelfDepth?: number,
 *   denyPrefixes?: string[], denyExact?: string[] }} Rule
 */
/** @typedef {{ file: string, specifier: string, target: string, rule: string, why: string }} Violation */

/** `eip/kernel/a.mjs` + `../sdk/b.mjs` -> `eip/sdk/b.mjs`. No disk access.
 * @param {string} fileRel @param {string} specifier @returns {string} */
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

/**
 * The rules. Each has `from` (which files it governs) and either an ALLOW list
 * (anything else is a violation) or a DENY list (everything else is fine).
 *   allowPrefixes  - target path prefixes that are permitted
 *   allowExact     - exact target paths that are permitted (a public entry point)
 *   allowSelfDepth - target must share the file's first N path segments (own module)
 *   denyPrefixes / denyExact - forbidden targets
 * `node:` built-ins pass every ALLOW rule: this is a Node project and the standard
 * library is not a layering concern. A DENY rule may still name one (see transport).
 * @type {Rule[]}
 */
/** @type {Rule[]} */
export const RULES = [
  {
    id: 'sdk-depends-on-nothing',
    why: 'eip/sdk is the floor: contract plus validators. If it imports the kernel, the contract stops being independently usable.',
    from: /^eip\/sdk\//,
    allowPrefixes: ['eip/sdk/'],
  },
  {
    id: 'kernel-imports-sdk-only',
    why: 'the kernel composes the contract; it must not know about hosts, plugins or orchestration.',
    from: /^eip\/kernel\//,
    allowPrefixes: ['eip/sdk/', 'eip/kernel/'],
  },
  {
    id: 'plugin-imports-sdk-and-own-dir',
    why: 'a plugin is replaceable: it may use the SDK, its own directory and shared domain code, never kernel internals, the host, orchestration, or a sibling plugin (siblings arrive through inject). An observer-* plugin is governed by its own rule instead, so that its extra allowance is read as an exception and not as the norm.',
    from: /^eip\/plugins\/(?!observer-)[^/]+\//,
    allowPrefixes: ['eip/sdk/', 'examples/text-stats/src/'],
    allowSelfDepth: 3,
  },
  {
    id: 'observer-plugin-imports-only-named-pure-modules',
    why: 'the observer reads a Cellular Mode vault, and a second parser of that vault would be a second truth; so it may import the SDK, its own directory and the NAMED pure modules listed in OBSERVER_PURE_IMPORTS - never state.mjs, never paths.mjs, never the CLI, never a disk-reading gate shell, never the kernel or the host.',
    from: /^eip\/plugins\/observer-[^/]+\//,
    allowPrefixes: ['eip/sdk/'],
    allowExact: [...OBSERVER_PURE_IMPORTS],
    allowSelfDepth: 3,
  },
  {
    id: 'orchestration-uses-kernel-public-entry',
    why: 'the agent gateway is a client of the kernel, not a part of it: it may import the kernel public entry and the SDK, not kernel internals.',
    from: /^eip\/orchestration\//,
    allowPrefixes: ['eip/sdk/'],
    allowExact: ['eip/kernel/index.mjs'],
    allowSelfDepth: 2,
  },
  {
    id: 'host-composes-everything',
    why: 'composition is the one place allowed to know all the parts - that is what makes the other layers independent. It may additionally import the three NAMED leaf modules of tools/gates listed in HOST_GATE_IMPORTS (the exclusion list, the evidence shape and the git-head reader), because those are facts about this repository that the host read ports and the gates must agree on exactly; everything else in tools/ stays out of reach.',
    from: /^eip\/host\//,
    allowPrefixes: ['eip/', 'examples/'],
    allowExact: [...HOST_GATE_IMPORTS],
  },
  {
    id: 'kernel-and-sdk-are-transport-free',
    why: 'the runtime must not depend on a frontend or a transport. HTTP, sockets and the host live in eip/host.',
    from: /^eip\/(sdk|kernel)\//,
    denyPrefixes: ['eip/host/'],
    denyExact: ['node:http', 'node:https', 'node:http2', 'node:net', 'node:tls', 'node:dgram'],
  },
  {
    id: 'cellular-mode-is-runtime-independent',
    why: 'Cellular Mode is a methodology. It must run in a repository that has no eip/ directory at all, so neither the CLI, the skills nor the docs may import the runtime.',
    from: /^(tools\/cellmode\/|skills\/|docs\/|adapters\/|templates\/)/,
    denyPrefixes: ['eip/'],
  },
];

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
 * PURE. `files` is `[{ path, text }]`. Returns `{ file, specifier, rule, why }`.
 * One import may violate more than one rule (a kernel file importing node:http
 * breaks both the allow list and the transport rule); both are reported, because
 * each is a separate claim a reader may care about.
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
