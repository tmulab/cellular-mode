# Cell: R11 field pilot
**ID:** r11-field-pilot
**Area:** field
**Opened:** 2026-10-25 · **Status:** ⏸
**Objective:** Bring the field project from Cellular Mode 1.0.0 to the v2 method through bootstrap upgrade, revise its D1 policy to operations with parallel cells, reconcile 22-23/10 in its log, and make its light gate data-aware
**Boundary:** in: the field project repository: files bootstrap upgrade replaces or adds, vault/policy.md D1 section, one appended reconciliation entry in its vault/state/log.md, tools/gates/related-tests.mjs | NOT in: the field repository's application code, databases, deploys, any destructive git operation, pushes, cellular-mode code
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** upgrade dry-run shown and approved by the human before --confirm; bootstrap status healthy after; field cellmode check green; reconciliation entry appended, never a rewrite; light gate turns red on a JSON that breaks a test (the 22/10 case); field typecheck and tests green; every write in the field repo approved by the human
**Last fact:** Field read-only and upgrade dry-run done (zero writes): 34 paths to write, 8 adopter-modified installed files make upgrade refuse the whole run. Human chose (a) on 2026-10-25: first teach upgrade to keep adopter-modified files, then a new dry-run.
**Build/typecheck:** not applicable (no code changed in this cell)
**Decisions:** —
**Open issues:** human decision: (a) teach upgrade to keep adopter-modified files (new method cell) or (b) release the 8 files and reinstall, redoing the field light gate by hand
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
After the upgrade --keep cell is done and committed, rerun bootstrap upgrade on the field repo with --dry-run and the keep option and show the exact plan to the human
