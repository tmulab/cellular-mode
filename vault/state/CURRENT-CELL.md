# Operation: Revisao v2 ate R10b · 🔵 · spend —/—
Finish line: 1. R4b conflicts between cells · 2. R5 new check findings · 3. R6 operation and worker skills · 4. R7 generated map · 5. R8 observer operation view · 6. R9 data-aware light gate · 7. R10 swarm rehearsal · 8. R10b bootstrap upgrade

# Cell: R10 swarm rehearsal
**ID:** r10-swarm-rehearsal
**Area:** tools-cellmode
**Opened:** 2026-10-24 · **Status:** 🔵
**Operation:** Revisao v2 ate R10b
**Base commit:** 9d0f3ba14905fa646141e822051acc93c6bca3cb
**Objective:** A test that replays 22-23/10 on a temp vault and proves the finish line does not move. Conflicts named: none active
**Boundary:** in: new tools/cellmode/rehearsal-swarm.test.mjs (<= 200) and, only if needed, a fixture helper tools/cellmode/rehearsal-fixture.mjs | NOT in: every existing module and test, docs, skills, vault/**
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** node --test runs the rehearsal: op open with 5 finish-line items, pack with max-active-cells and a denied list, 10 planned cells; open up to the ceiling, refuse the next with exit 3; an overlapping boundary refused; an unplanned cell refused then amended; closes with spend and discoveries parked; finish-line fingerprint identical at the end; check green; report deterministic; op complete refused with an active cell and accepted after; the full suite green; verify:final green
**Last fact:** —
**Build/typecheck:** —
**Decisions:** —
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
Read conflicts.test.mjs, cell-in-operation.test.mjs and report.test.mjs and reuse their temp-root and git helpers
