// PURE. One audit: gathered data in, `{ at, findings, summary }` out.
//
// The plugin does the reading; this function does the judging, and it does it over plain
// values. That split is what makes every rule in this feature testable without a repository,
// a vault, a host or a socket — and it is why the auditor can promise that it writes nothing:
// there is nothing in this module that could.
//
// The ORDER of the checks is the order a reader wants: the method's own state first (that is
// what the project is), then the code, then the three legs it cannot run itself.
import { CODE_EXTENSIONS, newestSource } from './sources.mjs';
import {
  cellContractChecks, cellStateChecks, dependencyChecks, doneEvidenceChecks,
} from './checks-vault.mjs';
import {
  acceptanceChecks, boundaryChecks, depsChecks, policyChecks, secretChecks, sizeChecks,
} from './checks-repo.mjs';
import { freshnessChecks, legChecks } from './checks-evidence.mjs';
import { assignIds, draft, summarise } from './statuses.mjs';

/** @typedef {import('./types.mjs').AuditInput} AuditInput */
/** @typedef {import('./types.mjs').AuditResult} AuditResult */
/** @typedef {import('./types.mjs').Draft} Draft */

export { CODE_EXTENSIONS };

/** The rule under which the auditor reports the limits of its OWN reading. A report that
 * silently covered less than it claimed would be the worst finding in it. */
export const SCOPE_RULE = 'audit-scope';

/** PURE. Files the port listed but could not hand over. @param {ReadonlyArray<string>} skipped
 * @returns {Draft[]} */
function scopeChecks(skipped) {
  if (skipped.length === 0) return [];
  return [draft({
    rule: SCOPE_RULE,
    status: 'WARNING',
    evidence: skipped.slice(0, 20),
    explanation: `${skipped.length} file(s) could not be read within this audit's budget, so no`
      + ' rule above covers them. Everything else in this report is about the files that were read.',
    action: 'reduce the size of those files, or audit them with the gates directly (npm run gates).',
  })];
}

/**
 * PURE. Every rule, in reporting order, with ids assigned and the summary computed.
 * @param {AuditInput} input @returns {AuditResult}
 */
export function runAudit(input) {
  const { model, files, listed, skipped, pkg, policies, evidence, head, at } = input;
  const newest = newestSource(listed);
  /** @type {Draft[]} */
  const drafts = [
    ...cellStateChecks(model),
    ...cellContractChecks(model),
    ...dependencyChecks(model),
    ...doneEvidenceChecks(model),
    ...sizeChecks(files, policies.sizeExceptions),
    ...secretChecks(files, policies.secretsAllowlist),
    ...depsChecks({ pkg, files, policy: policies.allowedDependencies }),
    ...boundaryChecks(files),
    ...acceptanceChecks(files),
    ...legChecks(evidence),
    ...freshnessChecks(evidence, {
      head,
      newestSourceMs: newest === null ? null : newest.modifiedMs,
      ...(newest === null ? {} : { newestSourcePath: newest.path }),
    }),
    ...policyChecks(policies.unreadable),
    ...scopeChecks(skipped),
  ];
  const findings = assignIds(drafts);
  return { at, findings, summary: summarise(findings) };
}
