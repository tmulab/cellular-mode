// resolve.mjs — from what the human asked for to the coherent set of components, with a REASON
// for every one of them and a reported reason for every one that was dropped.
//
// PURE: a validated catalog in, a TargetFacts in, a selection out. It reads no disk, runs no
// command and writes nothing.
//
// Three properties matter more than this file's size.
//   SHOWN — a dependency is never added silently. Everything added on the human's behalf appears
//     in `added` with the component that pulled it in, so the approval step shows the truth.
//   REFUSED — a conflicting pair is never resolved by picking a winner (`refuseConflicts`).
//   DETERMINISTIC — the order is a topological sort of the selected subgraph with ties broken by
//     id, so the same request against the same catalog yields byte-identical output every time.
//
// An unmet `host.requires` is answered two ways on purpose. Explicitly requested, it is an
// error: the human asked for an impossibility and deserves to be told. Arriving from a profile's
// condition, it is a reported skip: the profile adapts, the human did not ask.
import { PROFILES, PROFILE_NAMES } from './profiles.mjs';
import { CODES, refuse } from './errors.mjs';
import { assertFacts, factConditions } from './target-facts.mjs';
import { dedupeSkipped, ids, order, refuseConflicts, unmetOf } from './resolve-parts.mjs';

/** @typedef {import('./target-facts.mjs').TargetFacts} TargetFacts */
/** @typedef {import('./catalog.mjs').Component} Component */
/** @typedef {'profile'|'requested'|'dependency'|'condition'} Origin */
/** @typedef {{ id: string, reason: string }} Selected */
/** @typedef {{ id: string, by: string }} Added */
/** @typedef {{ id: string, reason: string }} Skipped */
/** @typedef {{ profile: string, components: ReadonlyArray<Selected>, added: ReadonlyArray<Added>,
 *   skipped: ReadonlyArray<Skipped>, conflicts: ReadonlyArray<string> }} Selection */
/** @typedef {{ profile?: string, components?: ReadonlyArray<string> }} Request */
/** @typedef {{ id: string, reason: string, origin: Origin }} Root */

/** Which component adapts the method to which tool, when the target already uses it. */
export const ADAPTER_FOR = Object.freeze({ claude: 'claude-code-adapter', cursor: 'cursor-adapter' });

/** The profile name that means "exactly what the human listed". */
export const CUSTOM = 'custom';

/** @param {Request} request @returns {string} */
function profileName(request) {
  const asked = request.profile;
  const requested = ids(request.components);
  const known = [...PROFILE_NAMES, CUSTOM];
  if (asked === undefined) {
    if (requested.length > 0) return CUSTOM;
    throw refuse(CODES.USAGE, 'name a profile or list components', { profiles: known });
  }
  if (asked !== CUSTOM && !PROFILE_NAMES.includes(asked)) {
    throw refuse(CODES.UNKNOWN_PROFILE, `unknown profile "${asked}"`, { profiles: known });
  }
  if (asked === CUSTOM && requested.length === 0) {
    throw refuse(CODES.USAGE, 'the custom profile installs exactly what you list, so the list may not be empty', {});
  }
  return asked;
}

/**
 * PURE. The roots before any dependency walk: the profile's own list, the conditional components
 * whose condition holds, whatever the human named, and the adapters for the tools the target
 * already uses. An unmet condition becomes a reported skip here rather than a silence.
 * @param {string} profile @param {ReadonlyArray<string>} requested @param {ReadonlySet<string>} met
 * @param {TargetFacts} facts @param {Readonly<Record<string, Component>>} byId
 * @returns {{ roots: ReadonlyArray<Root>, skipped: Skipped[] }}
 */
export function rootsOf(profile, requested, met, facts, byId) {
  /** @type {Root[]} */
  const roots = [];
  /** @type {Skipped[]} */
  const skipped = [];
  const seen = new Set();
  /** @type {(id: string, reason: string, origin: Origin) => void} */
  const add = (id, reason, origin) => {
    if (seen.has(id)) return;
    seen.add(id);
    roots.push({ id, reason, origin });
  };
  if (profile !== CUSTOM) {
    const declared = PROFILES[profile];
    for (const id of declared?.components ?? []) add(id, 'profile', 'profile');
    for (const entry of declared?.conditional ?? []) {
      if (met.has(entry.when)) add(entry.id, `condition ${entry.when}`, 'condition');
      else skipped.push({ id: entry.id, reason: `condition ${entry.when} not met` });
    }
  }
  for (const id of requested) add(id, 'requested', 'requested');
  for (const tool of /** @type {ReadonlyArray<'claude'|'cursor'>} */ (['claude', 'cursor'])) {
    const id = ADAPTER_FOR[tool];
    if (facts.tools[tool] && byId[id] !== undefined) add(id, `condition ${tool}`, 'condition');
  }
  return { roots, skipped };
}

