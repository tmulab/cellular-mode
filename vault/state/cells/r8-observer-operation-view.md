# Cell: R8 observer operation view
**ID:** r8-observer-operation-view
**Area:** observer
**Opened:** 2026-10-24 · **Status:** ✔
**Operation:** Revisao v2 ate R10b
**Base commit:** 85d4095080a2b62e56de6ef31a0640f73af7bc10
**Objective:** Observer shows the active operation and its active cells. Conflicts named: imports tools/cellmode read-only (R4b/R5 may change check later); no write port
**Boundary:** in: eip/host/read-port.mjs, eip/plugins/observer-state/**, eip/plugins/observer-audit/**, apps/observer/**, api/openapi.json (additive ObserverOverview fields only), tools/gates/allowlists.mjs (one entry, approved by the human 2026-10-24: operation-file.mjs is pure, node:crypto + fields + slug only; widened by the orchestrator under the human pack of 2026-10-24, because observer-http O15 validates overview against it) | NOT in: tools/cellmode/**, any write port, vault/**, three vendor bytes
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** state reads operations/*.md via parseOperationFile; the view shows the operation header and active-cells table; audit no longer flags two active cells inside an operation; acceptance tests green, still loopback-only and read-only
**Last fact:** Observer shows the operation: observer-state/operation.mjs (105) finds it through each cell's Operation field (no list port, O2 kept), model.mjs/views.mjs/schemas.mjs expose operation and activeCells, api/openapi.json gains both additively (plus ObserverPackBatch), audit test A21 for over-ceiling, apps/observer operation-view.mjs (124) and web/operation-area.mjs (97) render the header and active-cells table, hidden without an operation; read-port allows operations/<slug>.md read-only. 14 new tests. With the human's yes, tools/gates/allowlists.mjs lists tools/cellmode/operation-file.mjs among OBSERVER_PURE_IMPORTS (checked pure: node:crypto, fields, slug). Integrated from a worker worktree outside the repository, byte-identical copy.
**Build/typecheck:** green on main (typecheck clean; node --test 1577 pass / 0 fail / 0 skipped; gates clean; verify:final next)
**Decisions:** Gate allowlist entry approved by the human in conversation on 2026-10-24; an operation no cell references stays invisible to the Observer (documented)
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
