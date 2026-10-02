# Relaxations

The constitution allows project policy to STRENGTHEN a rule freely. Weakening one is
different: it must be explicit, justified, documented here, and approved by the
responsible human. An undocumented relaxation is the failure mode this file exists to
prevent, so an empty list is the healthy state and every entry below is a debt.

Status values: `PENDING HUMAN APPROVAL` · `APPROVED <name> <date>` · `WITHDRAWN` ·
`ACCEPTED (development only) <name> <date> — release-blocking`. Only `APPROVED` and
`WITHDRAWN` count as resolved; everything else, including a status this file invents
later, is a release blocker by construction (`tools/gates/release.mjs`).

## Release blockers

Run `node tools/gates/check-all.mjs --release` for the current, machine-checked
answer. Exit 2 means "not release-ready". As measured on 2026-10-02:

1. **R-1 — typecheck is UNAVAILABLE.** **Resolved on 2026-10-02, not a blocker.** The
   proposal was approved and carried out: `typescript@5.9.3` and `@types/node@24.19.1`
   as pinned devDependencies, a `jsconfig.json` with `checkJs` and the four strict
   flags, and **0 errors** across all 100 modules including the tests. Both gate ids
   (`release:typecheck-unavailable`, `release:relaxation-unresolved`) are clear.
2. **R-2 — pending secret-scan exceptions.** **Resolved, not a blocker.** All four
   entries were measured unnecessary and deleted; `policy/secrets-allowlist.json`
   is now `[]` and the pending count is 0. Review: [secrets-review.md](secrets-review.md).
3. **Attribution and licence decisions** — resolved by the author on 2026-10-02
   ([THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md),
   [MIGRATION_REPORT.md](../MIGRATION_REPORT.md) §7); not a blocker.

Two transient gate failures were seen mid-verification and were green again by the
end of the same session (`README.md` at 202 lines; `SECURITY.md` pointing at a
`RELEASE_CHECKLIST.md` that did not exist yet). Both were in-flight edits from a
concurrent documentation cell, not relaxations — nobody granted them, so neither
gets an entry below. Recorded because a blocker that fixes itself while you are
writing it down is still a thing that happened.

---

## R-1 — typecheck reported as UNAVAILABLE instead of failing the build

**The four bullets below are HISTORY**, kept verbatim: they are what this project said
while the relaxation stood, and deleting them would hide the reasoning that was later
measured and overturned. The current state is the `Status` line and the three bullets
after it.

- **Rule relaxed:** Trilateral Verification requires three independent gates after
  every significant change, each reported as a pass or a failure.
- **What we do instead:** `tools/gates/trilateral.mjs` prints
  `⚠️ typecheck: UNAVAILABLE — no TypeScript toolchain (UNKNOWN); syntax-only check:
  N files OK` and the process still exits 0 when build and tests are green.
- **Justification:** the project is zero-dependency by design, so there is no type
  checker to run and installing one would break a stronger commitment. A syntax pass
  with `node --check` runs in its place. The leg is never printed as `✅`, the
  epistemic label is `UNKNOWN`, and the gate re-enables itself automatically: if a
  `tsconfig.json` or `jsconfig.json` appears and `tsc` resolves on PATH, the real
  `tsc --noEmit -p .` runs with no edit to the gate.
- **Residual risk:** type correctness is unverified. Contracts are enforced at
  runtime by validators and by tests, not by a compiler. Syntax is not types.
- **Alternatives considered:** (a) add TypeScript as a devDependency — rejected, it
  trades a documented UNKNOWN for a broken zero-dependency claim; (b) exit non-zero
  so the leg is never ignored — rejected, it would make every green change red and
  train people to pass `--force`; (c) print `✅` — rejected, that is the dishonest
  option this rule was written against.
- **Status:** WITHDRAWN
- **How it was resolved (2026-10-02):** real typecheck enabled (tsc 5.9.3, checkJs,
  four strict flags), 0 errors. The relaxation no longer describes this project: the
  leg is a `✅` with an error count, not a `⚠️` with a label.
