// fixtures/availability.mjs — TEST-ONLY. WHICH components this checkout can actually install, so
// that a test standing on the REAL catalog is correct in BOTH worlds.
//
// There are two worlds, and both are real. In a complete checkout every component is available and
// every assertion about the real tree runs exactly as it always did. In a checkout that deleted an
// optional module — which `npm run rehearse:adaptive-removal` and `rehearse:builder-removal` create
// on purpose — some components are COMPONENT_UNAVAILABLE, and the honest assertion there is the
// REFUSAL, not a smaller version of the original claim.
//
// So this module answers one question — "is this component, or this profile, installable here?" —
// and the tests branch on it EXPLICITLY. Nothing is skipped, nothing is weakened: a test that
// cannot run its present-world claim asserts the refusal instead, and
// `bootstrap-availability.test.mjs` asserts that in THIS repository the unavailable set is empty,
// so the branch can never quietly become the only one that ever runs.
//
// Under `fixtures/`, the suffix every component manifest excludes, so none of it is ever copied.
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../catalog.mjs';
import { expandFiles } from '../catalog-expand.mjs';
import { CODES, isBootstrapError } from '../errors.mjs';
import { profileComponents } from '../profiles.mjs';
import { diskSource } from '../source-read.mjs';

/** @typedef {import('../catalog.mjs').Component} Component */
/** @typedef {import('../catalog.mjs').Expanded} Expanded */
/** @typedef {import('../catalog-expand.mjs').ExpandSource} ExpandSource */
/** @typedef {{ available: ReadonlyArray<{ id: string, files: ReadonlyArray<Expanded> }>,
 *   unavailable: ReadonlyArray<{ id: string, missing: string }>, ids: ReadonlySet<string>,
 *   expanded: Readonly<Record<string, ReadonlyArray<Expanded>>> }} Partition */

/** PURE and TOTAL. True when `error` is the one refusal this module is about.
 * @param {unknown} error @returns {boolean} */
export function isUnavailable(error) {
  return isBootstrapError(error)
    && /** @type {{ code: string }} */ (error).code === CODES.COMPONENT_UNAVAILABLE;
}

/** The assertion form, for `assert.throws(fn, unavailableFor('adaptive'))`: the code must match and,
 * when an id is given, the refusal must NAME that component and a relative missing path.
 * @param {string} [id] @returns {(error: unknown) => boolean} */
export function unavailableFor(id) {
  return (error) => {
    if (!isUnavailable(error)) return false;
    const details = /** @type {{ details: Record<string, unknown> }} */ (error).details;
    if (id !== undefined && details.component !== id) return false;
    return typeof details.source === 'string' && !details.source.startsWith('/')
      && !/^[A-Za-z]:/.test(details.source);
  };
}

/** Every component of a loaded catalog, split into what this source can install and what it
 * cannot. Any error that is NOT the availability refusal is re-thrown: a partition that swallowed
 * a validation bug would be a test that stopped testing.
 * @param {import('../catalog.mjs').CatalogResult} catalog @param {ExpandSource} source
 * @returns {Partition} */
export function partition(catalog, source) {
  /** @type {Array<{ id: string, files: ReadonlyArray<Expanded> }>} */
  const available = [];
  /** @type {Array<{ id: string, missing: string }>} */
  const unavailable = [];
  for (const component of catalog.ok ? catalog.components : []) {
    const id = String(component.id);
    try {
      available.push({ id, files: expandFiles(component, source) });
    } catch (error) {
      if (!isUnavailable(error)) throw error;
      const details = /** @type {{ details: Record<string, unknown> }} */ (error).details;
      unavailable.push({ id, missing: String(details.source ?? '') });
    }
  }
  return Object.freeze({
    available: Object.freeze(available),
    unavailable: Object.freeze(unavailable),
    ids: new Set(available.map(({ id }) => id)),
    expanded: Object.freeze(Object.fromEntries(available.map(({ id, files }) => [id, files]))),
  });
}

/** The components a profile names that this checkout cannot install. Empty means the profile's
 * present-world assertions are the ones to run.
 * @param {string} profile @param {Partition} part @param {ReadonlyArray<string>} [host]
 * @returns {ReadonlyArray<string>} */
export function missingForProfile(profile, part, host = ['git']) {
  return Object.freeze(profileComponents(profile, host).filter((id) => !part.ids.has(id)));
}

/** THIS checkout's real catalog, partitioned once. Computed at import so that a CLI-level test —
 * which cannot see a catalog from the outside — can still ask the one question it needs. */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SOURCE = diskSource(ROOT);
export const HERE = partition(loadCatalog(ROOT, SOURCE), SOURCE);

/** The components `profile` needs that THIS checkout cannot install. Empty here; non-empty inside a
 * removal rehearsal's copy, where a CLI asked for that profile must REFUSE with exit 2 instead of
 * installing. @param {string} profile @returns {ReadonlyArray<string>} */
export function absentFor(profile) {
  return missingForProfile(profile, HERE);
}

/** The exit status a CLI must answer with when a profile names something unavailable. Named so that
 * every branch cites the same contract row rather than a bare 2. */
export const UNAVAILABLE_EXIT = 2;

/** Richest first: the order a fallback walks down. `minimal` needs no optional module, so it is
 * installable in every checkout and the chain always ends. */
const ORDER = Object.freeze(['full', 'standard', 'minimal']);

/**
 * The profile a test should ASK FOR when the profile itself is incidental to its claim — it wants a
 * rich install, not a particular one. `preferred` when this checkout can install it (always, here),
 * otherwise the richest one below it that this checkout can. ONE documented rule in one place, and
 * never silent: `bootstrap-availability.test.mjs` asserts that the answer differs from `preferred`
 * exactly when `preferred` is unavailable, so a fallback can only happen where one is needed.
 * @param {string} preferred @returns {string}
 */
export function profileHere(preferred) {
  const from = ORDER.indexOf(preferred);
  const chain = from < 0 ? ORDER : ORDER.slice(from);
  return chain.find((name) => absentFor(name).length === 0) ?? 'minimal';
}
