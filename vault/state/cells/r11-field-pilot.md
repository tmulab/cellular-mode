# Cell: R11 field pilot
**ID:** r11-field-pilot
**Area:** field
**Opened:** 2026-10-25 · **Status:** ✔
**Objective:** Bring the field project from Cellular Mode 1.0.0 to the v2 method through bootstrap upgrade, revise its D1 policy to operations with parallel cells, reconcile 22-23/10 in its log, and make its light gate data-aware
**Boundary:** in: the field project repository: files bootstrap upgrade replaces or adds, vault/policy.md D1 section, one appended reconciliation entry in its vault/state/log.md, tools/gates/related-tests.mjs | NOT in: the field repository's application code, databases, deploys, any destructive git operation, pushes, cellular-mode code
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** upgrade dry-run shown and approved by the human before --confirm; bootstrap status healthy after; field cellmode check green; reconciliation entry appended, never a rewrite; light gate turns red on a JSON that breaks a test (the 22/10 case); field typecheck and tests green; every write in the field repo approved by the human
**Last fact:** Field pilot of the v2 method on the field project (2026-10-25), every write approved by the human step by step: bootstrap upgrade --keep-modified from c96448c (15 replaced, 18 added, 1 skeleton; 8 adopter-changed gate and hook files kept as the project's own); v2 AGENTS.md (28 lines changed); D1 policy revised for operations with parallel cells, worktrees outside the repo, generated panel; a [reconstructed] reconciliation of 22-23/10 appended to its log (earlier bytes unchanged by hash); data-aware light gate (a staged file under cursos/ runs the 58 unit tests that read it, fails closed with no reader; 4 pure tests). Field typecheck, 3077 unit tests, build and verify:final green; e2e 447 passed after one intermittent push-gate failure; field commit 0e6d23a pushed, field CI green.
**Build/typecheck:** green in the field (typecheck, unit tests, build, verify:final, e2e, CI); cellular-mode unchanged except the vault; verify:final next
**Decisions:** Upgrade keeps adopter-modified files instead of overwriting them (new --keep-modified); generated AGENTS.md updated by hand because upgrade never re-renders it; red case of the new light gate with a broken JSON not run in the field (INFERRED from R9)
**Open issues:** field e2e intermittent once (cause UNKNOWN) and the field push evidence summary is useless ("> test:e2e") — sanitizeSummary should keep the Playwright tally; red case of the field light gate with a broken JSON not run (INFERRED from R9); field AGENTS.md and .gitignore drift predates the upgrade; bootstrap template still renders v1 rules (parked)
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
