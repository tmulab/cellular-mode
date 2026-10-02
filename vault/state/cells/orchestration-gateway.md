# Cell: Orchestration gateway
**ID:** orchestration-gateway
**Area:** eip/orchestration
**Opened:** 2026-10-02 · **Status:** ✔
**Objective:** Agents reach plugins only through allow-listed capabilities with human approval
**Boundary:** in: gateway, audit | NOT in: planners, multi-agent workflows (PROPOSED)
**Inputs:** — · **Outputs:** —
**Allowed operations:** — · **Prohibited operations:** —
**Dependencies:** —
**Done criterion (binary):** ACCEPTANCE G1-G7 green
**Last fact:** eip/orchestration/{gateway,index,doubles}.mjs + tests + README; mutations G1,G5,G3 red; G3 false green found and closed with a new test; npm test 249 pass 0 fail 1 skipped; gates exit 0
**Build/typecheck:** green
**Decisions:** agent-supplied approval is stripped; workflow coordination stays PROPOSED
**Open issues:** —
**Minimal context (≤5 lines):** —

## ➜ NEXT STEP (doable in <5 min, without thinking)
—
