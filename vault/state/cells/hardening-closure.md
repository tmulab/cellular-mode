# Cell: hardening-closure
**ID:** hardening-closure
**Area:** stage-8
**Opened:** 2026-10-08 · **Status:** ✔
**Objective:** Stage 8 closure: fix the three public-path mismatches found by the repeated trials (A2-01 git init missing, B-07 install advice, A2-05 acceptance question) and complete ADOPTION_HARDENING_REPORT.md
**Boundary:** in: docs/12, install summary text in tools/bootstrap, acceptance question text in tools/prompt-builder, tests asserting them, ADOPTION_HARDENING_REPORT.md | NOT in: any other fix (deferred list)
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** fixes with tests; report complete; rehearsals x3 + verify:final once green
**Last fact:** Post-trial fixes: A2-01 beginner path now starts with git init (docs/12 step 0, docs/11 and README pointers; verified: without git init the approval list is first-cell and ci-workflow only, with it hooks too and verify-final installed); B-07/B2-02 install text points to the verification CLI and never advises hand edits (test strengthened); A2-05 acceptance question asks for checks a command or test decides (test added). ADOPTION_HARDENING_REPORT.md completed (171 lines: fixes, usability, docs, deferred, unknowns, security, trial 1 vs 2 metrics, observed behaviour). Redaction authorized by the human on 2026-10-08: three earlier log entries (Cell 9 pause and completion) and the hardening-trial-2 cell file contained an absolute temporary trial path written by the lead session by mistake; only that path prefix was replaced with <trial-root>, wording otherwise unchanged; original kept outside the repository.
**Build/typecheck:** targeted: prompt-builder 185/185, bootstrap verification 14/14, docs 11/11, leaks 6/6; trilateral before redaction 1477/1478 (the leaks failure now fixed)
**Decisions:** Minimal human-approved exception to append-only for the path prefix only; leaks gate unchanged.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
