# Cell: R8 observer operation view
**ID:** r8-observer-operation-view
**Area:** observer
**Opened:** 2026-10-24 · **Status:** 🔵
**Operation:** Revisao v2 ate R10b
**Base commit:** 85d4095080a2b62e56de6ef31a0640f73af7bc10
**Objective:** Observer shows the active operation and its active cells. Conflicts named: imports tools/cellmode read-only (R4b/R5 may change check later); no write port
**Boundary:** in: eip/host/read-port.mjs, eip/plugins/observer-state/**, eip/plugins/observer-audit/**, apps/observer/**, api/openapi.json (additive ObserverOverview fields only; widened by the orchestrator under the human pack of 2026-10-24, because observer-http O15 validates overview against it) | NOT in: tools/cellmode/**, any write port, vault/**, three vendor bytes
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** state reads operations/*.md via parseOperationFile; the view shows the operation header and active-cells table; audit no longer flags two active cells inside an operation; acceptance tests green, still loopback-only and read-only
**Last fact:** —
**Build/typecheck:** —
**Decisions:** first worker blocked on a stale worktree base (8323c20); re-dispatched in a fresh worktree on babc86e; no list port (O2 pins port names), operations found through each cell file Operation field
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
Read observer-state/model.mjs and the observer acceptance test and write where the operation enters the model without changing the API contract
