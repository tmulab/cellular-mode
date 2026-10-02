# Cell: Kernel
**ID:** kernel
**Area:** eip/kernel
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Minimal kernel: register, load, lazy inject, reversible effects, execute with approval/cancel/timeout, events
**Boundary:** in: registry, lifecycle, execute, events | NOT in: HTTP, UI, orchestration
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** ACCEPTANCE.md K1-K14 green with mutation proofs
**Last fact:** eip/kernel/{events,registry,lifecycle,execute,index,doubles}.mjs + ACCEPTANCE.md (written before code); 47 tests; mutations K6,K8,K9,K10,K13 observed red then restored; npm test 204/204
**Build/typecheck:** green
**Decisions:** required deps registered at load, loaded lazily at call; dispose refuses with DEPENDENCY_IN_USE (no cascade); undeclared ports invisible; approval fail-closed; no stack in results
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
