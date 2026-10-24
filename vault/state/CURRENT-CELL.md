# Operation: Revisao v2 ate R10b · 🔵 · spend —/0
Finish line: 1. R4b conflicts between cells · 2. R5 new check findings · 3. R6 operation and worker skills · 4. R7 generated map · 5. R8 observer operation view · 6. R9 data-aware light gate · 7. R10 swarm rehearsal · 8. R10b bootstrap upgrade

# Cell: R7 generated map
**ID:** r7-generated-map
**Area:** tools-cellmode
**Opened:** 2026-10-24 · **Status:** 🔵
**Operation:** Revisao v2 ate R10b
**Base commit:** 0f39733de8bcc9181a41bc52f2ad9ec553ffb4af
**Objective:** The map the human reads is generated from the log, never written by hand. Conflicts named: none active
**Boundary:** in: new tools/cellmode/report*.mjs and tests, tools/cellmode/{commands,main,args,state,check-layer,check-operation}.mjs, tools/cellmode/README.md, AGENTS.md:19 and docs/02 truth lines | NOT in: eip/**, apps/**, skills/**, tools/gates/**, vault/** except the generated vault/state/map.svg written only by report in temp roots during tests
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** cellmode report writes vault/state/map.svg deterministically from log.md, INDEX.md and operations/ (same vault, same bytes): header with the active operation, finish line with each item's state, cells by status with the last fact, what is waiting on the human (paused cells' next steps, parked items mentioning the human), totals; map-stale finding when map.svg exists and its embedded source fingerprint differs from the current log; no map file means no finding; every file <= 200 lines; node --test green; verify:final green
**Last fact:** —
**Build/typecheck:** —
**Decisions:** —
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
Read state.mjs, operation-lookup.mjs, check-layer.mjs and the INDEX/log parsers and write which fields the map needs and where each comes from
