# Cell: Bootstrap upgrade keeps adopter files
**ID:** bootstrap-upgrade-keeps-adopter-files
**Area:** bootstrap
**Opened:** 2026-10-25 · **Status:** ✔
**Objective:** upgrade can keep immutable files the adopter changed instead of refusing the whole run, recording them as the project's own in the manifest (needed by R11)
**Boundary:** in: tools/bootstrap/upgrade*.mjs and their tests, tools/bootstrap/usage.mjs, tools/bootstrap/main.mjs only for flag wiring, docs/12-bootstrap.md | NOT in: status/uninstall semantics except what the new manifest marking implies, tools/cellmode/**, any real repository, vault/**
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** without the flag nothing changes (refusal stays, existing tests untouched); with --keep-modified the modified files are left byte-identical, listed in the plan as kept, and after --confirm recorded in the manifest so status reports them as the project's (not drift) and uninstall never removes them; the rest of the plan applies as before; dry-run writes zero bytes; tests for each; docs/12 <= 200 lines; node --test green; verify:final green
**Last fact:** bootstrap upgrade gained --keep-modified: an adopter-changed immutable file is no longer a refusal; it is left byte-identical, listed under the plan section kept, and after --confirm recorded as created:false, mode reference, its current hash, a limitation sentence and the approval 'upgrade --confirm --keep-modified', so status counts it healthy, uninstall keeps it and a later upgrade leaves it alone. Without the flag the refusal is unchanged. Modules upgrade-plan 171, -record 110, -apply 143, -render 132, upgrade 156, main 200, usage 91; docs/12 195; 5 new tests. Also redacted the field project's private name from the R11 cell file (leaks gate).
**Build/typecheck:** green (typecheck clean; node --test 1604 pass / 0 fail / 0 skipped; gates clean; verify:final next)
**Decisions:** Reason recorded in the existing limitations and approvals fields instead of a new manifest key (closed key set); a kept file never receives method updates, stated in usage, plan and docs
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
