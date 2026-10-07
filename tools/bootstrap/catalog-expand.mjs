// catalog-expand.mjs — turning a component manifest's `files` into the concrete relative paths a
// copy would touch. Split from `catalog.mjs` for the 200-line rule and for a reader's sake: LOADING
// the catalog ("are these valid, coherent manifests?") and EXPANDING one against a tree ("what
// would this copy, here?") are two questions, and only the second one touches a source tree.
//
// A directory entry (`source` ending in `/`) is expanded by a read-only walk of the SOURCE, so the
// answer is always what the tree actually holds rather than what a list once said; `exclude` then
// removes the paths that are not runtime. Generate and reference entries expand to nothing: there
// is no source file to read.
//
// FAIL CLOSED ON AN ABSENT SOURCE. A component may declare a directory this checkout does not hold
// — `adaptive/` and `tools/prompt-builder/` are OPTIONAL modules, and a removal rehearsal deletes
// them on purpose. Expanding such a component is COMPONENT_UNAVAILABLE (exit 2), naming the
// component and the missing relative path: never an ENOENT crash, and never an empty file list,
// because a profile quietly installing less than it promised is the worse of the two failures.
// `catalog.mjs` re-exports everything here, so no call site has to know about the split.
import { CODES, refuse } from './errors.mjs';

/** @typedef {import('./catalog.mjs').Component} Component */
/** @typedef {import('./catalog.mjs').Expanded} Expanded */
/** @typedef {{ walk: (rel: string) => ReadonlyArray<string>,
 *   has?: (rel: string) => boolean }} ExpandSource */

/** @param {unknown} value @returns {ReadonlyArray<string>} */
const ids = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);

/** True when a source-relative path is removed by one of a component's exclude rules.
 * An entry ending in `/` excludes a directory anywhere in the path; any other entry is a
 * SUFFIX of the path, which covers `.test.mjs`, `-fixture.mjs`, `README.md` and a single
 * named file such as `eip/host/cli.mjs` with one rule instead of four kinds of glob.
 * @param {string} rel @param {ReadonlyArray<string>} exclude @returns {boolean} */
export function isExcluded(rel, exclude) {
  const segments = rel.split('/');
  return exclude.some((rule) => (rule.endsWith('/')
    ? segments.slice(0, -1).includes(rule.slice(0, -1))
    : rel.endsWith(rule)));
}

/**
 * PURE given `source`. The concrete, sorted, relative files a component's COPY entries touch.
 * Generate and reference entries contribute nothing: a generated artefact has no source file.
 * @param {Component} component
 * @param {{ walk: (rel: string) => ReadonlyArray<string>,
 *   has?: (rel: string) => boolean }} source
 * @returns {ReadonlyArray<Expanded>}
 */
export function expandFiles(component, source) {
  const exclude = ids(component.exclude);
  const entries = Array.isArray(component.files) ? component.files : [];
  /** @type {Expanded[]} */
  const out = [];
  for (const entry of entries) {
    const record = /** @type {Record<string, unknown>} */ (entry);
    if (record.mode !== 'copy') continue;
    const from = String(record.source);
    const to = String(record.target);
    if (!from.endsWith('/')) {
      if (!isExcluded(from, exclude)) out.push({ source: from, target: to });
      continue;
    }
    const base = from.replace(/\/+$/, '');
    const targetBase = to.replace(/\/+$/, '');
    for (const rel of walkOrRefuse(component, source, base)) {
      if (isExcluded(rel, exclude)) continue;
      out.push({ source: rel, target: `${targetBase}${rel.slice(base.length)}` });
    }
  }
  return Object.freeze(out.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0)));
}

/** The files under one declared directory, or a COMPONENT_UNAVAILABLE refusal. Two layers, both
 * fail closed: `has` asks the question directly, and any throw from the walk itself (a tree that
 * vanished mid-read, a reader that refuses an unknown path) becomes the same named refusal rather
 * than a stack trace. @param {Component} component
 * @param {{ walk: (rel: string) => ReadonlyArray<string>, has?: (rel: string) => boolean }} source
 * @param {string} base @returns {ReadonlyArray<string>} */
function walkOrRefuse(component, source, base) {
  const id = String(component.id);
  if (typeof source.has === 'function' && !source.has(base)) throw unavailable(id, base);
  try {
    return source.walk(base);
  } catch {
    throw unavailable(id, base);
  }
}

/** The one refusal, with the hint a human can act on. @param {string} id @param {string} missing
 * @returns {Error} */
function unavailable(id, missing) {
  return refuse(CODES.COMPONENT_UNAVAILABLE,
    `component "${id}" is not available in this checkout: it copies ${missing}, which is not here. `
    + `Install without it — choose --profile custom and a --components list that omits "${id}".`,
    { component: id, source: missing });
}

/**
 * PURE given `source`. The copy files of every component in a selection, keyed by id: the map a
 * plan needs, built in ONE place so that exactly one code path decides what an unavailable
 * component does. A flow that assembled this map itself would be a second such decision.
 * @param {Readonly<Record<string, Component>>} byId @param {ReadonlyArray<string>} selected
 * @param {{ walk: (rel: string) => ReadonlyArray<string>, has?: (rel: string) => boolean }} source
 * @returns {Readonly<Record<string, ReadonlyArray<Expanded>>>}
 */
export function expandSelection(byId, selected, source) {
  return Object.freeze(Object.fromEntries(selected.map((id) => {
    const component = byId[id];
    if (component === undefined) throw refuse(CODES.UNKNOWN_COMPONENT, `no such component: ${id}`, { id });
    return [id, expandFiles(component, source)];
  })));
}
