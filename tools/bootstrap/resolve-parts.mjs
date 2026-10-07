// resolve-parts.mjs — the three set-level questions of resolution, apart from the walk itself.
// PURE. Split from `resolve.mjs` for the 200-line rule and because each of these is a decision a
// reviewer may want to read on its own: how incompatibility is refused, how order is fixed, and
// which reported skips survive.
import { CODES, refuse } from './errors.mjs';

/** @typedef {import('./catalog.mjs').Component} Component */
/** @typedef {{ id: string, reason: string }} Skipped */

/** @type {(value: unknown) => ReadonlyArray<string>} */
export const ids = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);

/** PURE. The closed host conditions a component declares it needs.
 * @param {Component} component @returns {ReadonlyArray<string>} */
export function requiresOf(component) {
  const host = component.host;
  return typeof host === 'object' && host !== null
    ? ids(/** @type {Record<string, unknown>} */ (host).requires)
    : [];
}

/** PURE. The host conditions a component needs that these facts did not establish.
 * @param {Component} component @param {ReadonlySet<string>} met @returns {ReadonlyArray<string>} */
export const unmetOf = (component, met) => requiresOf(component).filter((name) => !met.has(name));

/**
 * Every declared conflict inside a chosen set, as sorted `a + b` pairs. A non-empty set raises
 * CONFLICT: the contract says a conflict refuses, and a planner that picked a side would be
 * deciding something only the human may decide.
 * @param {ReadonlyArray<string>} chosen @param {Readonly<Record<string, Component>>} byId
 * @returns {void}
 */
export function refuseConflicts(chosen, byId) {
  const inSet = new Set(chosen);
  /** @type {Set<string>} */
  const pairs = new Set();
  for (const id of chosen) {
    for (const other of ids(byId[id]?.conflicts)) {
      if (inSet.has(other)) pairs.add([id, other].sort().join(' + '));
    }
  }
  if (pairs.size > 0) {
    const listed = [...pairs].sort();
    throw refuse(CODES.CONFLICT, `components declared incompatible: ${listed.join('; ')}`, { pairs: listed });
  }
}

/**
 * PURE. Dependencies first, ties broken by id — a total order, so the same set always renders
 * the same way. A cycle cannot survive `loadCatalog`, so one here is a BAD_MANIFEST rather than
 * a silent partial order.
 * @param {ReadonlyArray<string>} chosen @param {Readonly<Record<string, Component>>} byId
 * @returns {ReadonlyArray<string>}
 */
export function order(chosen, byId) {
  const inSet = new Set(chosen);
  /** @type {Map<string, ReadonlyArray<string>>} */
  const needs = new Map(chosen.map((id) => [id, ids(byId[id]?.dependsOn).filter((d) => inSet.has(d))]));
  /** @type {string[]} */
  const out = [];
  const done = new Set();
  while (out.length < chosen.length) {
    const next = [...needs.keys()]
      .filter((id) => !done.has(id) && (needs.get(id) ?? []).every((d) => done.has(d)))
      .sort()[0];
    if (next === undefined) {
      throw refuse(CODES.BAD_MANIFEST, 'the selected components cannot be ordered: a dependency cycle remains',
        { remaining: chosen.filter((id) => !done.has(id)).sort() });
    }
    done.add(next);
    out.push(next);
  }
  return Object.freeze(out);
}

/** PURE. The reported skips, minus anything that ended up selected anyway (a component dropped
 * by one profile condition may still arrive as somebody's dependency), one entry per id, by id.
 * @param {ReadonlyArray<Skipped>} skipped @param {ReadonlySet<string>} chosen @returns {ReadonlyArray<Skipped>} */
export function dedupeSkipped(skipped, chosen) {
  /** @type {Map<string, string>} */
  const kept = new Map();
  for (const entry of skipped) {
    if (chosen.has(entry.id) || kept.has(entry.id)) continue;
    kept.set(entry.id, entry.reason);
  }
  return Object.freeze([...kept.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([id, reason]) => Object.freeze({ id, reason })));
}
