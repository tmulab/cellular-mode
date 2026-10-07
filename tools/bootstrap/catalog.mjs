// catalog.mjs — every component manifest, validated, cross-checked and frozen.
//
// Two jobs, both pure given an injected reader. First, LOAD: read `bootstrap/components/*.json`,
// validate each one, and refuse the set as a whole if a dependency names a component that does
// not exist or if the dependency graph has a cycle — a per-file validator cannot see either,
// and a planner that discovers a cycle at install time discovers it too late.
//
// Second, EXPAND: turn a manifest's `files` entries into the concrete relative paths a copy would
// touch, against a real tree. That half lives in `./catalog-expand.mjs` — it is the only part that
// reads a source, and a component whose declared source is absent from this checkout is
// COMPONENT_UNAVAILABLE there, never an empty file list.
import { validateComponent } from './component-schema.mjs';
import { expandFiles, expandSelection, isExcluded } from './catalog-expand.mjs';

// The expansion half lives next door (200-line rule) and is re-exported here, which is the
// address every call site already knows. See `./catalog-expand.mjs`.
export { expandFiles, expandSelection, isExcluded };

/** @typedef {import('./component-parts.mjs').ManifestError} ManifestError */
/** @typedef {Readonly<Record<string, unknown>>} Component */
/** @typedef {{ source: string, target: string }} Expanded */
/** @typedef {{ ok: true, root: string, components: ReadonlyArray<Component>,
 *     byId: Readonly<Record<string, Component>> }
 *   | { ok: false, errors: ReadonlyArray<ManifestError> }} CatalogResult */

/** Where the manifests live, relative to the source root. */
export const COMPONENTS_DIR = 'bootstrap/components';

/** @type {(path: string, message: string) => ManifestError} */
const fail = (path, message) => ({ path, message });

/** @param {unknown} value @returns {ReadonlyArray<string>} */
const ids = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);

/** @param {Component} component @returns {ReadonlyArray<string>} */
const requiredOf = (component) => [...ids(component.dependsOn), ...ids(component.optionalDependsOn)];

/**
 * The first dependency cycle in the graph, as the path that closes it, or `null`.
 * Depth-first with an explicit colour map: grey means "on the current path".
 * @param {ReadonlyArray<Component>} components @returns {ReadonlyArray<string> | null}
 */
export function findCycle(components) {
  /** @type {Map<string, ReadonlyArray<string>>} */
  const edges = new Map(components.map((c) => [String(c.id), ids(c.dependsOn)]));
  /** @type {Map<string, number>} */
  const colour = new Map();
  /** @type {string[]} */
  const stack = [];
  /** @param {string} id @returns {ReadonlyArray<string> | null} */
  const visit = (id) => {
    if (colour.get(id) === 2) return null;
    if (colour.get(id) === 1) return [...stack.slice(stack.indexOf(id)), id];
    colour.set(id, 1);
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      const found = visit(next);
      if (found !== null) return found;
    }
    stack.pop();
    colour.set(id, 2);
    return null;
  };
  for (const id of edges.keys()) {
    const found = visit(id);
    if (found !== null) return found;
  }
  return null;
}

/**
 * PURE given `source`. Loads and validates every manifest, then checks the set as a whole.
 * @param {string} sourceRoot absolute path, used only in error text as the dir that was read
 * @param {{ read: (rel: string) => string, list: (rel: string) => ReadonlyArray<string> }} source
 * @returns {CatalogResult}
 */
export function loadCatalog(sourceRoot, source) {
  /** @type {ManifestError[]} */
  const errors = [];
  /** @type {Component[]} */
  const components = [];
  const files = [...source.list(COMPONENTS_DIR)].filter((rel) => rel.endsWith('.json')).sort();
  if (files.length === 0) errors.push(fail(COMPONENTS_DIR, `no component manifest found under ${COMPONENTS_DIR}`));
  for (const rel of files) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(source.read(rel));
    } catch (error) {
      errors.push(fail(rel, `not valid JSON: ${error instanceof Error ? error.message : 'unknown'}`));
      continue;
    }
    const result = validateComponent(parsed);
    if (!result.ok) {
      for (const problem of result.errors) errors.push(fail(`${rel}:${problem.path}`, problem.message));
      continue;
    }
    const component = /** @type {Component} */ (parsed);
    const expected = `${COMPONENTS_DIR}/${String(component.id)}.json`;
    if (rel !== expected) errors.push(fail(rel, `a manifest for "${String(component.id)}" must be named ${expected}`));
    components.push(component);
  }
  errors.push(...integrityErrors(components));
  if (errors.length > 0) return { ok: false, errors: Object.freeze(errors) };
  /** @type {Record<string, Component>} */
  const byId = {};
  for (const component of components) byId[String(component.id)] = Object.freeze(component);
  return Object.freeze({
    ok: true,
    components: Object.freeze([...components]),
    byId: Object.freeze(byId),
    root: sourceRoot,
  });
}

/** Referential integrity of the set: unique ids, known references, no self-dependency, no
 * cycle, and no component that both depends on and conflicts with the same id.
 * @param {ReadonlyArray<Component>} components @returns {ManifestError[]} */
export function integrityErrors(components) {
  /** @type {ManifestError[]} */
  const errors = [];
  const known = new Set(components.map((c) => String(c.id)));
  const seen = new Set();
  for (const component of components) {
    const id = String(component.id);
    if (seen.has(id)) errors.push(fail(id, 'duplicate component id'));
    seen.add(id);
    for (const key of ['dependsOn', 'optionalDependsOn', 'conflicts']) {
      for (const reference of ids(component[key])) {
        if (!known.has(reference)) errors.push(fail(`${id}.${key}`, `references unknown component "${reference}"`));
        if (reference === id) errors.push(fail(`${id}.${key}`, 'a component may not reference itself'));
      }
    }
    for (const reference of requiredOf(component)) {
      if (ids(component.conflicts).includes(reference)) {
        errors.push(fail(`${id}.conflicts`, `"${reference}" is both a dependency and a conflict`));
      }
    }
  }
  const cycle = findCycle(components);
  if (cycle !== null) errors.push(fail(cycle.join(' -> '), 'dependency cycle'));
  return errors;
}
