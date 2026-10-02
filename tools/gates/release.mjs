// release.mjs — release readiness, as a pure function over policy data.
//
// The other gates answer "is the code within the rules?". This one answers a
// different question: "is every documented exception and every relaxation actually
// resolved?" Those two are not the same, and conflating them is how a project ships
// with a warning nobody read.
//
// An exception honoured for a development run is useful; an exception honoured
// silently is a lie with a file name. So: pending entries stay honoured by the
// day-to-day gates (otherwise every change goes red and people learn to pass
// --force), they are PRINTED as ⚠️ with a count, and `check-all --release` fails on
// them. "Release-ready" becomes a command, not an opinion.
//
// FAIL CLOSED: a status this module does not recognise is UNKNOWN, and UNKNOWN is a
// blocker. Only APPROVED and WITHDRAWN resolve a relaxation.
/** @typedef {{ source: string, path: string, rule: string, approvedBy: string }} Pending */
/** @typedef {{ id: string, title: string, status: string }} Relaxation */
/** @typedef {{ id: string, detail: string }} Blocker */

const RESOLVED = /^(APPROVED|WITHDRAWN)\b/i;

/** A heading of the relaxations document: `## R-1 — title`. */
const HEADING = /^##\s+(R-\d+)\s*(?:[—-]\s*(.*))?$/;
const STATUS = /^-\s+\*\*Status:\*\*\s*(.+?)\s*$/;

/**
 * PURE. Is this `approvedBy` value an approval? Anything missing, empty or
 * starting with PENDING is not. The check is case-insensitive and trims, because
 * a loophole in a policy check is worse than no check.
 * @param {unknown} approvedBy @returns {boolean}
 */
export function isPending(approvedBy) {
  if (typeof approvedBy !== 'string') return true;
  const value = approvedBy.trim();
  return value === '' || /^PENDING\b/i.test(value);
}

/**
 * PURE. The entries of one policy file whose approver is still pending.
 * `source` travels with each entry so the report is an address.
 * @param {unknown} entries @param {string} source @returns {Pending[]}
 */
export function pendingApprovals(entries, source) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((/** @type {Record<string, unknown> | null} */ e) => e !== null && typeof e === 'object' && isPending(e.approvedBy))
    .map((/** @type {Record<string, unknown>} */ e) => ({
      source,
      path: typeof e.path === 'string' ? e.path : String(e.name ?? '(unnamed entry)'),
      rule: typeof e.rule === 'string' ? e.rule : '*',
      approvedBy: typeof e.approvedBy === 'string' ? e.approvedBy : 'MISSING',
    }));
}

/**
 * PURE. `[{ id, title, status }]` out of `policy/relaxations.md`. A section with no
 * status line gets `UNKNOWN` rather than being skipped: a relaxation that forgot to
 * say where it stands is exactly the case this gate exists for.
 * @param {unknown} text @returns {Relaxation[]}
 */
export function parseRelaxations(text) {
  /** @type {Relaxation[]} */
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const heading = HEADING.exec(line);
    if (heading) {
      out.push({ id: heading[1] ?? '', title: (heading[2] ?? '').trim(), status: 'UNKNOWN' });
      continue;
    }
    const status = STATUS.exec(line);
    const last = out[out.length - 1];
    if (status && last !== undefined && last.status === 'UNKNOWN') {
      last.status = status[1] ?? 'UNKNOWN';
    }
  }
  return out;
}

/** PURE. The relaxations that are neither APPROVED nor WITHDRAWN.
 * @param {ReadonlyArray<Relaxation>} relaxations @returns {Relaxation[]} */
export function unresolved(relaxations) {
  return relaxations.filter((r) => !RESOLVED.test(r.status));
}

/**
 * PURE. Everything that must be resolved before a public release, as
 * `[{ id, detail }]`. An empty array is the only release-ready answer.
 * @param {{ secretsAllowlist?: unknown, sizeExceptions?: unknown,
 *   allowedDependencies?: unknown, relaxationsText?: unknown,
 *   typecheckAvailable?: boolean }} [input] @returns {Blocker[]}
 */
export function releaseBlockers({
  secretsAllowlist = [],
  sizeExceptions = [],
  allowedDependencies = { allowed: [] },
  relaxationsText = '',
  typecheckAvailable = false,
} = {}) {
  /** @type {Blocker[]} */
  const blockers = [];
  if (!typecheckAvailable) {
    blockers.push({
      id: 'release:typecheck-unavailable',
      detail: 'R-1: no TypeScript toolchain resolves, so the typecheck leg is UNKNOWN'
        + ' — see policy/typecheck-proposal.md',
    });
  }
  const pending = [
    ...pendingApprovals(secretsAllowlist, 'policy/secrets-allowlist.json'),
    ...pendingApprovals(sizeExceptions, 'policy/size-exceptions.json'),
    ...pendingApprovals(/** @type {{ allowed?: unknown }} */ (allowedDependencies ?? {}).allowed,
      'policy/allowed-dependencies.json'),
  ];
  for (const p of pending) {
    blockers.push({
      id: 'release:pending-exception',
      detail: `${p.source}: ${p.path} (rule ${p.rule}) is honoured with approvedBy "${p.approvedBy}"`,
    });
  }
  for (const r of unresolved(parseRelaxations(relaxationsText))) {
    blockers.push({
      id: 'release:relaxation-unresolved',
      detail: `policy/relaxations.md: ${r.id} status "${r.status}" is neither APPROVED nor WITHDRAWN`,
    });
  }
  return blockers;
}