/**
 * PURE. Resolve a request into the component set a plan will be built from. Transitive
 * `dependsOn` is followed and reported; `optionalDependsOn` never pulls anything in — an
 * optional dependency is honoured only when it is in the set for a reason of its own.
 * @param {{ ok: boolean, byId?: Readonly<Record<string, Component>> }} catalog from `loadCatalog`
 * @param {Request} request @param {unknown} facts a TargetFacts, validated here
 * @returns {Selection}
 */
export function resolveSelection(catalog, request, facts) {
  if (!catalog.ok || catalog.byId === undefined) {
    throw refuse(CODES.BAD_MANIFEST, 'the component catalog did not load, so nothing can be planned', {});
  }
  const byId = catalog.byId;
  const checked = assertFacts(facts);
  const met = factConditions(checked);
  const profile = profileName(request);
  const requested = ids(request.components);
  const unknown = requested.filter((id) => byId[id] === undefined);
  if (unknown.length > 0) {
    throw refuse(CODES.UNKNOWN_COMPONENT, `unknown component${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`,
      { unknown, known: Object.keys(byId).sort() });
  }
  const { roots, skipped } = rootsOf(profile, requested, met, checked, byId);
  const { reasons, added } = walk(roots, byId, met, skipped);
  const chosen = [...reasons.keys()];
  refuseConflicts(chosen, byId);
  return Object.freeze({
    profile,
    components: Object.freeze(order(chosen, byId)
      .map((id) => Object.freeze({ id, reason: String(reasons.get(id)) }))),
    added: Object.freeze([...added]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((entry) => Object.freeze({ ...entry }))),
    skipped: dedupeSkipped(skipped, new Set(chosen)),
    conflicts: Object.freeze([]),
  });
}

/** The breadth-first dependency closure. `skipped` is appended to in place: a component dropped
 * for an unmet host condition is reported, never dropped quietly.
 * @param {ReadonlyArray<Root>} roots @param {Readonly<Record<string, Component>>} byId
 * @param {ReadonlySet<string>} met @param {Skipped[]} skipped
 * @returns {{ reasons: Map<string, string>, added: Added[] }} */
function walk(roots, byId, met, skipped) {
  /** @type {Map<string, string>} */
  const reasons = new Map();
  /** @type {Added[]} */
  const added = [];
  const rootById = new Map(roots.map((root) => [root.id, root]));
  /** @type {{ id: string, origin: Origin, by: string }[]} */
  const queue = roots.map((root) => ({ id: root.id, origin: root.origin, by: '' }));
  while (queue.length > 0) {
    const item = /** @type {{ id: string, origin: Origin, by: string }} */ (queue.shift());
    if (reasons.has(item.id)) continue;
    const component = byId[item.id];
    if (component === undefined) {
      throw refuse(CODES.UNKNOWN_COMPONENT, `unknown component: ${item.id}`, { unknown: [item.id] });
    }
    const unmet = unmetOf(component, met);
    if (unmet.length > 0) {
      if (item.origin === 'profile' || item.origin === 'condition') {
        skipped.push({ id: item.id, reason: `host requires ${unmet.join(', ')}` });
        continue;
      }
      throw refuse(CODES.HOST_UNSUPPORTED,
        `"${item.id}" requires ${unmet.join(', ')}, which this target does not provide`,
        { id: item.id, requires: unmet, requiredBy: item.by === '' ? null : item.by });
    }
    const root = rootById.get(item.id);
    reasons.set(item.id, root !== undefined ? root.reason : `dependency of ${item.by}`);
    if (root === undefined) added.push({ id: item.id, by: item.by });
    for (const dependency of ids(component.dependsOn)) {
      if (!reasons.has(dependency)) queue.push({ id: dependency, origin: 'dependency', by: item.id });
    }
  }
  return { reasons, added };
}
