// profiles.mjs — the three named selections, as data (`bootstrap/CONTRACTS.md`, "Profiles").
//
// A profile is a LIST, not an algorithm: a human reading this file must be able to say exactly
// what `--profile standard` installs without running anything. `custom` is deliberately absent
// — it is any selection the human makes, resolved by the planner against the catalog, so it has
// no entry to read.
//
// `conditional` is the one piece of nuance the contract asks for: Article 8 belongs to the
// minimal profile only when the target IS a git repository, because its whole mechanism is a
// commit trailer and three git hooks. It is expressed as a condition NAME drawn from the same
// closed list the manifests use (`host.requires`), so the detector that answers "git" answers
// it once, for both. An unmet condition drops the component and is REPORTED; it never silently
// degrades into something else.

/** @typedef {{ id: string, when: string }} ConditionalComponent */
/** @typedef {{ components: ReadonlyArray<string>, conditional: ReadonlyArray<ConditionalComponent>,
 *   description: string }} Profile */

/** The method's floor: the rules, the skills, the state CLI and the verification contract. */
const MINIMAL = Object.freeze(['method-core', 'engineering-skills', 'cellmode-cli', 'verification']);

/** The two optional method modules, both of which the repository can run without. */
const STANDARD = Object.freeze([...MINIMAL, 'adaptive', 'prompt-builder']);

/** The plugin protocol and the local viewer, on top of the whole method. */
const FULL = Object.freeze([...STANDARD, 'upp', 'observer']);

/** Article 8 rides along with every profile, and only where git exists to carry it. */
const WHEN_GIT = Object.freeze([Object.freeze({ id: 'article-8', when: 'git' })]);

/** @type {Readonly<Record<string, Profile>>} */
export const PROFILES = Object.freeze({
  minimal: Object.freeze({
    components: MINIMAL,
    conditional: WHEN_GIT,
    description: 'The method and nothing else: rules, skills, cell state, verification contract.',
  }),
  standard: Object.freeze({
    components: STANDARD,
    conditional: WHEN_GIT,
    description: 'Minimal plus the two optional method modules: Adaptive and the Prompt Builder.',
  }),
  full: Object.freeze({
    components: FULL,
    conditional: WHEN_GIT,
    description: 'Standard plus the Universal Plugin Protocol and the local Observer.',
  }),
});

/** @type {ReadonlyArray<string>} */
export const PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));

/**
 * PURE. The component ids a profile installs under a given set of host conditions.
 * `conditions` is the set of names a detector established as TRUE; anything absent from it is
 * treated as unmet, because an unestablished fact is UNKNOWN and UNKNOWN never installs.
 * @param {string} name @param {Iterable<string>} [conditions]
 * @returns {ReadonlyArray<string>}
 */
export function profileComponents(name, conditions = []) {
  const profile = PROFILES[name];
  if (profile === undefined) {
    throw new Error(`unknown profile "${name}": this bootstrap knows ${PROFILE_NAMES.join(', ')}`);
  }
  const met = new Set(conditions);
  const extra = profile.conditional.filter((entry) => met.has(entry.when)).map((entry) => entry.id);
  return Object.freeze([...profile.components, ...extra]);
}

/** PURE. The conditional components a profile did NOT install, with the condition each one
 * was waiting for — the list a plan has to SHOW rather than leave as a silence.
 * @param {string} name @param {Iterable<string>} [conditions]
 * @returns {ReadonlyArray<ConditionalComponent>} */
export function unmetConditions(name, conditions = []) {
  const profile = PROFILES[name];
  if (profile === undefined) return Object.freeze([]);
  const met = new Set(conditions);
  return Object.freeze(profile.conditional.filter((entry) => !met.has(entry.when)));
}