- **What that cost, measured:** two devDependencies, pinned exactly and justified in
  [allowed-dependencies.json](allowed-dependencies.json); one `jsconfig.json`; and
  **1038 type errors on the first run**, every one of them fixed with JSDoc, a
  narrowing guard or a named type — no `any`, no `@ts-ignore`, no `@ts-nocheck`, no
  flag loosened and no file excluded. Five `@ts-expect-error` lines remain, each in a
  test that deliberately violates a contract, each with its reason on the same line
  (`word-count.test.mjs` x2, `events.test.mjs`, `write-port.test.mjs`,
  `gateway.test.mjs`).
  The "zero dependencies" claim is now stated as zero **runtime** dependencies, out
  loud, in `README.md` and `THIRD_PARTY_NOTICES.md`: a claim that quietly becomes
  false is worse than one narrowed in public.
- **What replaced the alternatives:** (a) was the chosen path after all, because the
  cost was measured rather than assumed; (b) and (c) were never needed — the leg now
  exits non-zero on a real failure, which is what (b) wanted, without the `--force`
  habit, because the failure is an error count a reader can act on.
- **Review trigger:** none outstanding. A future proposal to add a third
  devDependency starts a new entry, not this one.

## R-2 — secret allowlist entries approved by the author of the gate

- **Rule relaxed:** every allowlist entry needs an approver.
- **What we do instead:** the four entries in `policy/secrets-allowlist.json` are
  recorded with `approvedBy: "PENDING HUMAN APPROVAL"`. They cover the scanner, its
  test, its own policy file and its README — files whose job is to describe
  credential shapes in prose.
- **Justification offered:** without them the scanner reports its own rule book. The
  entries were narrow (four exact paths, no directories) and covered no file where a
  real credential could plausibly live.
- **What the review found (2026-10-02):** the justification was never tested. Run
  with the allowlist replaced by `[]`, the scanner reports **0 findings** across
  213 files and 8 rules — and 0 for each of the four paths individually, including
  the 26-line version of the allowlist that still carried all four entries. A
  seeded positive control does fire, so the zero is a measurement, not a vacuous
  pass. The fragment-assembly technique in `secrets.mjs` already prevents
  self-flagging; the entries were redundant.
- **Action taken:** all four entries **deleted**. `policy/secrets-allowlist.json`
  is the empty array and the project holds zero secret-scan exceptions. No narrower
  form was needed, so no line-scoped or hash-scoped entry was added to the gate —
  untested machinery for a case that does not exist. Full review, file by file:
  [secrets-review.md](secrets-review.md).
- **Also added, because this must never be silent again:** every `npm run gates`
  run prints the pending-exception count (`✅ pending exceptions: 0`, or `⚠️` with
  one addressed line per entry), pending entries stay honoured for development, and
  `check-all.mjs --release` exits 2 on any of them. Pure rules in
  `tools/gates/release.mjs`, tests in `tests/gates-release.test.mjs`.
- **Status:** WITHDRAWN
- **Review trigger:** any request to add a first entry back — it must arrive with
  the measurement that proves it is needed.

## R-3 — one-time redaction of an append-only log entry

- **Rule relaxed:** Article 6 / state protocol — `vault/state/log.md` is append-only.
- **What:** in the 2026-10-02 "Stage 2 inspection" entry (and its projection
  `vault/state/cells/stage-2-inspection.md`), names and internal paths of the author's
  private repositories were replaced by generic wording before the first commit. The
  facts, counts and decisions are otherwise unchanged; no other entry was touched.
- **Why:** the commit must not include private project data; the entry was written by
  the agent during inspection, before that requirement was applied to the vault.
- **Record:** the redaction itself is logged as the "Log redaction" cell entry.
- **Status:** APPROVED Hudson A. R. Bonomo 2026-10-02
- **Review trigger:** none — a one-time exception; it grants no standing permission.
