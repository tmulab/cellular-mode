// plan-constants.mjs — the names and limits the plan and its renderer must agree on.
// Data only, so that neither the planner nor the renderer owns a value the other guesses.

/** The only existing files Bootstrap may modify, and then only by APPENDING a delimited managed
 * block. Everything else that already exists is proposed, never touched. The list is closed
 * because each entry means "we understand this file's comment syntax well enough to delimit a
 * block in it"; adding a name to it is a reviewable decision, not a convenience. */
export const MANAGED_FILES = Object.freeze(['AGENTS.md', 'CLAUDE.md', '.gitignore']);

/** The component field of an action the PLANNER itself contributes rather than any component.
 * Parenthesised so that it can never collide with a kebab-case component id. */
export const PLANNER = '(bootstrap)';

/** The authoritative installation record (decision BS2). */
export const INSTALL_MANIFEST = 'vault/install-manifest.json';

/** Git-ignored scratch for plans, drafts and reports in progress (decision BS2). */
export const SCRATCH_DIR = 'vault/bootstrap/';

/** The file whose managed block keeps the scratch directory out of the target's history. */
export const GITIGNORE = '.gitignore';

/** The hook directory Article 8's hooks are copied into, and the only hook path Bootstrap may
 * ever propose activating. */
export const HOOKS_DIR = '.githooks';

/** The component whose presence means hooks are relevant at all. */
export const HOOKS_COMPONENT = 'article-8';

/** The component that creates the method's own rule file and cell state. */
export const CORE_COMPONENT = 'method-core';

/** The component that generates the project-local verification contract. */
export const VERIFICATION_COMPONENT = 'verification';

/** The project-local verification contract itself: the suite `tools/gates/verify-final.mjs`
 * reads (decision BS3). The name is the gate's `VERIFICATION_REL`, which Bootstrap may not
 * import; `tests/verification-contract.test.mjs` asserts the two spellings agree. */
export const VERIFICATION_FILE = 'vault/verification.json';

/** The additive CI workflow Bootstrap may create, and never edit. */
export const CI_WORKFLOW_FILE = '.github/workflows/cellular-verify.yml';

/** How many untouched paths a plan carries verbatim; the rest live in the count. A plan is a
 * document a human reads, and a thousand filenames of somebody else's repository is noise. */
export const UNTOUCHED_CAP = 20;

/** The schema of the document `buildPlan` returns. */
export const PLAN_SCHEMA = 'cellular-mode/install-plan';
export const PLAN_VERSION = 1;

/** How many file paths each render mode shows before it summarises the remainder. Wording and
 * verbosity are the ONLY things a mode may change; see `adaptive/policies/boundaries.md`. */
export const MODE_CAPS = Object.freeze({ ready: 20, tired: 6, focus: 12, explore: 30 });

/** The default render mode: no mode declared means no mode inferred. */
export const DEFAULT_MODE = 'ready';
