# Operation: Revisao v2 ate R10b · 🔵 · spend —/0
Finish line: 1. R4b conflicts between cells · 2. R5 new check findings · 3. R6 operation and worker skills · 4. R7 generated map · 5. R8 observer operation view · 6. R9 data-aware light gate · 7. R10 swarm rehearsal · 8. R10b bootstrap upgrade

| Cell | Area | Base commit | Next step |
|---|---|---|---|
| R9 data-aware light gate | gates | 85d4095080a2b62e56de6ef31a0640f73af7bc10 | Read tools/gates/README.md and rule 4 in AGENTS.md, write the criterion for 'a test that reads a data file' before coding |
| R6 operation and worker skills | skills | 85d4095080a2b62e56de6ef31a0640f73af7bc10 | List the tests that read skill texts and what each pins |
| R10b bootstrap upgrade | bootstrap | 85d4095080a2b62e56de6ef31a0640f73af7bc10 | Read status-ownership.mjs, install-manifest.mjs and writer-evolving.mjs and write how status decides each ownership class |
| R8 observer operation view | observer | 85d4095080a2b62e56de6ef31a0640f73af7bc10 | Read observer-state/model.mjs and the observer acceptance test and write where the operation enters the model without changing the API contract |

# Cell: R8 observer operation view
**ID:** r8-observer-operation-view
**Area:** observer
**Opened:** 2026-10-24 · **Status:** 🔵
**Operation:** Revisao v2 ate R10b
**Base commit:** 85d4095080a2b62e56de6ef31a0640f73af7bc10
**Objective:** Observer shows the active operation and its active cells. Conflicts named: imports tools/cellmode read-only (R4b/R5 may change check later); no write port
**Boundary:** in: eip/host/read-port.mjs, eip/plugins/observer-state/**, eip/plugins/observer-audit/**, apps/observer/** | NOT in: tools/cellmode/**, any write port, vault/**, three vendor bytes
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** state reads operations/*.md via parseOperationFile; the view shows the operation header and active-cells table; audit no longer flags two active cells inside an operation; acceptance tests green, still loopback-only and read-only
**Last fact:** —
**Build/typecheck:** —
**Decisions:** —
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
Read observer-state/model.mjs and the observer acceptance test and write where the operation enters the model without changing the API contract
