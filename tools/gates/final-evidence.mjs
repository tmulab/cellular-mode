// final-evidence.mjs — PURE. The shape of a FINAL-VERIFICATION record, and the decision
// of whether a run authorizes completion.
//
// Article 8 requires the evidence to be recorded WITHOUT modifying the verified files.
// That is a circularity if the record lives inside the state it describes: writing the
// evidence would change the fingerprint the evidence claims. The way out is the one used
// here — the record lives OUTSIDE the controlled set (`.cellular/` is gitignored, so
// fingerprint.mjs never sees it) and is linked back to the state by the cryptographic
// fingerprint plus the git tree id. Outside, but not detached.
//
// APPEND-ONLY, like the vault: the file is JSON Lines and a run adds one line. A failed
// run is recorded too, with `ok: false`; what a failure must never produce is an
// authorization, and `ok` is the only thing the authorization check reads.
//
// FAIL CLOSED: `parseFinalRecord` answers `null` for anything it does not fully recognise.

/** @typedef {{ name: string, exit: number, summary: string }} CheckRecord */
/** @typedef {{ schema: string, at: string, fingerprint: string, tree: string,
 *   head: string | null, checks: CheckRecord[], ok: boolean, reason: string,
 *   after?: string }} FinalRecord */

/** The one path a final-verification record may live at, repository-relative. */
export const FINAL_EVIDENCE_PATH = '.cellular/evidence/final-verification.jsonl';

/** The directory segments of that path, for a caller that must not split strings. */
export const FINAL_EVIDENCE_SEGMENTS = Object.freeze(['.cellular', 'evidence']);

/** The file name inside those segments. */
export const FINAL_EVIDENCE_FILE = 'final-verification.jsonl';

/** Bumped only when the record shape changes incompatibly; an unknown version is refused. */
export const FINAL_EVIDENCE_SCHEMA = 'cellular-final-verification/1';

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;

/** A machine-local absolute path has no business in a record that may be read, quoted or
 * pasted elsewhere; the repository's own leak gate scans this file like any other. Two
 * shapes are redacted — a Windows drive path and a POSIX home path — after the known root
 * is folded to `.`.
 * @param {unknown} text @param {string} [root] @returns {string} */
