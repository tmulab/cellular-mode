# Cell: hardening-docs
**ID:** hardening-docs
**Area:** stage-8
**Opened:** 2026-10-07 · **Status:** ✔
**Objective:** Stage 8 Cell 8: beginner path that works as written (8 steps), docs/11 and docs/12 consistent (A-10), restore Cell 2+5 doc facts lost in the Cell 6 incident, DOC-decision items, README onboarding, report sections
**Boundary:** in: docs/11, docs/12, README, FINAL-VERIFICATION, prompt-builder/CONTRACTS.md, bootstrap/CONTRACTS.md, ADOPTION_HARDENING_REPORT.md sections | NOT in: code changes
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** documented beginner path matches CLI behaviour (each command checked against usage/help); docs gates green
**Last fact:** Docs: 8-step beginner path at top of docs/12 (verified end to end in a scratch target: final verification passed), docs/11 aligned (new-project path no longer starts with cellmode init; Builder-without-Bootstrap kept as alternative), README pointer (net-zero), restored H1/H2/H5/B-12 facts lost in the incident, DOC items A-17/A-12/B-10/B-14/B-02/B-01/A-16, prompt-builder/CONTRACTS.md question list with scope in/out. Corrected docs: gitignore-block is not offered on an empty new target (approve hooks,first-cell); Builder --root must follow the command; cellmode open quoting.
**Build/typecheck:** focused docs tests 17/17; gates clean
**Decisions:** New finding not from the trial: Builder CLI with --root before the command prints usage and exits 0 (silent). Out of frozen scope: recorded as deferred, not fixed.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
