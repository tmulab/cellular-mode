# Cell: R8 observer operation view
**ID:** r8-observer-operation-view
**Area:** observer
**Opened:** 2026-10-24 · **Status:** ⏸
**Operation:** Revisao v2 ate R10b
**Base commit:** 85d4095080a2b62e56de6ef31a0640f73af7bc10
**Objective:** Observer shows the active operation and its active cells. Conflicts named: imports tools/cellmode read-only (R4b/R5 may change check later); no write port
**Boundary:** in: eip/host/read-port.mjs, eip/plugins/observer-state/**, eip/plugins/observer-audit/**, apps/observer/**, api/openapi.json (additive ObserverOverview fields only; widened by the orchestrator under the human pack of 2026-10-24, because observer-http O15 validates overview against it) | NOT in: tools/cellmode/**, any write port, vault/**, three vendor bytes
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** state reads operations/*.md via parseOperationFile; the view shows the operation header and active-cells table; audit no longer flags two active cells inside an operation; acceptance tests green, still loopback-only and read-only
**Last fact:** Worker finished in its worktree (branch op/r8-observer at babc86e, outside the repository, uncommitted): observer-state reads operations/<slug>.md through each cell's Operation field (no list port), exposes operation and activeCells; overview and api/openapi.json gain both fields additively; audit test A21 for over-ceiling; apps/observer operation header and active-cells table, hidden when there is no operation; 14 new tests pass. Worktree suite 1532 / 1528 pass / 4 fail: 2 are the worktree .git file in the leaks scan, 2 are the boundaries gate refusing observer imports of tools/cellmode/operation-file.mjs, which is not in OBSERVER_PURE_IMPORTS of tools/gates/allowlists.mjs. Not integrated into main.
**Build/typecheck:** red in worktree (boundaries gate: observer import not allow-listed; leaks: worktree .git file); not run on main
**Decisions:** Gate allowlist change needs the human: the pack never changes a gate; work kept intact in the worktree
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
Ask the human whether to add tools/cellmode/operation-file.mjs to OBSERVER_PURE_IMPORTS in tools/gates/allowlists.mjs (a gate configuration change, outside the pack); on yes, copy the worktree diff into main, add the line, run the full suite and verify:final