export function sanitizeSummary(text, root = '') {
  let out = String(text ?? '').replace(/\r/g, '');
  if (root !== '') {
    for (const form of [root, root.split('\\').join('/')]) {
      out = out.split(form).join('.');
    }
  }
  out = out.replace(/[A-Za-z]:[\\/][^\s"'<>|]*/g, '<path>');
  out = out.replace(/\/(?:Users|home|root)\/[^\s"'<>|]*/g, '<path>');
  const line = out.split('\n').map((l) => l.trim()).filter((l) => l !== '')[0] ?? '';
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

/**
 * PURE. The decision Article 8 step 8 describes: completion is authorized only when every
 * mandatory check passed AND the fingerprint taken before the suite still holds after it.
 * Both halves are reported, because a run can fail both ways at once and a reader needs
 * to know that.
 * @param {{ checks: ReadonlyArray<{ name: string, exit: number }>,
 *   before: string, after: string }} input @returns {{ ok: boolean, reason: string }} */
export function verdict({ checks, before, after }) {
  /** @type {string[]} */
  const reasons = [];
  const failed = checks.filter((check) => check.exit !== 0);
  if (checks.length === 0) reasons.push('no mandatory check ran — an empty suite is never a pass');
  if (failed.length > 0) {
    reasons.push(`failed check(s): ${failed.map((c) => `${c.name} (exit ${c.exit})`).join(', ')}`);
  }
  if (before !== after) reasons.push('the controlled state changed during verification');
  if (reasons.length > 0) return { ok: false, reason: reasons.join(' · ') };
  return { ok: true, reason: `${checks.length} mandatory check(s) passed on an unchanged state` };
}

/**
 * PURE. Builds the record for what a run ACTUALLY observed. `after` is present only when
 * it differs from `fingerprint`, so its presence is itself the statement "the state moved".
 * @param {{ at: string, fingerprint: string, tree: string, head: string | null,
 *   checks: ReadonlyArray<CheckRecord>, ok: boolean, reason: string, after?: string }} input
 * @returns {FinalRecord} */
export function finalRecord(input) {
  const { at, fingerprint, tree, head, checks, ok, reason } = input;
  return {
    schema: FINAL_EVIDENCE_SCHEMA,
    at,
    fingerprint,
    tree,
    head: typeof head === 'string' && head !== '' ? head : null,
    checks: checks.map((c) => ({ name: c.name, exit: c.exit, summary: c.summary })),
    ok,
    reason,
    ...(input.after === undefined || input.after === fingerprint ? {} : { after: input.after }),
  };
}

/** @type {(value: unknown) => CheckRecord | null} */
function parseCheck(value) {
  if (value === null || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const name = raw['name'];
  const exit = raw['exit'];
  if (typeof name !== 'string' || name === '') return null;
  if (typeof exit !== 'number' || !Number.isInteger(exit)) return null;
  return { name, exit, summary: typeof raw['summary'] === 'string' ? raw['summary'] : '' };
}

/**
 * PURE. A parsed record, or `null` when the value is not one this build understands.
 * @param {unknown} value already-parsed JSON (the caller owns the file read)
 * @returns {FinalRecord | null} */
export function parseFinalRecord(value) {
  if (value === null || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  if (raw['schema'] !== FINAL_EVIDENCE_SCHEMA) return null;
  const at = raw['at'];
  const fingerprint = raw['fingerprint'];
  const tree = raw['tree'];
  const ok = raw['ok'];
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof fingerprint !== 'string' || !HEX64.test(fingerprint)) return null;
  if (typeof tree !== 'string' || !HEX40.test(tree)) return null;
  if (typeof ok !== 'boolean') return null;
  const rawChecks = raw['checks'];
  if (!Array.isArray(rawChecks)) return null;
  /** @type {CheckRecord[]} */
  const checks = [];
  for (const entry of rawChecks) {
    const check = parseCheck(entry);
    if (check === null) return null;
    checks.push(check);
  }
  const head = raw['head'];
  const after = raw['after'];
  return {
    schema: FINAL_EVIDENCE_SCHEMA,
    at,
    fingerprint,
    tree,
    head: typeof head === 'string' && HEX40.test(head) ? head : null,
    checks,
    ok,
    reason: typeof raw['reason'] === 'string' ? raw['reason'] : '',
    ...(typeof after === 'string' && HEX64.test(after) ? { after } : {}),
  };
}

/** PURE. Every record a JSON Lines file holds, newest last. An unreadable or unknown line
 * is SKIPPED rather than fatal: the file is append-only and a truncated last write must not
 * make the whole history unreadable. A skipped line can never authorize anything.
 * @param {unknown} text @returns {FinalRecord[]} */
export function parseRecords(text) {
  /** @type {FinalRecord[]} */
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const record = parseFinalRecord(JSON.parse(trimmed));
      if (record !== null) out.push(record);
    } catch {
      continue;
    }
  }
  return out;
}

/** PURE. The newest record that AUTHORIZES this exact fingerprint, or `null`.
 * @param {ReadonlyArray<FinalRecord>} records @param {string} fingerprint
 * @returns {FinalRecord | null} */
export function findAuthorization(records, fingerprint) {
  if (typeof fingerprint !== 'string' || !HEX64.test(fingerprint)) return null;
  const matches = records.filter((r) => r.ok && r.fingerprint === fingerprint);
  return matches[matches.length - 1] ?? null;
}

/** PURE. The newest record that authorizes this exact git tree, or `null`. Used by the
 * hooks, which can only see what git is about to record.
 * @param {ReadonlyArray<FinalRecord>} records @param {string} tree
 * @returns {FinalRecord | null} */
export function findTreeAuthorization(records, tree) {
  if (typeof tree !== 'string' || !HEX40.test(tree)) return null;
  const matches = records.filter((r) => r.ok && r.tree === tree);
  return matches[matches.length - 1] ?? null;
}

/** PURE. The commit trailer that links a commit to the state that was verified.
 * @param {FinalRecord} record @returns {string} */
export function trailerFor(record) {
  return `Verified-State: sha256:${record.fingerprint} tree:${record.tree}`;
}
