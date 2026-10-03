// exclusions.mjs — PURE. What is NOT ours to judge, as one list.
//
// Two readers now ask the same question — `scan.mjs`, which feeds the gates, and the
// host's repository READ PORT, which decides what an observer plugin may see — and the
// answer has to be the same sentence in both places. A second copy of this list would
// mean the auditor could read a file the gates never check, or miss one they do, and the
// drift would be invisible until someone trusted a report.
//
// No filesystem here on purpose: the list is data, so both callers stay testable and the
// pure gate modules keep their one property (text in, findings out).

/**
 * Never walked by either reader. Three directories, three different reasons:
 *   `node_modules` is not ours;
 *   `.git` is the record of the work, not the work;
 *   `.cellular` is GENERATED local output (the Trilateral evidence record). Excluding it
 *     keeps the gates deterministic: otherwise `npm run gates` would scan a different set
 *     of files depending on whether somebody had run `--evidence` first, and a gate whose
 *     scope depends on history is a gate nobody can reproduce.
 */
export const EXCLUDED_DIRS = Object.freeze(['node_modules', '.git', '.cellular']);

/** Binary-ish extensions nobody reads as text. */
export const BINARY = /\.(png|jpe?g|gif|ico|pdf|zip|woff2?|ttf|exe|dll)$/i;

/**
 * The ONE vendored exception, listed as two explicit paths rather than a pattern.
 *
 * `apps/observer/vendor/three@0.180.0/three.{core,module}.min.js` are upstream artefacts
 * from `npm pack three@0.180.0`, copied byte for byte. They are excluded from the gates
 * because every gate asks a question about HANDWRITTEN code: the 200-line rule, the
 * secret scan, the import-direction rule and the English-prose heuristic all mean nothing
 * against 721 KB of generated, minified JavaScript — and the secret scan in particular
 * produces false findings on minified identifier soup.
 *
 * What replaces them is stronger than a gate, not weaker: the bytes are pinned by SHA-256
 * in apps/observer/vendor/VENDOR.md and `tests/license.test.mjs` fails if either hash
 * changes by one bit. Nothing in that directory can be edited unnoticed.
 *
 * Deliberately NOT excluded: the directory's `LICENSE` (already out of scope by having no
 * extension), `VENDOR.md` (ours, and it must stay in English and under the line limit) and
 * `three.module.min.d.ts` (ours, the hand-written type subset — it is handwritten code and
 * is checked like any other).
 * @type {ReadonlyArray<string>}
 */
export const VENDORED_PATHS = Object.freeze([
  'apps/observer/vendor/three@0.180.0/three.core.min.js',
  'apps/observer/vendor/three@0.180.0/three.module.min.js',
]);

/** True for the hash-pinned upstream artefacts above, and for nothing else.
 * @param {string} rel @returns {boolean} */
export const isVendored = (rel) => VENDORED_PATHS.includes(rel);

/**
 * Path segments the host's read port must accept even though the shared safe-segment rule
 * cannot express them. Exactly one: `three@0.180.0`, a package name carrying a version.
 *
 * It is an EXACT STRING, deliberately, and not a loosened pattern. Two handwritten files
 * live in that directory — `VENDOR.md` and the `three.module.min.d.ts` type subset — and
 * the gates check both. A reader that could not open them would answer PASS on a file the
 * gates can answer FAIL on, which is the one kind of blind spot an auditor must not have.
 * @type {ReadonlyArray<string>}
 */
export const EXTRA_SEGMENTS = Object.freeze(['three@0.180.0']);

/** PURE. Is this repository-relative POSIX path outside what either reader may read?
 * @param {string} rel @returns {boolean} */
export function isExcluded(rel) {
  if (typeof rel !== 'string' || rel === '') return true;
  if (EXCLUDED_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`) || rel.includes(`/${dir}/`))) {
    return true;
  }
  return isVendored(rel);
}
