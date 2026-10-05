// publication.mjs — the last gate before a contract may be committed. PURE and TOTAL.
//
// The human requirement recorded in prompt-builder/CONTRACTS.md (2026-10-04): a contract is
// eligible for version control only when it carries no credential-shaped value, no absolute
// or personal filesystem path, and no e-mail address or telephone number. Discovery already
// refuses those at the moment they are typed (answers.mjs); this file asks the SAME question
// again, over the whole finished document, because a contract can also arrive by hand, by
// merge, or from an earlier version of this tool.
//
// IT REPORTS WHERE, NEVER WHAT. A finding is `{ path, kind }` and nothing else. A report that
// echoed the value it objected to would copy the secret into a terminal, a log and quite
// possibly the issue somebody pastes it into — the one place it must not go is the second
// copy. The path is enough to find it; the person who wrote it already knows what it says.
//
// PASSING PROVES NOTHING ABOUT SAFETY. It proves that a known set of shapes is absent. A
// credential with an unusual shape passes, which is why this is a gate and not a guarantee,
// and why `approve --confirm` remains a human action.
//
// The detectors are Cell 2's (sensitive.mjs), imported and not re-stated: a second copy of a
// credential shape drifts, and the copy that drifts is the one nobody runs.
import { BuilderError, CODES } from './errors.mjs';
import { findContacts, findPersonalPaths, findSensitive } from './sensitive.mjs';
import { validateContract } from './validate.mjs';

/** @typedef {import('./types.mjs').PublicationFinding} PublicationFinding */
/** @typedef {import('./types.mjs').PublicationResult} PublicationResult */

/** How deep the walk goes before it stops looking. The contract schema is three levels deep;
 * `extensions` is capped at four by validate.mjs. Eight is slack, not permission. */
export const MAX_WALK_DEPTH = 8;

/** @type {(value: unknown) => boolean} */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every string in `value`, as `[dotPath, text]`, in a deterministic order.
 * @param {unknown} value @returns {Array<[string, string]>} */
export function walkStrings(value) {
  /** @type {Array<[string, string]>} */
  const out = [];
  /** @type {(node: unknown, path: string, depth: number) => void} */
  const visit = (node, path, depth) => {
    if (typeof node === 'string') {
      out.push([path === '' ? '(root)' : path, node]);
      return;
    }
    if (depth >= MAX_WALK_DEPTH) return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => visit(item, `${path}[${i}]`, depth + 1));
      return;
    }
    if (!isRecord(node)) return;
    for (const key of Object.keys(/** @type {Record<string, unknown>} */ (node))) {
      const child = /** @type {Record<string, unknown>} */ (node)[key];
      visit(child, path === '' ? key : `${path}.${key}`, depth + 1);
    }
  };
  visit(value, '', 0);
  return out;
}

/**
 * PURE and TOTAL. Is this contract fit to be published? Every string in it is scanned for
 * credential shapes, machine-local paths, e-mail addresses and telephone numbers. `ok` is
 * false as soon as one finding exists; the findings name the path and the shape only.
 * @param {unknown} contract @returns {PublicationResult}
 */
export function publicationCheck(contract) {
  /** @type {PublicationFinding[]} */
  const findings = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const [path, text] of walkStrings(contract)) {
    for (const hit of [...findSensitive(text), ...findPersonalPaths(text), ...findContacts(text)]) {
      const key = `${path}\u0000${hit.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ path, kind: hit.kind });
    }
  }
  return { ok: findings.length === 0, findings };
}

/** PURE. One line per finding, written for the person who has to fix it. Never the value.
 * @param {ReadonlyArray<PublicationFinding>} findings @returns {string[]} */
export function describeFindings(findings) {
  return findings.map(({ path, kind }) => `${path}: ${kind} — rewrite that field without it`);
}

/**
 * PURE. The same two questions, as a REFUSAL: is this a valid contract, and is it fit to
 * publish? It lives here, next to the check, so that the code which writes the file and the
 * code which approves it raise the identical error rather than two near-identical ones.
 * Throws `BAD_CONTRACT` or `PUBLICATION_CHECK`, with the list in `details`.
 * @param {unknown} contract @param {string} [what] @returns {void}
 */
export function assertPublishable(contract, what = 'the contract') {
  const schema = validateContract(contract);
  if (!schema.ok) {
    throw new BuilderError(CODES.BAD_CONTRACT, `${what} is one the schema refuses: ${schema.errors.length} error(s)`, { errors: schema.errors });
  }
  const result = publicationCheck(contract);
  if (!result.ok) {
    throw new BuilderError(CODES.PUBLICATION_CHECK, `${what} is not fit to publish: ${result.findings.length} finding(s)`, { findings: result.findings });
  }
}
