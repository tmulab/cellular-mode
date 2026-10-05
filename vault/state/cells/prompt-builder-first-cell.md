# Cell: prompt-builder-first-cell
**ID:** prompt-builder-first-cell
**Area:** stage-6
**Opened:** 2026-10-04 · **Status:** ✔
**Objective:** Stage 6 Cell 4: first-cell generation (prepare) and approval workflow that creates a planned cell via cellmode plan; never activates
**Boundary:** in: tools/prompt-builder first-cell + accept modules + tests | NOT in: prompts, CLI, skills, activation
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** first-cell modules tested; trilateral + verify:final green
**Last fact:** First-cell modules: sanitize (inertText), first-cell(+parts), first-cell-preview, accept, store-cells. acceptFirstCell creates a planned cell via cellmode cmdPlan + readCell/writeCell (no log entry, no activation); cmdOpen preserves drafted fields (VERIFIED by test). +13 tests; mutation (planned->active status) went red then restored.
**Build/typecheck:** trilateral green: typecheck 0 errors, 208 modules load, tests 1160/1160; gates clean
**Decisions:** Classification order: blocking conflict/objective blocker -> discovery; no approved tech or pending decision -> architecture; scope blocker -> discovery; else implementation. Second disk module store-cells.mjs (writes only one planned cell). CONTRACTS.md amended.
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
